import {
  VideoStartMessage,
  VideoFrameMessage,
  VideoStopMessage,
  VideoAnnounceMessage,
  VideoSubscribeMessage,
  VideoUnsubscribeMessage,
  VideoMessage,
} from '../types';

export type VideoChannelCallback = (message: VideoAnnounceMessage) => void;
export type VideoDirectCallback = (message: VideoMessage, targetIds: string[]) => void;
export type SubscribersChangeCallback = (subscribers: Set<string>) => void;

export interface VideoCaptureConfig {
  fps: number;
  quality: number;
  maxWidth: number;
  maxHeight: number;
}

const DEFAULT_CONFIG: VideoCaptureConfig = {
  fps: 1,          // Very low FPS - Mumble text messages can't handle high rates
  quality: 0.3,    // Lower quality for smaller fragments
  maxWidth: 640,
  maxHeight: 360,
};

export class VideoCaptureService {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private captureInterval: number | null = null;
  private config: VideoCaptureConfig;
  private frameId: number = 0;
  private isCapturing: boolean = false;
  private userId: string = '';
  private username: string = '';

  // Subscription tracking
  private subscribers: Set<string> = new Set();

  // Callbacks
  private onSendChannel: VideoChannelCallback;
  private onSendDirect: VideoDirectCallback;
  private onSubscribersChange: SubscribersChangeCallback;

  private readonly MAX_FRAGMENT_SIZE = 4800;

  constructor(
    onSendChannel: VideoChannelCallback,
    onSendDirect: VideoDirectCallback,
    onSubscribersChange: SubscribersChangeCallback,
    config?: Partial<VideoCaptureConfig>
  ) {
    this.onSendChannel = onSendChannel;
    this.onSendDirect = onSendDirect;
    this.onSubscribersChange = onSubscribersChange;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async startCapture(userId: string, username: string): Promise<boolean> {
    this.userId = userId;
    this.username = username;

    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          frameRate: { ideal: this.config.fps, max: 30 },
        },
        audio: false,
      });

      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.muted = true;
      await this.videoElement.play();

      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');

      // Handle user stopping share via browser UI
      this.mediaStream.getVideoTracks()[0].onended = () => {
        this.stopCapture();
      };

      // Send announcement to channel
      this.onSendChannel({
        _wm_video: true,
        type: 'video_announce',
        userId: this.userId,
        username: this.username,
        streaming: true,
        timestamp: Date.now(),
      });

      // Start capture loop
      this.isCapturing = true;
      this.captureInterval = window.setInterval(
        () => this.captureFrame(),
        1000 / this.config.fps
      );

      return true;
    } catch (error) {
      console.error('Screen capture failed:', error);
      return false;
    }
  }

  stopCapture(): void {
    if (!this.isCapturing) return;

    this.isCapturing = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Send stop message to all subscribers
    if (this.subscribers.size > 0) {
      const stopMsg: VideoStopMessage = {
        _wm_video: true,
        type: 'video_stop',
        userId: this.userId,
        timestamp: Date.now(),
      };
      this.onSendDirect(stopMsg, Array.from(this.subscribers));
    }

    // Send announcement to channel
    this.onSendChannel({
      _wm_video: true,
      type: 'video_announce',
      userId: this.userId,
      username: this.username,
      streaming: false,
      timestamp: Date.now(),
    });

    // Clear subscribers
    this.subscribers.clear();
    this.onSubscribersChange(this.subscribers);

    this.videoElement = null;
    this.canvas = null;
    this.ctx = null;
  }

  // Handle incoming subscription from a viewer
  handleSubscribe(msg: VideoSubscribeMessage): void {
    console.log('[VideoCapture] handleSubscribe called, streamerId:', msg.streamerId, 'myId:', this.userId);
    if (msg.streamerId !== this.userId) {
      console.log('[VideoCapture] Ignoring subscribe - streamerId mismatch');
      return;
    }

    this.subscribers.add(msg.subscriberId);
    this.onSubscribersChange(this.subscribers);
    console.log('[VideoCapture] Added subscriber:', msg.subscriberId, 'total:', this.subscribers.size);

    // Send start message to the new subscriber
    const startMsg: VideoStartMessage = {
      _wm_video: true,
      type: 'video_start',
      userId: this.userId,
      username: this.username,
      timestamp: Date.now(),
      fps: this.config.fps,
      quality: this.config.quality,
    };
    this.onSendDirect(startMsg, [msg.subscriberId]);
    console.log('[VideoCapture] Sent video_start to subscriber');
  }

  // Handle unsubscription from a viewer
  handleUnsubscribe(msg: VideoUnsubscribeMessage): void {
    if (msg.streamerId !== this.userId) return;

    this.subscribers.delete(msg.subscriberId);
    this.onSubscribersChange(this.subscribers);
  }

  isSharing(): boolean {
    return this.isCapturing;
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  setConfig(config: Partial<VideoCaptureConfig>): void {
    this.config = { ...this.config, ...config };

    // Update capture interval if fps changed and currently capturing
    if (config.fps && this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = window.setInterval(
        () => this.captureFrame(),
        1000 / this.config.fps
      );
    }
  }

  destroy(): void {
    this.stopCapture();
  }

  private captureFrame(): void {
    // Only capture if we have subscribers
    if (
      !this.isCapturing ||
      !this.videoElement ||
      !this.canvas ||
      !this.ctx ||
      this.subscribers.size === 0
    ) {
      return;
    }

    console.log('[VideoCapture] Capturing frame for', this.subscribers.size, 'subscribers');

    const video = this.videoElement;

    // Scale to fit within max dimensions
    let width = video.videoWidth;
    let height = video.videoHeight;

    if (width > this.config.maxWidth) {
      height = (height / width) * this.config.maxWidth;
      width = this.config.maxWidth;
    }
    if (height > this.config.maxHeight) {
      width = (width / height) * this.config.maxHeight;
      height = this.config.maxHeight;
    }

    width = Math.round(width);
    height = Math.round(height);

    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.drawImage(video, 0, 0, width, height);

    // Compress to JPEG
    const dataUrl = this.canvas.toDataURL('image/jpeg', this.config.quality);
    const base64Data = dataUrl.split(',')[1];
    console.log(`[VideoCapture] Frame captured: ${width}x${height}, ${base64Data.length} bytes base64`);

    // Fragment and send
    const fragments = this.fragmentData(base64Data);
    const currentFrameId = this.frameId++;
    const targetIds = Array.from(this.subscribers);

    console.log(`[VideoCapture] Sending frame ${currentFrameId} (${fragments.length} fragments, ${base64Data.length} bytes) to ${targetIds.length} subscribers`);
    for (let i = 0; i < fragments.length; i++) {
      const frameMsg: VideoFrameMessage = {
        _wm_video: true,
        type: 'video_frame',
        userId: this.userId,
        frameId: currentFrameId,
        fragmentIndex: i,
        fragmentCount: fragments.length,
        data: fragments[i],
        timestamp: Date.now(),
      };
      this.onSendDirect(frameMsg, targetIds);
    }
    console.log(`[VideoCapture] Frame ${currentFrameId} all ${fragments.length} fragments sent`);
  }

  private fragmentData(base64Data: string): string[] {
    const fragments: string[] = [];
    for (let i = 0; i < base64Data.length; i += this.MAX_FRAGMENT_SIZE) {
      fragments.push(base64Data.slice(i, i + this.MAX_FRAGMENT_SIZE));
    }
    return fragments.length > 0 ? fragments : [''];
  }
}
