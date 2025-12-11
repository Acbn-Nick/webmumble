// Audio playback service using Web Audio API
// Handles incoming PCM audio from Mumble users with proper jitter buffering

interface AudioPacket {
  userId: string;
  userName: string;
  data: string; // base64 encoded PCM
  sampleRate: number;
}

interface UserAudioStream {
  lastActivity: number;
  nextPlayTime: number;
  gainNode: GainNode;
}

export class AudioPlaybackService {
  private audioContext: AudioContext | null = null;
  private userStreams: Map<string, UserAudioStream> = new Map();
  private onTalkingChange: (userId: string, isTalking: boolean) => void;
  private isPlaying: boolean = true;
  private masterGain: GainNode | null = null;
  private talkingCheckInterval: number | null = null;

  // Jitter buffer settings
  private readonly BUFFER_DELAY = 0.06; // 60ms initial buffer delay
  private readonly SAMPLE_RATE = 48000;

  constructor(onTalkingChange: (userId: string, isTalking: boolean) => void) {
    this.onTalkingChange = onTalkingChange;
  }

  async initialize(): Promise<void> {
    if (this.audioContext) return;

    this.audioContext = new AudioContext({ sampleRate: this.SAMPLE_RATE });
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);

    // Resume audio context (required due to browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Periodically check for users who stopped talking
    this.talkingCheckInterval = window.setInterval(() => {
      this.checkTalkingStates();
    }, 100);
  }

  setVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  setMuted(muted: boolean): void {
    this.isPlaying = !muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 1;
    }
  }

  handleAudioPacket(packet: AudioPacket): void {
    if (!this.audioContext || !this.isPlaying || !this.masterGain) return;

    try {
      // Decode base64 to bytes
      const binaryString = atob(packet.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert bytes to Int16 samples
      const int16Samples = new Int16Array(bytes.buffer);

      // Convert Int16 to Float32 (-1.0 to 1.0)
      const floatSamples = new Float32Array(int16Samples.length);
      for (let i = 0; i < int16Samples.length; i++) {
        floatSamples[i] = int16Samples[i] / 32768.0;
      }

      // Get or create user stream
      let stream = this.userStreams.get(packet.userId);
      const currentTime = this.audioContext.currentTime;

      if (!stream) {
        // New user, create gain node and set initial play time with buffer delay
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 1.0;
        gainNode.connect(this.masterGain);

        stream = {
          lastActivity: Date.now(),
          nextPlayTime: currentTime + this.BUFFER_DELAY,
          gainNode: gainNode,
        };
        this.userStreams.set(packet.userId, stream);
        this.onTalkingChange(packet.userId, true);
      }

      stream.lastActivity = Date.now();

      // If we've fallen behind, reset the play time
      if (stream.nextPlayTime < currentTime) {
        stream.nextPlayTime = currentTime + this.BUFFER_DELAY;
      }

      // Create audio buffer
      const audioBuffer = this.audioContext.createBuffer(
        1, // mono
        floatSamples.length,
        packet.sampleRate || this.SAMPLE_RATE
      );
      audioBuffer.getChannelData(0).set(floatSamples);

      // Create source and schedule playback
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(stream.gainNode);

      // Schedule this buffer to play at the next available time
      source.start(stream.nextPlayTime);

      // Update next play time for seamless playback
      stream.nextPlayTime += audioBuffer.duration;

    } catch (e) {
      console.error('Error processing audio packet:', e);
    }
  }

  private checkTalkingStates(): void {
    const now = Date.now();
    const timeout = 300; // ms without audio = not talking

    for (const [userId, stream] of this.userStreams.entries()) {
      if (now - stream.lastActivity > timeout) {
        this.onTalkingChange(userId, false);
        stream.gainNode.disconnect();
        this.userStreams.delete(userId);
      }
    }
  }

  destroy(): void {
    if (this.talkingCheckInterval) {
      clearInterval(this.talkingCheckInterval);
    }

    for (const stream of this.userStreams.values()) {
      stream.gainNode.disconnect();
    }
    this.userStreams.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
