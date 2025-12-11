import React, { useState, useRef, useCallback } from 'react';
import { ImagePlus, X } from 'lucide-react';

interface ChatInputProps {
  disabled: boolean;
  placeholder: string;
  channelLabel: string;
  onSend: (message: string) => void;
}

// Mumble servers typically have ~5000 byte message limit
// Base64 adds ~33% overhead, so keep raw size under ~3.5KB
const MAX_IMAGE_SIZE = 4000; // ~4KB max to stay under Mumble's message limit

export const ChatInput: React.FC<ChatInputProps> = ({
  disabled,
  placeholder,
  channelLabel,
  onSend,
}) => {
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Compress image to fit under max size (very aggressive for Mumble's small limit)
  const compressImage = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        // Start small due to Mumble's message size limit
        let width = img.width;
        let height = img.height;

        // Scale down to thumbnail size initially
        const maxDimension = 150;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        // Try decreasing quality until under max size
        let quality = 0.7;
        let dataUri = canvas.toDataURL('image/jpeg', quality);

        while (dataUri.length > MAX_IMAGE_SIZE && quality > 0.1) {
          quality -= 0.1;
          dataUri = canvas.toDataURL('image/jpeg', quality);
        }

        // If still too large, scale down more
        while (dataUri.length > MAX_IMAGE_SIZE && width > 50) {
          width *= 0.7;
          height *= 0.7;
          canvas.width = Math.round(width);
          canvas.height = Math.round(height);
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          dataUri = canvas.toDataURL('image/jpeg', 0.5);
        }

        console.log(`Compressed image: ${(dataUri.length / 1024).toFixed(1)}KB, ${Math.round(width)}x${Math.round(height)}, quality=${quality.toFixed(1)}`);
        resolve(dataUri);
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }

    try {
      setIsCompressing(true);
      const dataUri = await compressImage(file);
      setImagePreview(dataUri);
      textInputRef.current?.focus();
    } catch (err) {
      console.error('Failed to process image file:', err);
    } finally {
      setIsCompressing(false);
    }
  }, [compressImage]);

  // Handle file input change
  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFileSelect]);

  // Handle paste event
  const onPaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await handleFileSelect(file);
        }
        return;
      }
    }
  }, [handleFileSelect]);

  // Clear image preview
  const clearImage = useCallback(() => {
    setImagePreview(null);
  }, []);

  // Send message
  const sendMessage = useCallback(() => {
    if (disabled) return;

    let message = text.trim();

    if (imagePreview) {
      // Wrap image in HTML img tag (same format as received images)
      const imgHtml = `<br /><img src="${imagePreview}" />`;
      message = message ? `${message}${imgHtml}` : imgHtml;
    }

    if (message) {
      onSend(message);
      setText('');
      setImagePreview(null);
    }
  }, [disabled, text, imagePreview, onSend]);

  // Handle keydown
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return (
    <div className="bg-[rgba(255,255,255,0.05)] border-t border-[rgba(255,255,255,0.1)]">
      {/* Image Preview */}
      {(imagePreview || isCompressing) && (
        <div className="p-2 border-b border-[rgba(255,255,255,0.1)] flex items-start gap-2">
          {isCompressing ? (
            <div className="flex items-center gap-2 text-[rgba(255,255,255,0.5)]">
              <div className="w-5 h-5 border-2 border-[rgba(255,255,255,0.2)] border-t-[#58a6ff] rounded-full animate-spin" />
              <span className="text-xs">Compressing image...</span>
            </div>
          ) : (
            <>
              <div className="relative">
                <img
                  src={imagePreview!}
                  alt="Preview"
                  className="max-h-24 max-w-48 rounded-lg border border-[rgba(255,255,255,0.15)]"
                />
                <button
                  onClick={clearImage}
                  className="absolute -top-2 -right-2 bg-[#f85149] text-white rounded-full p-0.5 hover:bg-[#ff6b61] shadow-[0_0_10px_rgba(248,81,73,0.4)] transition-all"
                  title="Remove image"
                >
                  <X size={14} />
                </button>
              </div>
              <span className="text-xs text-[rgba(255,255,255,0.4)]">Press Enter to send</span>
            </>
          )}
        </div>
      )}

      {/* Input Row */}
      <div className="h-12 flex items-center px-3">
        <span className="text-[rgba(255,255,255,0.6)] text-xs font-bold mr-2">
          To {channelLabel}:
        </span>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFileInputChange}
        />

        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-1.5 mr-2 rounded-lg hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title="Upload image"
        >
          <ImagePlus size={18} className="text-[rgba(255,255,255,0.6)]" />
        </button>

        {/* Text input */}
        <input
          ref={textInputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={disabled}
          className="flex-1 h-8 text-sm bg-[rgba(0,0,0,0.3)] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 focus:outline-none focus:border-[#58a6ff] focus:shadow-[0_0_10px_rgba(88,166,255,0.2)] disabled:opacity-50 text-white placeholder-[rgba(255,255,255,0.4)] transition-all"
          placeholder={imagePreview ? "Add a caption (optional)..." : placeholder}
        />
      </div>
    </div>
  );
};
