import {
  VideoStartMessage,
  VideoFrameMessage,
  VideoStopMessage,
  VideoAnnounceMessage,
  VideoSubscribeMessage,
  VideoUnsubscribeMessage,
  VideoMessage,
  DeltaTile,
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
  fps: 2,          // Can increase FPS now with delta encoding
  quality: 0.3,    // Better quality since we send less data
  maxWidth: 480,
  maxHeight: 270,
};

const TILE_SIZE = 32; // Pixels per tile
const KEYFRAME_INTERVAL = 30; // Send full frame every N frames
const TILE_CHANGE_THRESHOLD = 50; // Sum of pixel diffs to consider tile changed

export class VideoCaptureService {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private captureInterval: number | null = null;
  private announceInterval: number | null = null;
  private config: VideoCaptureConfig;
  private frameId: number = 0;
  private isCapturing: boolean = false;
  private userId: string = '';
  private username: string = '';

  // Delta encoding state
  private previousImageData: ImageData | null = null;
  private framesSinceKeyframe: number = 0;
  private tileCanvas: HTMLCanvasElement | null = null;
  private tileCtx: CanvasRenderingContext2D | null = null;

  private readonly ANNOUNCE_INTERVAL_MS = 5000; // Re-announce every 5 seconds

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
      this.sendAnnouncement(true);

      // Start periodic re-announcements for latecomers
      this.announceInterval = window.setInterval(
        () => this.sendAnnouncement(true),
        this.ANNOUNCE_INTERVAL_MS
      );

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

    if (this.announceInterval) {
      clearInterval(this.announceInterval);
      this.announceInterval = null;
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

    // Send stop announcement to channel
    this.sendAnnouncement(false);

    // Clear subscribers
    this.subscribers.clear();
    this.onSubscribersChange(this.subscribers);

    this.videoElement = null;
    this.canvas = null;
    this.ctx = null;
  }

  private sendAnnouncement(streaming: boolean): void {
    this.onSendChannel({
      _wm_video: true,
      type: 'video_announce',
      userId: this.userId,
      username: this.username,
      streaming,
      timestamp: Date.now(),
    });
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

  // Remove a subscriber who has disconnected
  removeSubscriber(subscriberId: string): void {
    if (this.subscribers.has(subscriberId)) {
      console.log(`[VideoCapture] Removing disconnected subscriber: ${subscriberId}`);
      this.subscribers.delete(subscriberId);
      this.onSubscribersChange(this.subscribers);
    }
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

    // Get current frame pixel data
    const currentImageData = this.ctx.getImageData(0, 0, width, height);

    // Determine if we need a keyframe
    const needsKeyframe =
      this.framesSinceKeyframe >= KEYFRAME_INTERVAL ||
      !this.previousImageData ||
      this.previousImageData.width !== width ||
      this.previousImageData.height !== height;

    const currentFrameId = this.frameId++;
    const targetIds = Array.from(this.subscribers);

    if (needsKeyframe) {
      // Send full keyframe
      this.sendKeyframe(currentFrameId, width, height, targetIds);
      this.framesSinceKeyframe = 0;
    } else {
      // Send delta frame with only changed tiles
      this.sendDeltaFrame(currentFrameId, width, height, currentImageData, targetIds);
      this.framesSinceKeyframe++;
    }

    // Store for next comparison
    this.previousImageData = currentImageData;
  }

  private sendKeyframe(frameId: number, width: number, height: number, targetIds: string[]): void {
    const dataUrl = this.canvas!.toDataURL('image/jpeg', this.config.quality);
    const base64Data = dataUrl.split(',')[1];

    console.log(`[VideoCapture] KEYFRAME ${frameId}: ${width}x${height}, ${base64Data.length} bytes`);

    const fragments = this.fragmentData(base64Data);
    for (let i = 0; i < fragments.length; i++) {
      const frameMsg: VideoFrameMessage = {
        _wm_video: true,
        type: 'video_frame',
        userId: this.userId,
        frameId: frameId,
        fragmentIndex: i,
        fragmentCount: fragments.length,
        data: fragments[i],
        timestamp: Date.now(),
        isKeyframe: true,
        width,
        height,
      };
      this.onSendDirect(frameMsg, targetIds);
    }
  }

  private sendDeltaFrame(
    frameId: number,
    width: number,
    height: number,
    currentImageData: ImageData,
    targetIds: string[]
  ): void {
    if (!this.previousImageData) return;

    // Initialize tile canvas if needed
    if (!this.tileCanvas) {
      this.tileCanvas = document.createElement('canvas');
      this.tileCtx = this.tileCanvas.getContext('2d');
    }

    const changedTiles: DeltaTile[] = [];
    const tilesX = Math.ceil(width / TILE_SIZE);
    const tilesY = Math.ceil(height / TILE_SIZE);

    // Compare each tile
    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const tileX = tx * TILE_SIZE;
        const tileY = ty * TILE_SIZE;
        const tileW = Math.min(TILE_SIZE, width - tileX);
        const tileH = Math.min(TILE_SIZE, height - tileY);

        if (this.tileChanged(currentImageData, this.previousImageData, tileX, tileY, tileW, tileH, width)) {
          // Extract tile as JPEG
          this.tileCanvas!.width = tileW;
          this.tileCanvas!.height = tileH;
          this.tileCtx!.putImageData(
            this.ctx!.getImageData(tileX, tileY, tileW, tileH),
            0, 0
          );
          const tileDataUrl = this.tileCanvas!.toDataURL('image/jpeg', this.config.quality);
          const tileBase64 = tileDataUrl.split(',')[1];

          changedTiles.push({
            x: tileX,
            y: tileY,
            data: tileBase64,
          });
        }
      }
    }

    if (changedTiles.length === 0) {
      console.log(`[VideoCapture] DELTA ${frameId}: no changes, skipping`);
      return;
    }

    // Calculate total size
    const totalSize = changedTiles.reduce((sum, t) => sum + t.data.length, 0);
    console.log(`[VideoCapture] DELTA ${frameId}: ${changedTiles.length}/${tilesX * tilesY} tiles changed, ${totalSize} bytes`);

    // If too many tiles changed, send as keyframe instead
    if (changedTiles.length > (tilesX * tilesY) * 0.5) {
      console.log(`[VideoCapture] Too many tiles changed, sending keyframe instead`);
      this.sendKeyframe(frameId, width, height, targetIds);
      this.framesSinceKeyframe = 0;
      return;
    }

    // Send delta frame (tiles embedded in single message if small enough)
    const frameMsg: VideoFrameMessage = {
      _wm_video: true,
      type: 'video_frame',
      userId: this.userId,
      frameId: frameId,
      fragmentIndex: 0,
      fragmentCount: 1,
      data: '', // No full frame data for delta
      timestamp: Date.now(),
      isKeyframe: false,
      width,
      height,
      tiles: changedTiles,
    };

    // Check if message is too large and needs fragmentation
    const msgJson = JSON.stringify(frameMsg);
    if (msgJson.length > this.MAX_FRAGMENT_SIZE) {
      // Fall back to keyframe if delta is too large
      console.log(`[VideoCapture] Delta too large (${msgJson.length}), sending keyframe`);
      this.sendKeyframe(frameId, width, height, targetIds);
      this.framesSinceKeyframe = 0;
      return;
    }

    this.onSendDirect(frameMsg, targetIds);
  }

  private tileChanged(
    current: ImageData,
    previous: ImageData,
    tileX: number,
    tileY: number,
    tileW: number,
    tileH: number,
    stride: number
  ): boolean {
    let diff = 0;
    const threshold = TILE_CHANGE_THRESHOLD * tileW * tileH;

    for (let y = 0; y < tileH; y++) {
      for (let x = 0; x < tileW; x++) {
        const px = tileX + x;
        const py = tileY + y;
        const idx = (py * stride + px) * 4;

        // Compare RGB (skip alpha)
        diff += Math.abs(current.data[idx] - previous.data[idx]);
        diff += Math.abs(current.data[idx + 1] - previous.data[idx + 1]);
        diff += Math.abs(current.data[idx + 2] - previous.data[idx + 2]);

        if (diff > threshold) return true;
      }
    }
    return false;
  }

  private fragmentData(base64Data: string): string[] {
    const fragments: string[] = [];
    for (let i = 0; i < base64Data.length; i += this.MAX_FRAGMENT_SIZE) {
      fragments.push(base64Data.slice(i, i + this.MAX_FRAGMENT_SIZE));
    }
    return fragments.length > 0 ? fragments : [''];
  }
}
