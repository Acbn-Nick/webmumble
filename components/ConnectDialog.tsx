import React, { useState } from 'react';
import { ServerConfig } from '../types';
import { Globe, ShieldAlert } from 'lucide-react';

interface ConnectDialogProps {
  onConnect: (config: ServerConfig) => void;
  onCancel: () => void;
}

export const ConnectDialog: React.FC<ConnectDialogProps> = ({ onConnect, onCancel }) => {
  const [address, setAddress] = useState('localhost');
  const [port, setPort] = useState('64738');
  const [username, setUsername] = useState('WebUser');
  const [insecure, setInsecure] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect({ address, port, username, insecure });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[rgba(255,255,255,0.08)] backdrop-blur-xl border border-[rgba(255,255,255,0.15)] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] w-[400px] text-[#f0f0f5] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[rgba(255,255,255,0.05)] px-4 py-3 border-b border-[rgba(255,255,255,0.1)] flex items-center">
          <Globe size={16} className="mr-2 text-[#58a6ff]" />
          <span className="font-semibold text-sm">Connect to Server</span>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[rgba(255,255,255,0.5)] uppercase">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#58a6ff] focus:shadow-[0_0_10px_rgba(88,166,255,0.3)] transition-all"
              placeholder="mumble.example.com"
              required
            />
          </div>

          <div className="flex space-x-4">
            <div className="space-y-1 flex-1">
              <label className="text-xs font-bold text-[rgba(255,255,255,0.5)] uppercase">Port</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#58a6ff] focus:shadow-[0_0_10px_rgba(88,166,255,0.3)] transition-all"
                placeholder="64738"
                required
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-xs font-bold text-[rgba(255,255,255,0.5)] uppercase">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#58a6ff] focus:shadow-[0_0_10px_rgba(88,166,255,0.3)] transition-all"
                placeholder="Username"
                required
              />
            </div>
          </div>

          <div className="flex items-start space-x-2 pt-2">
            <div className="mt-0.5">
               <input
                 type="checkbox"
                 id="insecure"
                 checked={insecure}
                 onChange={(e) => setInsecure(e.target.checked)}
                 className="rounded bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.2)] accent-[#58a6ff]"
               />
            </div>
            <div className="flex flex-col">
                <label htmlFor="insecure" className="text-sm select-none cursor-pointer">Allow self-signed certificates</label>
                <span className="text-[10px] text-[rgba(255,255,255,0.4)] flex items-center mt-0.5">
                    <ShieldAlert size={10} className="mr-1" />
                    Required for most private servers
                </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end space-x-2 pt-4 border-t border-[rgba(255,255,255,0.1)] mt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.15)] border border-[rgba(255,255,255,0.15)] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium rounded-lg bg-gradient-to-r from-[#58a6ff] to-[#3d8bff] hover:shadow-[0_0_20px_rgba(88,166,255,0.4)] text-white border border-[rgba(255,255,255,0.1)] transition-all"
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};