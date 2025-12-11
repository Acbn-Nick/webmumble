// Audio capture service with RNNoise noise suppression
// Captures microphone input, processes through RNNoise, sends PCM to backend

type AudioSendCallback = (pcmData: string) => void;

// RNNoise processes 480 samples (10ms at 48kHz) at a time
const RNNOISE_FRAME_SIZE = 480;

export class AudioCaptureService {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private onSendAudio: AudioSendCallback;
  private _isMuted: boolean = true;
  private isInitialized: boolean = false;

  // RNNoise state
  private rnnoiseModule: any = null;
  private rnnoiseState: number = 0;
  private inputBuffer: Float32Array = new Float32Array(RNNOISE_FRAME_SIZE);
  private inputBufferIndex: number = 0;
  private outputQueue: Float32Array[] = [];

  constructor(onSendAudio: AudioSendCallback) {
    this.onSendAudio = onSendAudio;
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Try to load RNNoise
      await this.initRNNoise();

      // Request microphone access with browser audio processing as fallback
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: !this.rnnoiseModule, // Use browser's if RNNoise failed
          autoGainControl: true,
        },
        video: false,
      });

      // Create audio context at Mumble's sample rate
      this.audioContext = new AudioContext({ sampleRate: 48000 });

      // Create source from microphone
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Use ScriptProcessorNode for audio processing
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      const self = this;

      this.processorNode.onaudioprocess = (event) => {
        if (self._isMuted) {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);
        let processedData: Float32Array;

        if (self.rnnoiseModule && self.rnnoiseState) {
          // Process through RNNoise
          processedData = self.processWithRNNoise(inputData);
        } else {
          // Pass through without RNNoise
          processedData = inputData;
        }

        // Voice activity detection - skip silence
        let maxAmp = 0;
        for (let i = 0; i < processedData.length; i++) {
          const amp = Math.abs(processedData[i]);
          if (amp > maxAmp) maxAmp = amp;
        }

        if (maxAmp < 0.008) {
          return; // Noise gate
        }

        // Convert Float32 to Int16 PCM
        const pcmData = new Int16Array(processedData.length);
        for (let i = 0; i < processedData.length; i++) {
          const s = Math.max(-1, Math.min(1, processedData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Convert to base64 and send
        const bytes = new Uint8Array(pcmData.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        self.onSendAudio(base64);
      };

      // Connect the audio graph
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isInitialized = true;
      console.log(`Audio capture initialized ${this.rnnoiseModule ? 'with RNNoise' : 'with browser noise suppression'}`);
      return true;
    } catch (error) {
      console.error('Failed to initialize audio capture:', error);
      return false;
    }
  }

  private async initRNNoise(): Promise<void> {
    try {
      // Dynamically import RNNoise WASM
      const rnnoise = await import('@jitsi/rnnoise-wasm');

      // Initialize the module
      if (rnnoise.default) {
        this.rnnoiseModule = await rnnoise.default();
      } else {
        this.rnnoiseModule = await rnnoise();
      }

      // Create RNNoise state
      if (this.rnnoiseModule._rnnoise_create) {
        this.rnnoiseState = this.rnnoiseModule._rnnoise_create();
        console.log('[RNNoise] Initialized successfully');
      } else {
        throw new Error('RNNoise create function not found');
      }
    } catch (error) {
      console.warn('[RNNoise] Failed to initialize, using browser noise suppression:', error);
      this.rnnoiseModule = null;
      this.rnnoiseState = 0;
    }
  }

  private processWithRNNoise(inputData: Float32Array): Float32Array {
    const output = new Float32Array(inputData.length);
    let outputIndex = 0;

    // Process any queued frames first
    while (this.outputQueue.length > 0 && outputIndex < output.length) {
      const frame = this.outputQueue.shift()!;
      const copyLen = Math.min(frame.length, output.length - outputIndex);
      output.set(frame.subarray(0, copyLen), outputIndex);
      outputIndex += copyLen;
      if (copyLen < frame.length) {
        // Put remainder back
        this.outputQueue.unshift(frame.subarray(copyLen));
      }
    }

    // Process input samples through RNNoise
    for (let i = 0; i < inputData.length; i++) {
      this.inputBuffer[this.inputBufferIndex++] = inputData[i];

      if (this.inputBufferIndex >= RNNOISE_FRAME_SIZE) {
        // Process frame through RNNoise
        const processedFrame = this.processRNNoiseFrame(this.inputBuffer);
        this.inputBufferIndex = 0;

        // Copy to output or queue
        const copyLen = Math.min(processedFrame.length, output.length - outputIndex);
        if (copyLen > 0) {
          output.set(processedFrame.subarray(0, copyLen), outputIndex);
          outputIndex += copyLen;
        }
        if (copyLen < processedFrame.length) {
          this.outputQueue.push(processedFrame.subarray(copyLen));
        }
      }
    }

    return output;
  }

  private processRNNoiseFrame(input: Float32Array): Float32Array {
    const output = new Float32Array(RNNOISE_FRAME_SIZE);

    try {
      // Allocate WASM memory
      const inputPtr = this.rnnoiseModule._malloc(RNNOISE_FRAME_SIZE * 4);
      const outputPtr = this.rnnoiseModule._malloc(RNNOISE_FRAME_SIZE * 4);

      // Scale to int16 range and copy to WASM heap
      const scaledInput = new Float32Array(RNNOISE_FRAME_SIZE);
      for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
        scaledInput[i] = input[i] * 32767;
      }
      this.rnnoiseModule.HEAPF32.set(scaledInput, inputPtr >> 2);

      // Process frame
      this.rnnoiseModule._rnnoise_process_frame(this.rnnoiseState, outputPtr, inputPtr);

      // Copy output and scale back
      const rnnoiseOutput = this.rnnoiseModule.HEAPF32.subarray(outputPtr >> 2, (outputPtr >> 2) + RNNOISE_FRAME_SIZE);
      for (let i = 0; i < RNNOISE_FRAME_SIZE; i++) {
        output[i] = rnnoiseOutput[i] / 32767;
      }

      // Free memory
      this.rnnoiseModule._free(inputPtr);
      this.rnnoiseModule._free(outputPtr);
    } catch (e) {
      console.error('[RNNoise] Frame processing error:', e);
      // Pass through on error
      output.set(input);
    }

    return output;
  }

  setMuted(muted: boolean): void {
    console.log(`[AudioCapture] setMuted: ${muted}`);
    this._isMuted = muted;

    // Also control media track
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  isMicMuted(): boolean {
    return this._isMuted;
  }

  destroy(): void {
    // Cleanup RNNoise
    if (this.rnnoiseModule && this.rnnoiseState) {
      try {
        this.rnnoiseModule._rnnoise_destroy(this.rnnoiseState);
      } catch (e) {
        console.warn('[RNNoise] Cleanup error:', e);
      }
      this.rnnoiseState = 0;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isInitialized = false;
  }
}
