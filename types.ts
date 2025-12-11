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