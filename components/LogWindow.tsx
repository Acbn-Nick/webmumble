import React, { useEffect, useRef, useMemo } from 'react';
import { LogMessage } from '../types';

interface LogWindowProps {
  logs: LogMessage[];
}

// Decode URL-encoded content for chat HTML rendering
const decodeAndSanitizeChatHtml = (html: string): string => {
  // URL-decode the content (handles %2F -> /, %2B -> +, etc. in base64 data URIs)
  let decoded = html;

  // First, try to decode data URIs specifically (base64 image data is often URL-encoded)
  decoded = decoded.replace(
    /src="data:([^"]+)"/gi,
    (match, dataUri) => {
      try {
        return `src="data:${decodeURIComponent(dataUri)}"`;
      } catch {
        // Manual decode for common base64 URL encodings
        const manualDecode = dataUri
          .replace(/%2F/gi, '/')
          .replace(/%2B/gi, '+')
          .replace(/%3D/gi, '=');
        return `src="data:${manualDecode}"`;
      }
    }
  );

  // Also try to decode the whole string for any other URL-encoded content
  try {
    // Only decode if it looks like there's URL encoding outside of data URIs
    if (decoded.includes('%') && !decoded.includes('data:')) {
      decoded = decodeURIComponent(decoded);
    }
  } catch {
    // Ignore if decoding fails
  }

  // Make all links open in new tab
  decoded = decoded.replace(
    /<a\s+(?![^>]*target=)/gi,
    '<a target="_blank" rel="noopener noreferrer" '
  );

  return decoded;
};

const ChatMessage: React.FC<{ text: string; sender?: string }> = ({ text, sender }) => {
  const sanitizedHtml = useMemo(() => decodeAndSanitizeChatHtml(text), [text]);

  return (
    <span>
      <span className="font-bold text-[#58a6ff]">&lt;{sender}&gt;</span>{' '}
      <span
        className="chat-content text-[rgba(255,255,255,0.9)]"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </span>
  );
};

export const LogWindow: React.FC<LogWindowProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex-1 bg-transparent text-[#f0f0f5] p-3 overflow-y-auto font-mono text-xs h-full">
      <style>{`
        .chat-content img {
          max-width: 300px;
          max-height: 300px;
          border-radius: 8px;
          margin: 4px 0;
          display: block;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .chat-content a {
          color: #58a6ff;
          text-decoration: underline;
        }
        .chat-content a:hover {
          text-shadow: 0 0 8px rgba(88, 166, 255, 0.5);
        }
      `}</style>
      {logs.map((log) => (
        <div key={log.id} className="mb-1 break-words py-0.5">
          <span className="text-[rgba(255,255,255,0.4)] mr-2">[{log.timestamp}]</span>
          {log.type === 'server' && (
            <span className="text-[#58a6ff] font-semibold">{log.text}</span>
          )}
          {log.type === 'error' && (
            <span className="text-[#f85149] font-semibold">{log.text}</span>
          )}
          {log.type === 'info' && (
            <span className="text-[#3fb950]">{log.text}</span>
          )}
          {log.type === 'chat' && (
            <ChatMessage text={log.text} sender={log.sender} />
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
