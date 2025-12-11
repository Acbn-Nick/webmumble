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

  return decoded;
};

const ChatMessage: React.FC<{ text: string; sender?: string }> = ({ text, sender }) => {
  const sanitizedHtml = useMemo(() => decodeAndSanitizeChatHtml(text), [text]);

  return (
    <span>
      <span className="font-bold text-black">&lt;{sender}&gt;</span>{' '}
      <span
        className="chat-content"
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
    <div className="flex-1 bg-white text-black p-2 overflow-y-auto font-mono text-xs border-l border-[#444] h-full">
      <style>{`
        .chat-content img {
          max-width: 300px;
          max-height: 300px;
          border-radius: 4px;
          margin: 4px 0;
          display: block;
        }
        .chat-content a {
          color: #2563eb;
          text-decoration: underline;
        }
      `}</style>
      {logs.map((log) => (
        <div key={log.id} className="mb-0.5 break-words">
          <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
          {log.type === 'server' && (
            <span className="text-blue-700 font-bold">{log.text}</span>
          )}
          {log.type === 'error' && (
            <span className="text-red-600 font-bold">{log.text}</span>
          )}
          {log.type === 'info' && (
            <span className="text-green-700">{log.text}</span>
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
