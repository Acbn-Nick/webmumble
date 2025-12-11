import React from 'react';
import { ConnectionState } from '../types';
import { Mic, MicOff, Headphones, Globe, Settings, Server, Link2, Link2Off } from 'lucide-react';

interface ToolbarProps {
  connectionState: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  isDeafened: boolean;
  toggleDeafen: () => void;
  serverName?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  connectionState,
  onConnect,
  onDisconnect,
  isMuted,
  toggleMute,
  isDeafened,
  toggleDeafen,
  serverName
}) => {
  return (
    <div className="h-12 bg-[rgba(255,255,255,0.05)] backdrop-blur-md border-b border-[rgba(255,255,255,0.1)] flex items-center px-2 shadow-sm select-none">

      {/* Connection Controls */}
      <div className="flex items-center space-x-1 mr-4 border-r border-[rgba(255,255,255,0.1)] pr-4">
        {connectionState === ConnectionState.DISCONNECTED ? (
            <button
                onClick={onConnect}
                className="flex items-center space-x-1 px-3 py-1.5 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs text-white border border-[rgba(255,255,255,0.15)] transition-all"
            >
                <Globe size={14} />
                <span>Connect</span>
            </button>
        ) : (
            <button
                onClick={onDisconnect}
                className="flex items-center space-x-1 px-3 py-1.5 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs text-white border border-[rgba(255,255,255,0.15)] transition-all"
            >
                <Link2Off size={14} />
                <span>Disconnect</span>
            </button>
        )}

        <button className="p-1.5 hover:bg-[rgba(255,255,255,0.1)] rounded-lg text-[rgba(255,255,255,0.6)] transition-all disabled:opacity-30">
            <Server size={16} />
        </button>
      </div>

      {/* Audio Controls */}
      <div className="flex items-center space-x-1">
        <button
            onClick={toggleMute}
            className={`p-1.5 rounded-lg border transition-all ${isMuted ? 'bg-[rgba(248,81,73,0.2)] text-[#f85149] border-[rgba(248,81,73,0.3)] shadow-[0_0_10px_rgba(248,81,73,0.3)]' : 'hover:bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.8)] border-transparent'}`}
            title="Mute Self"
        >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <button
            onClick={toggleDeafen}
            className={`p-1.5 rounded-lg border transition-all ${isDeafened ? 'bg-[rgba(248,81,73,0.2)] text-[#f85149] border-[rgba(248,81,73,0.3)] shadow-[0_0_10px_rgba(248,81,73,0.3)]' : 'hover:bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.8)] border-transparent'}`}
            title="Deafen Self"
        >
            <Headphones size={18} />
        </button>
      </div>

      <div className="ml-auto flex items-center text-xs text-[rgba(255,255,255,0.5)]">
         {connectionState === ConnectionState.CONNECTED && (
             <span className="mr-4 flex items-center">
                 <Link2 size={12} className="mr-1 text-[#3fb950] drop-shadow-[0_0_4px_rgba(63,185,80,0.5)]" />
                 Connected to: <span className="text-white ml-1 font-semibold">{serverName}</span>
             </span>
         )}
         <button className="p-1.5 hover:bg-[rgba(255,255,255,0.1)] rounded-lg transition-all">
             <Settings size={16} />
         </button>
      </div>
    </div>
  );
};
