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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#2b2b2b] border border-[#444] rounded shadow-2xl w-[400px] text-gray-200 flex flex-col">
        {/* Header */}
        <div className="bg-[#333] px-4 py-2 border-b border-[#111] flex items-center">
          <Globe size={16} className="mr-2 text-blue-400" />
          <span className="font-semibold text-sm">Connect to Server</span>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-400 uppercase">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#444] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="mumble.example.com"
              required
            />
          </div>

          <div className="flex space-x-4">
            <div className="space-y-1 flex-1">
              <label className="text-xs font-bold text-gray-400 uppercase">Port</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#444] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="64738"
                required
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-xs font-bold text-gray-400 uppercase">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#444] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
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
                 className="rounded bg-[#1a1a1a] border-[#444]"
               />
            </div>
            <div className="flex flex-col">
                <label htmlFor="insecure" className="text-sm select-none cursor-pointer">Allow self-signed certificates</label>
                <span className="text-[10px] text-gray-500 flex items-center mt-0.5">
                    <ShieldAlert size={10} className="mr-1" />
                    Required for most private servers
                </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end space-x-2 pt-4 border-t border-[#333] mt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-1.5 text-xs font-medium rounded bg-[#333] hover:bg-[#444] border border-[#555] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium rounded bg-blue-700 hover:bg-blue-600 text-white border border-blue-800 transition-colors"
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};