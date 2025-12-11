import React, { useState, useEffect, useRef, useCallback } from 'react';

interface AudioSettingsMenuProps {
  pttKey: string | null;
  onPttKeyChange: (key: string | null) => void;
  pttEnabled: boolean;
  onPttEnabledChange: (enabled: boolean) => void;
}

export const AudioSettingsMenu: React.FC<AudioSettingsMenuProps> = ({
  pttKey,
  onPttKeyChange,
  pttEnabled,
  onPttEnabledChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isBinding, setIsBinding] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsBinding(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Handle key binding
  useEffect(() => {
    if (!isBinding) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Get a readable key name
      let keyName = e.code;

      // Make common keys more readable
      if (e.code.startsWith('Key')) {
        keyName = e.code.slice(3); // KeyA -> A
      } else if (e.code.startsWith('Digit')) {
        keyName = e.code.slice(5); // Digit1 -> 1
      } else if (e.code === 'Space') {
        keyName = 'Space';
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        keyName = e.code;
      } else if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        keyName = e.code;
      } else if (e.code === 'AltLeft' || e.code === 'AltRight') {
        keyName = e.code;
      }

      onPttKeyChange(e.code);
      setIsBinding(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBinding, onPttKeyChange]);

  const getKeyDisplayName = (code: string): string => {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code === 'Space') return 'Space';
    if (code === 'ShiftLeft') return 'Left Shift';
    if (code === 'ShiftRight') return 'Right Shift';
    if (code === 'ControlLeft') return 'Left Ctrl';
    if (code === 'ControlRight') return 'Right Ctrl';
    if (code === 'AltLeft') return 'Left Alt';
    if (code === 'AltRight') return 'Right Alt';
    if (code === 'Backquote') return '`';
    if (code === 'CapsLock') return 'Caps Lock';
    if (code === 'Tab') return 'Tab';
    return code;
  };

  return (
    <div ref={menuRef} className="relative">
      <span
        className="cursor-pointer hover:bg-[rgba(255,255,255,0.1)] px-2 py-0.5 rounded-md transition-all"
        onClick={() => setIsOpen(!isOpen)}
      >
        Audio
      </span>

      {isOpen && (
        <div className="fixed top-7 bg-[rgba(255,255,255,0.1)] backdrop-blur-xl border border-[rgba(255,255,255,0.15)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] z-[9999] min-w-[220px] overflow-hidden">
          {/* PTT Enable/Disable */}
          <div
            className="px-3 py-2.5 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center justify-between transition-all"
            onClick={() => onPttEnabledChange(!pttEnabled)}
          >
            <span className="text-[rgba(255,255,255,0.9)]">Push to Talk</span>
            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${pttEnabled ? 'bg-[rgba(63,185,80,0.3)] text-[#3fb950] shadow-[0_0_8px_rgba(63,185,80,0.3)]' : 'bg-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.5)]'}`}>
              {pttEnabled ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* PTT Key Binding */}
          <div className="px-3 py-2.5 hover:bg-[rgba(255,255,255,0.08)] border-t border-[rgba(255,255,255,0.1)] transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[rgba(255,255,255,0.9)]">PTT Key:</span>
              {isBinding ? (
                <span className="text-xs px-2 py-1 bg-[rgba(210,153,34,0.3)] text-[#d29922] rounded-md animate-pulse shadow-[0_0_8px_rgba(210,153,34,0.3)]">
                  Press a key...
                </span>
              ) : (
                <button
                  onClick={() => setIsBinding(true)}
                  className="text-xs px-2 py-1 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-md text-[rgba(255,255,255,0.8)] transition-all"
                >
                  {pttKey ? getKeyDisplayName(pttKey) : 'Not set'}
                </button>
              )}
            </div>
          </div>

          {/* Clear PTT Key */}
          {pttKey && (
            <div
              className="px-3 py-2.5 hover:bg-[rgba(248,81,73,0.1)] border-t border-[rgba(255,255,255,0.1)] cursor-pointer text-[#f85149] transition-all"
              onClick={() => {
                onPttKeyChange(null);
                setIsOpen(false);
              }}
            >
              Clear PTT Key
            </div>
          )}

          <div className="px-3 py-2.5 border-t border-[rgba(255,255,255,0.1)] text-xs text-[rgba(255,255,255,0.4)]">
            {pttEnabled
              ? 'Hold the PTT key to transmit'
              : 'Enable PTT to use key binding'}
          </div>
        </div>
      )}
    </div>
  );
};
