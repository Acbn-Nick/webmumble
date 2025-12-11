import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChannelTree } from './components/ChannelTree';
import { LogWindow } from './components/LogWindow';
import { Toolbar } from './components/Toolbar';
import { ConnectDialog } from './components/ConnectDialog';
import { ChatInput } from './components/ChatInput';
import { AudioSettingsMenu } from './components/AudioSettingsMenu';
import { Channel, ConnectionState, LogMessage, User, ServerConfig } from './types';
import { MumbleSocketService } from './services/mumbleSocketService';
import { AudioPlaybackService } from './services/audioPlaybackService';
import { AudioCaptureService } from './services/audioCaptureService';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);

  // Root channel state
  const [rootChannel, setRootChannel] = useState<Channel>({
    id: '0',
    name: 'Root',
    users: [],
    children: [],
    isExpanded: true
  });

  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string>('0');
  const [isMuted, setIsMuted] = useState(true); // Start muted by default
  const [isDeafened, setIsDeafened] = useState(false);

  // Push-to-talk state
  const [pttKey, setPttKey] = useState<string | null>(() => {
    return localStorage.getItem('pttKey');
  });
  const [pttEnabled, setPttEnabled] = useState(() => {
    return localStorage.getItem('pttEnabled') === 'true';
  });
  const isPttActive = useRef(false);

  // Service References
  const socketService = useRef<MumbleSocketService | null>(null);
  const audioPlayback = useRef<AudioPlaybackService | null>(null);
  const audioCapture = useRef<AudioCaptureService | null>(null);
  const initialized = useRef(false);

  // Helper to add logs
  const addLog = useCallback((text: string, type: LogMessage['type'] = 'info', sender?: string) => {
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: timeString,
      text,
      type,
      sender
    }]);
  }, []);

  // Update user talking state in channel tree
  const updateUserTalking = useCallback((userId: string, isTalking: boolean) => {
    setRootChannel(prev => {
      const updateChannel = (channel: Channel): Channel => ({
        ...channel,
        users: channel.users.map(user =>
          user.id === userId ? { ...user, isTalking } : user
        ),
        children: channel.children.map(updateChannel)
      });
      return updateChannel(prev);
    });
  }, []);

  // Handle incoming messages from Backend
  const handleBackendMessage = useCallback((type: string, payload: any) => {
    switch (type) {
      case 'sync_tree':
        // Full tree sync from Go backend
        setRootChannel(payload);
        break;
      
      case 'user_moved':
        // Payload: { userId: string, channelId: string, user: User }
        // Simple re-sync or optimized move logic could go here. 
        // For now, let's assume the backend sends a full tree or we rely on 'sync_tree' for major updates
        // To keep it simple, we might just log it.
        addLog(`User moved: ${payload.user?.name}`, 'info');
        break;

      case 'log':
        addLog(payload.text, payload.level || 'info');
        break;

      case 'chat':
         addLog(payload.message, 'chat', payload.sender);
         break;

      case 'audio':
         // Handle incoming audio
         if (audioPlayback.current) {
           audioPlayback.current.handleAudioPacket(payload);
         }
         break;
    }
  }, [addLog]);

  const handleDisconnect = useCallback(() => {
    setConnectionState(ConnectionState.DISCONNECTED);
    addLog("Disconnected from server.", 'server');
    setRootChannel({ id: '0', name: 'Root', users: [], children: [], isExpanded: true });
    socketService.current = null;
  }, [addLog]);

  // Initial Setup
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    addLog("WebMumble Client Initialized.", 'info');
    // Initialize socket service
    socketService.current = new MumbleSocketService(handleBackendMessage, handleDisconnect);

    // Initialize audio playback
    audioPlayback.current = new AudioPlaybackService(updateUserTalking);

    // Initialize audio capture (sends audio to backend)
    audioCapture.current = new AudioCaptureService((pcmData) => {
      if (socketService.current) {
        socketService.current.send('audio', { data: pcmData });
      }
    });

    // Cleanup
    return () => {
        socketService.current?.disconnect();
        audioPlayback.current?.destroy();
        audioCapture.current?.destroy();
    };
  }, [addLog, handleBackendMessage, handleDisconnect, updateUserTalking]);


  const initiateConnection = async (config: ServerConfig) => {
    setShowConnectDialog(false);
    setServerConfig(config);
    setConnectionState(ConnectionState.CONNECTING);
    addLog(`Connecting to ${config.address}:${config.port}...`, 'info');

    // Re-initialize service to ensure fresh state
    socketService.current?.disconnect();
    socketService.current = new MumbleSocketService(handleBackendMessage, handleDisconnect);

    // Initialize audio (requires user interaction for browser autoplay policy)
    await audioPlayback.current?.initialize();

    // Initialize microphone capture
    const micInitialized = await audioCapture.current?.initialize();
    if (micInitialized) {
      addLog("Microphone access granted", 'info');
      audioCapture.current?.setMuted(true); // Start muted
      setIsMuted(true);
    } else {
      addLog("Microphone access denied or failed", 'error');
    }

    try {
        await socketService.current.connect(config);
        setConnectionState(ConnectionState.CONNECTED);
        addLog(`Connected to ${config.address}`, 'server');
    } catch (e) {
        setConnectionState(ConnectionState.DISCONNECTED);
        addLog(`Connection failed: ${(e as Error).message}`, 'error');
    }
  };

  // PTT key change handler
  const handlePttKeyChange = useCallback((key: string | null) => {
    setPttKey(key);
    if (key) {
      localStorage.setItem('pttKey', key);
    } else {
      localStorage.removeItem('pttKey');
    }
  }, []);

  // PTT enabled change handler
  const handlePttEnabledChange = useCallback((enabled: boolean) => {
    setPttEnabled(enabled);
    localStorage.setItem('pttEnabled', enabled.toString());
    // If disabling PTT, make sure we're muted
    if (!enabled && !isMuted) {
      setIsMuted(true);
      audioCapture.current?.setMuted(true);
    }
  }, [isMuted]);

  // PTT key event listeners
  useEffect(() => {
    if (!pttEnabled || !pttKey) {
      console.log(`[PTT] Disabled - pttEnabled: ${pttEnabled}, pttKey: ${pttKey}`);
      return;
    }

    console.log(`[PTT] Enabled with key: ${pttKey}`);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === pttKey && !isPttActive.current) {
        e.preventDefault();
        console.log(`[PTT] Key down - unmuting`);
        isPttActive.current = true;
        setIsMuted(false);
        audioCapture.current?.setMuted(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === pttKey && isPttActive.current) {
        e.preventDefault();
        console.log(`[PTT] Key up - muting`);
        isPttActive.current = false;
        setIsMuted(true);
        audioCapture.current?.setMuted(true);
      }
    };

    // Also handle window blur to release PTT
    const handleBlur = () => {
      if (isPttActive.current) {
        isPttActive.current = false;
        setIsMuted(true);
        audioCapture.current?.setMuted(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [pttEnabled, pttKey]);

  const onToolbarConnectClick = () => {
      setShowConnectDialog(true);
  };

  const onToolbarDisconnectClick = () => {
      socketService.current?.disconnect();
  };

  const sendChatMessage = (text: string) => {
      if (socketService.current && text.trim()) {
          socketService.current.send('chat', { text, channelId: currentChannelId });
          addLog(text, 'chat', 'Me');
      }
  };

  const joinChannel = (channelId: string) => {
      if (socketService.current && connectionState === ConnectionState.CONNECTED) {
          socketService.current.send('join_channel', { channelId });
          setCurrentChannelId(channelId);
      } else {
          // Not connected, just select for UI
          setCurrentChannelId(channelId);
      }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-transparent text-[#f0f0f5] overflow-hidden">
      {/* Dialog */}
      {showConnectDialog && (
          <ConnectDialog
            onConnect={initiateConnection}
            onCancel={() => setShowConnectDialog(false)}
          />
      )}

      {/* Top Menu Bar */}
      <div className="h-6 bg-[rgba(255,255,255,0.05)] backdrop-blur-md flex items-center px-2 text-[11px] space-x-3 select-none border-b border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.8)]">
        <span>Server</span>
        <span>Self</span>
        <AudioSettingsMenu
          pttKey={pttKey}
          onPttKeyChange={handlePttKeyChange}
          pttEnabled={pttEnabled}
          onPttEnabledChange={handlePttEnabledChange}
        />
        <span>Configure</span>
        <span>Help</span>
      </div>

      <Toolbar 
        connectionState={connectionState} 
        onConnect={onToolbarConnectClick} 
        onDisconnect={onToolbarDisconnectClick}
        isMuted={isMuted}
        toggleMute={() => {
          const newMuted = !isMuted;
          setIsMuted(newMuted);
          audioCapture.current?.setMuted(newMuted);
        }}
        isDeafened={isDeafened}
        toggleDeafen={() => {
          const newDeafened = !isDeafened;
          setIsDeafened(newDeafened);
          audioPlayback.current?.setMuted(newDeafened);
        }}
        serverName={serverConfig?.address}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Channel Tree */}
        <div className="w-[300px] flex flex-col border-r border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] backdrop-blur-xl">
           <div className="flex-1 overflow-y-auto p-2">
             <ChannelTree
                channel={rootChannel}
                onChannelSelect={joinChannel}
                selectedChannelId={currentChannelId}
             />
           </div>
        </div>

        {/* Right Side: Log / Chat */}
        <div className="flex-1 flex flex-col bg-[rgba(0,0,0,0.2)] backdrop-blur-md">
            <LogWindow logs={logs} />

            {/* Chat Input Area */}
            <ChatInput
              disabled={connectionState !== ConnectionState.CONNECTED}
              placeholder={connectionState === ConnectionState.CONNECTED ? "Type a message..." : "Disconnected"}
              channelLabel={currentChannelId === '0' ? 'Root' : 'Channel'}
              onSend={sendChatMessage}
            />
        </div>
      </div>

      {/* Footer Status */}
      <div className="h-6 bg-[rgba(255,255,255,0.05)] backdrop-blur-md border-t border-[rgba(255,255,255,0.1)] flex items-center px-2 text-xs text-[rgba(255,255,255,0.5)] justify-between">
          <div>
              {connectionState === ConnectionState.CONNECTED 
                ? "UDP: Active (Tunnel)" 
                : "Not Connected"}
          </div>
          <div>
             {/* Talking state would hook into the service here */}
             Idle
          </div>
      </div>
    </div>
  );
};

export default App;