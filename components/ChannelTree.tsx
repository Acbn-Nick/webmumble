import React from 'react';
import { Channel, User } from '../types';
import { Folder, FolderOpen, Mic, MicOff, Headphones, Volume2, User as UserIcon } from 'lucide-react';

interface ChannelTreeProps {
  channel: Channel;
  onChannelSelect: (channelId: string) => void;
  selectedChannelId: string;
}

export const ChannelTree: React.FC<ChannelTreeProps> = ({ channel, onChannelSelect, selectedChannelId }) => {
  const isSelected = channel.id === selectedChannelId;

  return (
    <div className="pl-4 select-none">
      <div 
        className={`flex items-center group cursor-pointer py-0.5 px-1 rounded-sm ${isSelected ? 'bg-blue-900/50 text-white font-medium' : 'hover:bg-[#3a3a3a] text-gray-300'}`}
        onClick={(e) => {
          e.stopPropagation();
          onChannelSelect(channel.id);
        }}
      >
        <span className="mr-1 opacity-70">
          {channel.isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
        </span>
        <span className="text-sm truncate">{channel.name}</span>
      </div>

      {channel.isExpanded && (
        <>
          {/* Users in this channel */}
          <div className="pl-4">
            {channel.users.map(user => (
              <UserItem key={user.id} user={user} />
            ))}
          </div>

          {/* Child Channels */}
          <div>
            {channel.children.map(child => (
              <ChannelTree 
                key={child.id} 
                channel={child} 
                onChannelSelect={onChannelSelect}
                selectedChannelId={selectedChannelId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const UserItem: React.FC<{ user: User }> = ({ user }) => {
  // Determine Lip/User icon color
  let iconColor = "text-gray-400";
  if (user.isTalking) iconColor = "text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]";
  else if (user.isMuted) iconColor = "text-red-500";

  return (
    <div className="flex items-center py-0.5 px-1 hover:bg-[#3a3a3a] rounded-sm cursor-default">
      <div className={`mr-1.5 transition-all duration-100 ${iconColor}`}>
        <UserIcon size={14} fill={user.isTalking ? "currentColor" : "none"} />
      </div>
      <span className={`text-sm ${user.isSelf ? 'font-semibold text-white' : 'text-gray-300'}`}>
        {user.name}
      </span>
      
      <div className="ml-auto flex space-x-1 opacity-60">
        {user.isMuted && <MicOff size={10} className="text-red-400" />}
        {user.isDeafened && <Headphones size={10} className="text-red-400" />}
      </div>
    </div>
  );
};
