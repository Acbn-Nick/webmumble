export interface User {
  id: string;
  name: string;
  isMuted: boolean;
  isDeafened: boolean;
  isTalking: boolean;
  isSelf?: boolean;
  channelId?: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  users: User[];
  children: Channel[];
  isExpanded: boolean;
  parentId?: string;
}

export interface LogMessage {
  id: string;
  timestamp: string;
  text: string;
  type: 'info' | 'chat' | 'server' | 'error';
  sender?: string;
}

export enum ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
}

export interface ServerConfig {
  address: string;
  port: string;
  username: string;
  insecure: boolean; // Accept self-signed certs
}

// Gemini Live Types (Kept for compatibility if needed, though unused in Mumble mode)
export type PCMChunk = {
  data: string; // base64
  sampleRate: number;
};

// Video Streaming Types
export interface VideoStartMessage {
  _wm_video: true;
  type: 'video_start';
  userId: string;
  username: string;
  timestamp: number;
  fps: number;
  quality: number;
}

export interface VideoFrameMessage {
  _wm_video: true;
  type: 'video_frame';
  userId: string;
  frameId: number;
  fragmentIndex: number;
  fragmentCount: number;
  data: string;
  timestamp: number;
  // Delta encoding fields
  isKeyframe?: boolean;       // True for full frame, false/undefined for delta
  width?: number;             // Frame dimensions
  height?: number;
  tiles?: DeltaTile[];        // Changed tiles for delta frames
  deltaType?: 'xor' | 'tiles'; // Type of delta encoding used
}

export interface DeltaTile {
  x: number;      // Tile X position in pixels
  y: number;      // Tile Y position in pixels
  data: string;   // Base64 JPEG of just this tile
}

export interface VideoStopMessage {
  _wm_video: true;
  type: 'video_stop';
  userId: string;
  timestamp: number;
}

// Subscription messages - sent as direct messages between peers
export interface VideoSubscribeMessage {
  _wm_video: true;
  type: 'video_subscribe';
  subscriberId: string;
  subscriberName: string;
  streamerId: string;
  timestamp: number;
}

export interface VideoUnsubscribeMessage {
  _wm_video: true;
  type: 'video_unsubscribe';
  subscriberId: string;
  streamerId: string;
  timestamp: number;
}

// Announcement sent to channel when someone starts/stops streaming
export interface VideoAnnounceMessage {
  _wm_video: true;
  type: 'video_announce';
  userId: string;
  username: string;
  streaming: boolean;
  timestamp: number;
}

export type VideoMessage =
  | VideoStartMessage
  | VideoFrameMessage
  | VideoStopMessage
  | VideoSubscribeMessage
  | VideoUnsubscribeMessage
  | VideoAnnounceMessage;

export interface VideoStream {
  userId: string;
  username: string;
  lastFrameTime: number;
  currentFrameUrl: string | null;
  isActive: boolean;
}

export interface AvailableStream {
  userId: string;
  username: string;
  isSubscribed: boolean;
}