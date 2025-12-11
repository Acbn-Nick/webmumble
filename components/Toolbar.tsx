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
    <div className="h-12 bg-[#333] border-b border-[#111] flex items-center px-2 shadow-sm select-none">
      
      {/* Connection Controls */}
      <div className="flex items-center space-x-1 mr-4 border-r border-[#555] pr-4">
        {connectionState === ConnectionState.DISCONNECTED ? (
            <button 
                onClick={onConnect}
                className="flex items-center space-x-1 px-3 py-1.5 bg-[#444] hover:bg-[#555] rounded text-xs text-white border border-[#222]"
            >
                <Globe size={14} />
                <span>Connect</span>
            </button>
        ) : (
            <button 
                onClick={onDisconnect}
                className="flex items-center space-x-1 px-3 py-1.5 bg-[#444] hover:bg-[#555] rounded text-xs text-white border border-[#222]"
            >
                <Link2Off size={14} />
                <span>Disconnect</span>
            </button>
        )}
        
        <button className="p-1.5 hover:bg-[#444] rounded text-gray-300 disabled:opacity-30">
            <Server size={16} />
        </button>
      </div>

      {/* Audio Controls */}
      <div className="flex items-center space-x-1">
        <button 
            onClick={toggleMute}
            className={`p-1.5 rounded border border-transparent ${isMuted ? 'bg-red-900/50 text-red-400 border-red-900' : 'hover:bg-[#444] text-gray-200'}`}
            title="Mute Self"
        >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        
        <button 
            onClick={toggleDeafen}
            className={`p-1.5 rounded border border-transparent ${isDeafened ? 'bg-red-900/50 text-red-400 border-red-900' : 'hover:bg-[#444] text-gray-200'}`}
            title="Deafen Self"
        >
            <Headphones size={18} />
        </button>
      </div>

      <div className="ml-auto flex items-center text-xs text-gray-400">
         {connectionState === ConnectionState.CONNECTED && (
             <span className="mr-4 flex items-center">
                 <Link2 size={12} className="mr-1 text-green-500" />
                 Connected to: <span className="text-white ml-1 font-semibold">{serverName}</span>
             </span>
         )}
         <button className="p-1.5 hover:bg-[#444] rounded">
             <Settings size={16} />
         </button>
      </div>
    </div>
  );
};
