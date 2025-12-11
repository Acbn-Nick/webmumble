import {
  VideoMessage,
  VideoStartMessage,
  VideoFrameMessage,
  VideoStopMessage,
  VideoAnnounceMessage,
  VideoSubscribeMessage,
  VideoUnsubscribeMessage,
  VideoStream,
  AvailableStream,
} from '../types';

export type SendSubscribeCallback = (msg: VideoSubscribeMessage | VideoUnsubscribeMessage) => void;
export type StreamUpdateCallback = (streams: Map<string, VideoStream>) => void;
export type AvailableStreamsCallback = (streams: Map<string, AvailableStream>) => void;

interface FrameBuffer {
  fragments: Map<number, string>;
  totalFragments: number;
  timestamp: number;
}

export class VideoPlaybackService {
  private streams: Map<string, VideoStream> = new Map();
  private frameBuffers: Map<string, FrameBuffer> = new Map();
  private availableStreams: Map<string, AvailableStream> = new Map();
  private subscriptions: Set<string> = new Set(); // streamerId we're subscribed to

  private onStreamUpdate: StreamUpdateCallback;
  private onAvailableStreamsUpdate: AvailableStreamsCallback;
  private onSendSubscribe: SendSubscribeCallback;

  private cleanupInterval: number | null = null;

  private readonly STREAM_TIMEOUT = 10000;
  private readonly FRAME_TIMEOUT = 5000;

  private myUserId: string = '';
  private myUsername: string = '';

  constructor(
    onStreamUpdate: StreamUpdateCallback,
    onAvailableStreamsUpdate: AvailableStreamsCallback,
    onSendSubscribe: SendSubscribeCallback
  ) {
    this.onStreamUpdate = onStreamUpdate;
    this.onAvailableStreamsUpdate = onAvailableStreamsUpdate;
    this.onSendSubscribe = onSendSubscribe;

    // Periodic cleanup
    this.cleanupInterval = window.setInterval(() => this.cleanup(), 2000);
  }

  setMyInfo(userId: string, username: string): void {
    this.myUserId = userId;
    this.myUsername = username;
  }

  handleVideoMessage(message: VideoMessage): void {
    console.log('[VideoPlayback] handleVideoMessage:', message.type);
    switch (message.type) {
      case 'video_announce':
        this.handleAnnounce(message);
        break;
      case 'video_start':
        this.handleVideoStart(message);
        break;
      case 'video_frame':
        this.handleVideoFrame(message);
        break;
      case 'video_stop':
        this.handleVideoStop(message);
        break;
    }
  }

  private handleAnnounce(msg: VideoAnnounceMessage): void {
    // Don't track our own stream
    if (msg.userId === this.myUserId) return;

    if (msg.streaming) {
      // New stream available
      this.availableStreams.set(msg.userId, {
        userId: msg.userId,
        username: msg.username,
        isSubscribed: this.subscriptions.has(msg.userId),
      });
    } else {
      // Stream ended
      this.availableStreams.delete(msg.userId);
      this.subscriptions.delete(msg.userId);
      this.streams.delete(msg.userId);
      this.onStreamUpdate(this.streams);
    }
    this.onAvailableStreamsUpdate(this.availableStreams);
  }

  private handleVideoStart(msg: VideoStartMessage): void {
    // Don't display our own stream
    if (msg.userId === this.myUserId) return;

    this.streams.set(msg.userId, {
      userId: msg.userId,
      username: msg.username,
      lastFrameTime: Date.now(),
      currentFrameUrl: null,
      isActive: true,
    });
    this.onStreamUpdate(this.streams);
  }

  private handleVideoFrame(msg: VideoFrameMessage): void {
    // Don't process our own frames
    if (msg.userId === this.myUserId) return;

    const bufferKey = `${msg.userId}:${msg.frameId}`;

    let buffer = this.frameBuffers.get(bufferKey);
    if (!buffer) {
      buffer = {
        fragments: new Map(),
        totalFragments: msg.fragmentCount,
        timestamp: Date.now(),
      };
      this.frameBuffers.set(bufferKey, buffer);
    }

    buffer.fragments.set(msg.fragmentIndex, msg.data);

    // Check if frame is complete
    if (buffer.fragments.size === buffer.totalFragments) {
      // Reassemble frame
      const fragments: string[] = [];
      for (let i = 0; i < buffer.totalFragments; i++) {
        const frag = buffer.fragments.get(i);
        if (frag) fragments.push(frag);
      }
      const fullBase64 = fragments.join('');
      const imageUrl = `data:image/jpeg;base64,${fullBase64}`;

      // Update stream
      let stream = this.streams.get(msg.userId);
      if (!stream) {
        // Create stream if it doesn't exist
        stream = {
          userId: msg.userId,
          username: 'Unknown',
          lastFrameTime: Date.now(),
          currentFrameUrl: null,
          isActive: true,
        };
        this.streams.set(msg.userId, stream);
      }

      stream.currentFrameUrl = imageUrl;
      stream.lastFrameTime = Date.now();
      stream.isActive = true;
      this.onStreamUpdate(this.streams);

      // Clean up buffer
      this.frameBuffers.delete(bufferKey);
    }
  }

  private handleVideoStop(msg: VideoStopMessage): void {
    const stream = this.streams.get(msg.userId);
    if (stream) {
      stream.isActive = false;
      this.streams.delete(msg.userId);
      this.onStreamUpdate(this.streams);
    }

    this.availableStreams.delete(msg.userId);
    this.subscriptions.delete(msg.userId);
    this.onAvailableStreamsUpdate(this.availableStreams);
  }

  subscribe(streamerId: string): void {
    console.log('[VideoPlayback] subscribe called for streamerId:', streamerId, 'myUserId:', this.myUserId);
    if (this.subscriptions.has(streamerId)) {
      console.log('[VideoPlayback] Already subscribed');
      return;
    }

    this.subscriptions.add(streamerId);

    // Update available stream status
    const available = this.availableStreams.get(streamerId);
    if (available) {
      available.isSubscribed = true;
      this.onAvailableStreamsUpdate(this.availableStreams);
    }

    // Send subscription message to streamer
    const msg: VideoSubscribeMessage = {
      _wm_video: true,
      type: 'video_subscribe',
      subscriberId: this.myUserId,
      subscriberName: this.myUsername,
      streamerId: streamerId,
      timestamp: Date.now(),
    };
    console.log('[VideoPlayback] Sending subscribe message:', msg);
    this.onSendSubscribe(msg);
  }

  unsubscribe(streamerId: string): void {
    if (!this.subscriptions.has(streamerId)) return;

    this.subscriptions.delete(streamerId);

    // Update available stream status
    const available = this.availableStreams.get(streamerId);
    if (available) {
      available.isSubscribed = false;
      this.onAvailableStreamsUpdate(this.availableStreams);
    }

    // Remove from active streams
    this.streams.delete(streamerId);
    this.onStreamUpdate(this.streams);

    // Send unsubscribe message to streamer
    const msg: VideoUnsubscribeMessage = {
      _wm_video: true,
      type: 'video_unsubscribe',
      subscriberId: this.myUserId,
      streamerId: streamerId,
      timestamp: Date.now(),
    };
    this.onSendSubscribe(msg);
  }

  isSubscribed(streamerId: string): boolean {
    return this.subscriptions.has(streamerId);
  }

  getStreams(): Map<string, VideoStream> {
    return this.streams;
  }

  getAvailableStreams(): Map<string, AvailableStream> {
    return this.availableStreams;
  }

  private cleanup(): void {
    const now = Date.now();

    // Clean up incomplete frame buffers
    for (const [key, buffer] of this.frameBuffers) {
      if (now - buffer.timestamp > this.FRAME_TIMEOUT) {
        this.frameBuffers.delete(key);
      }
    }

    // Clean up stale streams
    for (const [userId, stream] of this.streams) {
      if (now - stream.lastFrameTime > this.STREAM_TIMEOUT) {
        stream.isActive = false;
        this.streams.delete(userId);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Unsubscribe from all
    for (const streamerId of this.subscriptions) {
      this.unsubscribe(streamerId);
    }

    this.streams.clear();
    this.frameBuffers.clear();
    this.availableStreams.clear();
  }
}
