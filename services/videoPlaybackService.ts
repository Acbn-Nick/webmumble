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
  DeltaTile,
} from '../types';

export type SendSubscribeCallback = (msg: VideoSubscribeMessage | VideoUnsubscribeMessage) => void;
export type StreamUpdateCallback = (streams: Map<string, VideoStream>) => void;
export type AvailableStreamsCallback = (streams: Map<string, AvailableStream>) => void;

interface FrameBuffer {
  fragments: Map<number, string>;
  totalFragments: number;
  timestamp: number;
}

interface UserFrameState {
  lastCompletedFrameId: number;
  frameBuffers: Map<number, FrameBuffer>;  // Multiple buffers keyed by frameId
  // Delta encoding state
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
}

export class VideoPlaybackService {
  private streams: Map<string, VideoStream> = new Map();
  private frameBuffers: Map<string, FrameBuffer> = new Map();
  private userFrameState: Map<string, UserFrameState> = new Map(); // Track per-user frame state
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
    console.log(`[VideoPlayback] handleVideoStart from ${msg.userId} (${msg.username}), myUserId: ${this.myUserId}`);
    // Don't display our own stream
    if (msg.userId === this.myUserId) {
      console.log('[VideoPlayback] Ignoring our own video_start');
      return;
    }

    console.log(`[VideoPlayback] Creating stream entry for ${msg.userId}`);
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

    // Get or create per-user frame state
    let state = this.userFrameState.get(msg.userId);
    if (!state) {
      state = {
        lastCompletedFrameId: -1,
        frameBuffers: new Map(),
        canvas: null,
        ctx: null,
      };
      this.userFrameState.set(msg.userId, state);
    }

    // Handle delta frames (single message with tiles)
    if (msg.isKeyframe === false && msg.tiles && msg.tiles.length > 0) {
      this.handleDeltaFrame(msg, state);
      return;
    }

    // Handle keyframes (may be fragmented)
    console.log(`[VideoPlayback] Frame ${msg.frameId} frag ${msg.fragmentIndex+1}/${msg.fragmentCount}, lastCompleted: ${state.lastCompletedFrameId}`);

    // Ignore fragments from frames older than our last completed frame
    if (msg.frameId <= state.lastCompletedFrameId) {
      console.log(`[VideoPlayback] Ignoring old frame ${msg.frameId} <= ${state.lastCompletedFrameId}`);
      return;
    }

    // Get or create buffer for this specific frame
    let buffer = state.frameBuffers.get(msg.frameId);
    if (!buffer) {
      buffer = {
        fragments: new Map(),
        totalFragments: msg.fragmentCount,
        timestamp: Date.now(),
      };
      state.frameBuffers.set(msg.frameId, buffer);
      console.log(`[VideoPlayback] Created buffer for frame ${msg.frameId}`);
    }

    // Add fragment to this frame's buffer
    buffer.fragments.set(msg.fragmentIndex, msg.data);
    console.log(`[VideoPlayback] Frame ${msg.frameId} now has ${buffer.fragments.size}/${buffer.totalFragments} fragments`);

    // Check if frame is complete
    if (buffer.fragments.size === buffer.totalFragments) {
      console.log(`[VideoPlayback] KEYFRAME ${msg.frameId} COMPLETE!`);

      // Reassemble frame
      const fragments: string[] = [];
      for (let i = 0; i < buffer.totalFragments; i++) {
        const frag = buffer.fragments.get(i);
        if (frag) fragments.push(frag);
      }
      const fullBase64 = fragments.join('');

      // Draw keyframe to canvas for delta composition
      this.drawKeyframeToCanvas(state, fullBase64, msg.width || 480, msg.height || 270, msg.frameId);

      // Mark this frame as completed and clean up older buffers
      state.lastCompletedFrameId = msg.frameId;
      for (const [frameId] of state.frameBuffers) {
        if (frameId <= msg.frameId) {
          state.frameBuffers.delete(frameId);
        }
      }
    }
  }

  private handleDeltaFrame(msg: VideoFrameMessage, state: UserFrameState): void {
    if (!msg.tiles || msg.tiles.length === 0) return;
    if (!state.canvas || !state.ctx) {
      console.log(`[VideoPlayback] DELTA ${msg.frameId}: no canvas yet, waiting for keyframe`);
      return;
    }

    // Ignore old delta frames
    if (msg.frameId <= state.lastCompletedFrameId) {
      return;
    }

    console.log(`[VideoPlayback] DELTA ${msg.frameId}: applying ${msg.tiles.length} tiles`);

    // Apply each changed tile to the canvas
    let tilesApplied = 0;
    const applyTile = (tile: DeltaTile) => {
      const img = new Image();
      img.onload = () => {
        state.ctx!.drawImage(img, tile.x, tile.y);
        tilesApplied++;

        // Once all tiles are applied, update the stream
        if (tilesApplied === msg.tiles!.length) {
          this.updateStreamFromCanvas(state, msg.userId, msg.frameId);
          state.lastCompletedFrameId = msg.frameId;
        }
      };
      img.src = `data:image/jpeg;base64,${tile.data}`;
    };

    msg.tiles.forEach(applyTile);
  }

  private drawKeyframeToCanvas(
    state: UserFrameState,
    base64Data: string,
    width: number,
    height: number,
    frameId: number
  ): void {
    // Initialize canvas if needed
    if (!state.canvas) {
      state.canvas = document.createElement('canvas');
      state.ctx = state.canvas.getContext('2d');
    }

    state.canvas.width = width;
    state.canvas.height = height;

    const img = new Image();
    img.onload = () => {
      state.ctx!.drawImage(img, 0, 0);
      this.updateStreamFromCanvas(state, '', frameId); // userId filled by caller context
    };
    img.src = `data:image/jpeg;base64,${base64Data}`;

    // Also update stream immediately with the base64 data
    const imageUrl = `data:image/jpeg;base64,${base64Data}`;
    // Find which user this state belongs to
    for (const [userId, s] of this.userFrameState) {
      if (s === state) {
        const existingStream = this.streams.get(userId);
        const updatedStream: VideoStream = {
          userId: userId,
          username: existingStream?.username || 'Unknown',
          lastFrameTime: Date.now(),
          currentFrameUrl: imageUrl,
          isActive: true,
        };
        this.streams.set(userId, updatedStream);
        console.log(`[VideoPlayback] Displaying keyframe ${frameId}`);
        this.onStreamUpdate(new Map(this.streams));
        break;
      }
    }
  }

  private updateStreamFromCanvas(state: UserFrameState, hintUserId: string, frameId: number): void {
    if (!state.canvas) return;

    const imageUrl = state.canvas.toDataURL('image/jpeg', 0.9);

    // Find which user this state belongs to
    for (const [userId, s] of this.userFrameState) {
      if (s === state) {
        const existingStream = this.streams.get(userId);
        const updatedStream: VideoStream = {
          userId: userId,
          username: existingStream?.username || 'Unknown',
          lastFrameTime: Date.now(),
          currentFrameUrl: imageUrl,
          isActive: true,
        };
        this.streams.set(userId, updatedStream);
        console.log(`[VideoPlayback] Displaying delta frame ${frameId}`);
        this.onStreamUpdate(new Map(this.streams));
        break;
      }
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

    // Clean up stale frame buffers
    for (const [userId, state] of this.userFrameState) {
      for (const [frameId, buffer] of state.frameBuffers) {
        if (now - buffer.timestamp > this.FRAME_TIMEOUT) {
          state.frameBuffers.delete(frameId);
        }
      }
    }

    // Clean up stale streams
    for (const [userId, stream] of this.streams) {
      if (now - stream.lastFrameTime > this.STREAM_TIMEOUT) {
        stream.isActive = false;
        this.streams.delete(userId);
        this.userFrameState.delete(userId);
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
    this.userFrameState.clear();
    this.availableStreams.clear();
  }
}
