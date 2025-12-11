import { ServerConfig } from '../types';

type MessageHandler = (type: string, payload: any) => void;

export class MumbleSocketService {
  private ws: WebSocket | null = null;
  private messageHandler: MessageHandler;
  private disconnectHandler: () => void;
  private config: ServerConfig | null = null;

  constructor(onMessage: MessageHandler, onDisconnect: () => void) {
    this.messageHandler = onMessage;
    this.disconnectHandler = onDisconnect;
  }

  public connect(config: ServerConfig): Promise<void> {
    this.config = config;
    return new Promise((resolve, reject) => {
      // If we are served via HTTP, use WS. If HTTPS, use WSS.
      // This assumes the Go server is serving the frontend or proxied correctly.
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host; 
      
      // If development environment (e.g. webpack dev server on 3000, go on 8080)
      // You might need to hardcode the backend URL here if not using a proxy.
      // const wsUrl = `ws://localhost:8080/ws`; 
      const wsUrl = `${protocol}//${host}/ws`;

      console.log(`Connecting to WebSocket Bridge: ${wsUrl}`);
      
      try {
        this.ws = new WebSocket(wsUrl);
      } catch (e) {
        reject(new Error("Failed to construct WebSocket. Ensure the Go backend is running and you are accessing it via the correct protocol."));
        return;
      }

      const connectionTimeout = setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
              this.ws?.close();
              reject(new Error("Connection timed out. Is the Go backend running?"));
          }
      }, 5000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        // Send initial handshake configuration to the bridge
        this.send('connect', config);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'connected') {
            resolve();
          } else if (msg.type === 'error') {
              console.error("Backend Error:", msg.payload);
              // If we are still in connecting phase, reject
              if (this.ws?.readyState === WebSocket.OPEN) {
                 // We might already be resolved, so this is just a runtime error log
              }
              // If this happens during handshake, we might want to reject logic, 
              // but since 'connected' hasn't fired yet, the promise is pending.
              // However, we rely on resolve() being called on success.
          } else {
              this.messageHandler(msg.type, msg.payload);
          }
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };

      this.ws.onclose = (event) => {
        console.log("WebSocket closed", event.code, event.reason);
        this.ws = null;
        this.disconnectHandler();
        if (!event.wasClean) {
            // If closed before connected, reject promise
            // (Note: if promise already resolved, this does nothing, which is fine)
            reject(new Error(`WebSocket connection closed unexpectedly: ${event.reason || 'Unknown Error'}`));
        }
      };

      this.ws.onerror = (e) => {
        console.error("WebSocket error", e);
        // Does not automatically reject here, waiting for onclose usually
      };
    });
  }

  public send(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
