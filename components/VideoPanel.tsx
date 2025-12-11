import React, { useState } from 'react';
import { X, Maximize2, Minimize2, Eye, EyeOff, MonitorUp, Users } from 'lucide-react';
import { VideoStream, AvailableStream } from '../types';

interface VideoPanelProps {
  streams: Map<string, VideoStream>;
  availableStreams: Map<string, AvailableStream>;
  isStreaming: boolean;
  subscriberCount: number;
  onSubscribe: (streamerId: string) => void;
  onUnsubscribe: (streamerId: string) => void;
  onClose: () => void;
}

export const VideoPanel: React.FC<VideoPanelProps> = ({
  streams,
  availableStreams,
  isStreaming,
  subscriberCount,
  onSubscribe,
  onUnsubscribe,
  onClose,
}) => {
  const [expandedStream, setExpandedStream] = useState<string | null>(null);

  const activeStreams = Array.from(streams.values()).filter(
    (s) => s.isActive && s.currentFrameUrl
  );
  const availableList = Array.from(availableStreams.values());

  const gridClass =
    activeStreams.length === 1
      ? 'grid-cols-1'
      : activeStreams.length <= 4
      ? 'grid-cols-2'
      : 'grid-cols-3';

  return (
    <div className="bg-[rgba(0,0,0,0.4)] backdrop-blur-md border-t border-[rgba(255,255,255,0.1)] flex flex-col max-h-[50vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-[rgba(255,255,255,0.1)]">
        <div className="flex items-center gap-4">
          <span className="text-xs text-[rgba(255,255,255,0.6)] flex items-center gap-1">
            <MonitorUp size={12} />
            Screen Shares
          </span>

          {/* Show streaming status if we're streaming */}
          {isStreaming && (
            <span className="text-xs text-[#3fb950] flex items-center gap-1">
              <Users size={12} />
              {subscriberCount} viewer{subscriberCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-1 hover:bg-[rgba(255,255,255,0.1)] rounded transition-all"
        >
          <X size={14} className="text-[rgba(255,255,255,0.6)]" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {/* Available Streams Section */}
        {availableList.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-[rgba(255,255,255,0.5)] mb-2">
              Available Streams ({availableList.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {availableList.map((stream) => (
                <button
                  key={stream.userId}
                  onClick={() =>
                    stream.isSubscribed
                      ? onUnsubscribe(stream.userId)
                      : onSubscribe(stream.userId)
                  }
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all border ${
                    stream.isSubscribed
                      ? 'bg-[rgba(63,185,80,0.2)] text-[#3fb950] border-[rgba(63,185,80,0.3)]'
                      : 'bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.8)] border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.1)]'
                  }`}
                >
                  {stream.isSubscribed ? (
                    <Eye size={12} />
                  ) : (
                    <EyeOff size={12} />
                  )}
                  {stream.username}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Video Streams */}
        {activeStreams.length > 0 ? (
          <div className={`grid ${gridClass} gap-2`}>
            {activeStreams.map((stream) => (
              <div
                key={stream.userId}
                className={`relative bg-[rgba(0,0,0,0.3)] rounded-lg overflow-hidden border border-[rgba(255,255,255,0.1)] ${
                  expandedStream === stream.userId
                    ? 'col-span-full row-span-2'
                    : ''
                }`}
              >
                {/* Username label */}
                <div className="absolute top-2 left-2 bg-[rgba(0,0,0,0.6)] px-2 py-1 rounded text-xs text-white z-10 flex items-center gap-1">
                  <MonitorUp size={10} />
                  {stream.username}
                </div>

                {/* Controls */}
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                  {/* Expand/collapse */}
                  <button
                    onClick={() =>
                      setExpandedStream(
                        expandedStream === stream.userId ? null : stream.userId
                      )
                    }
                    className="p-1 bg-[rgba(0,0,0,0.6)] rounded hover:bg-[rgba(0,0,0,0.8)] transition-all"
                  >
                    {expandedStream === stream.userId ? (
                      <Minimize2 size={14} className="text-white" />
                    ) : (
                      <Maximize2 size={14} className="text-white" />
                    )}
                  </button>

                  {/* Unsubscribe */}
                  <button
                    onClick={() => onUnsubscribe(stream.userId)}
                    className="p-1 bg-[rgba(0,0,0,0.6)] rounded hover:bg-[rgba(248,81,73,0.3)] transition-all"
                    title="Stop watching"
                  >
                    <X size={14} className="text-white" />
                  </button>
                </div>

                {/* Video frame */}
                {stream.currentFrameUrl && (
                  <img
                    src={stream.currentFrameUrl}
                    alt={`${stream.username}'s screen`}
                    className="w-full h-full object-contain"
                    style={{
                      maxHeight:
                        expandedStream === stream.userId ? '45vh' : '200px',
                      minHeight: '100px',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        ) : availableList.length === 0 ? (
          <div className="text-center text-xs text-[rgba(255,255,255,0.4)] py-4">
            No active screen shares
          </div>
        ) : null}
      </div>
    </div>
  );
};
