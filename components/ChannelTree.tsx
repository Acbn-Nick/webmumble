import React from 'react';
import { Channel, User, AvailableStream } from '../types';
import { Folder, FolderOpen, Mic, MicOff, Headphones, Volume2, User as UserIcon, MonitorPlay } from 'lucide-react';

interface ChannelTreeProps {
  channel: Channel;
  onChannelSelect: (channelId: string) => void;
  selectedChannelId: string;
  streamingUsers: Map<string, AvailableStream>;
  onWatchStream: (userId: string) => void;
}

export const ChannelTree: React.FC<ChannelTreeProps> = ({
  channel,
  onChannelSelect,
  selectedChannelId,
  streamingUsers,
  onWatchStream
}) => {
  const isSelected = channel.id === selectedChannelId;

  return (
    <div className="pl-4 select-none">
      <div
        className={`flex items-center group cursor-pointer py-1 px-2 rounded-lg transition-all ${isSelected ? 'bg-[rgba(88,166,255,0.15)] text-white font-medium border border-[rgba(88,166,255,0.3)] shadow-[0_0_10px_rgba(88,166,255,0.2)]' : 'hover:bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.8)] border border-transparent'}`}
        onClick={(e) => {
          e.stopPropagation();
          onChannelSelect(channel.id);
        }}
      >
        <span className="mr-1.5 opacity-70">
          {channel.isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
        </span>
        <span className="text-sm truncate">{channel.name}</span>
      </div>

      {channel.isExpanded && (
        <>
          {/* Users in this channel */}
          <div className="pl-4">
            {channel.users.map(user => (
              <UserItem
                key={user.id}
                user={user}
                isStreaming={streamingUsers.has(user.id)}
                onWatchStream={() => onWatchStream(user.id)}
              />
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
                streamingUsers={streamingUsers}
                onWatchStream={onWatchStream}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

interface UserItemProps {
  user: User;
  isStreaming: boolean;
  onWatchStream: () => void;
}

const UserItem: React.FC<UserItemProps> = ({ user, isStreaming, onWatchStream }) => {
  // Determine Lip/User icon color
  let iconColor = "text-[rgba(255,255,255,0.5)]";
  if (user.isTalking) iconColor = "text-[#3fb950] drop-shadow-[0_0_8px_rgba(63,185,80,0.6)]";
  else if (user.isMuted) iconColor = "text-[#f85149]";

  return (
    <div className={`flex items-center py-1 px-2 hover:bg-[rgba(255,255,255,0.05)] rounded-lg cursor-default transition-all ${user.isTalking ? 'bg-[rgba(63,185,80,0.1)] border border-[rgba(63,185,80,0.2)]' : 'border border-transparent'}`}>
      <div className={`mr-1.5 transition-all duration-100 ${iconColor}`}>
        <UserIcon size={14} fill={user.isTalking ? "currentColor" : "none"} />
      </div>
      <span className={`text-sm ${user.isSelf ? 'font-semibold text-white' : 'text-[rgba(255,255,255,0.8)]'}`}>
        {user.name}
      </span>

      <div className="ml-auto flex items-center space-x-1">
        {/* Streaming indicator - clickable to watch */}
        {isStreaming && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onWatchStream();
            }}
            className="p-1 rounded hover:bg-[rgba(63,185,80,0.2)] transition-all group"
            title={`Watch ${user.name}'s screen`}
          >
            <MonitorPlay
              size={14}
              className="text-[#3fb950] group-hover:drop-shadow-[0_0_8px_rgba(63,185,80,0.6)] transition-all"
            />
          </button>
        )}
        {user.isMuted && <MicOff size={10} className="text-[#f85149] opacity-70" />}
        {user.isDeafened && <Headphones size={10} className="text-[#f85149] opacity-70" />}
      </div>
    </div>
  );
};
