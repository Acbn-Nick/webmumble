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
        className="cursor-pointer hover:bg-[#555] px-1 rounded"
        onClick={() => setIsOpen(!isOpen)}
      >
        Audio
      </span>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-[#3a3a3a] border border-[#555] rounded shadow-lg z-50 min-w-[220px]">
          {/* PTT Enable/Disable */}
          <div
            className="px-3 py-2 hover:bg-[#4a4a4a] cursor-pointer flex items-center justify-between"
            onClick={() => onPttEnabledChange(!pttEnabled)}
          >
            <span>Push to Talk</span>
            <span className={`text-xs px-2 py-0.5 rounded ${pttEnabled ? 'bg-green-600' : 'bg-gray-600'}`}>
              {pttEnabled ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* PTT Key Binding */}
          <div className="px-3 py-2 hover:bg-[#4a4a4a] border-t border-[#555]">
            <div className="flex items-center justify-between">
              <span>PTT Key:</span>
              {isBinding ? (
                <span className="text-xs px-2 py-1 bg-yellow-600 rounded animate-pulse">
                  Press a key...
                </span>
              ) : (
                <button
                  onClick={() => setIsBinding(true)}
                  className="text-xs px-2 py-1 bg-[#555] hover:bg-[#666] rounded"
                >
                  {pttKey ? getKeyDisplayName(pttKey) : 'Not set'}
                </button>
              )}
            </div>
          </div>

          {/* Clear PTT Key */}
          {pttKey && (
            <div
              className="px-3 py-2 hover:bg-[#4a4a4a] border-t border-[#555] cursor-pointer text-red-400"
              onClick={() => {
                onPttKeyChange(null);
                setIsOpen(false);
              }}
            >
              Clear PTT Key
            </div>
          )}

          <div className="px-3 py-2 border-t border-[#555] text-xs text-gray-400">
            {pttEnabled
              ? 'Hold the PTT key to transmit'
              : 'Enable PTT to use key binding'}
          </div>
        </div>
      )}
    </div>
  );
};
