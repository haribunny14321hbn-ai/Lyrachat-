import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Image as ImageIcon, Mic, X, Edit2, User, Bot, Copy, Check } from 'lucide-react';
import { Message, UserProfile } from '../types';

// --- Markdown Renderer ---
// A simple, safe markdown renderer to avoid heavy dependencies in this generated context.
// Supports code blocks, bold, italic.
const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const parts = content.split(/(```[\s\S]*?```)/g);
  
  return (
    <div className="text-sm md:text-base leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const content = part.slice(3, -3).replace(/^([a-z]+)\n/, '');
          const lang = part.slice(3, -3).match(/^([a-z]+)\n/)?.[1] || '';
          return (
            <div key={index} className="my-4 rounded-md overflow-hidden bg-slate-800 border border-slate-700">
               {lang && <div className="px-3 py-1 bg-slate-700 text-xs text-slate-300 font-mono">{lang}</div>}
               <pre className="p-3 overflow-x-auto text-slate-100 font-mono text-sm">
                 <code>{content}</code>
               </pre>
            </div>
          );
        }
        // Basic inline formatting
        // Note: This is a simplistic implementation. For production, use 'react-markdown'
        return (
          <span key={index} dangerouslySetInnerHTML={{ 
            __html: part
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-700 px-1 rounded font-mono text-sm">$1</code>')
              .replace(/\n/g, '<br/>')
          }} />
        );
      })}
    </div>
  );
};

// --- Message Item ---
interface MessageItemProps {
  message: Message;
  profile: UserProfile;
}

export const MessageItem: React.FC<MessageItemProps> = React.memo(({ message, profile }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const copyText = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`group flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] md:max-w-[75%] gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className="flex-shrink-0 mt-1">
          <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center overflow-hidden border shadow-sm ${isUser ? 'bg-slate-200 dark:bg-slate-700' : 'bg-gradient-to-br from-lyra-light to-lyra-dark'}`}>
            {isUser ? (
              profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="User" className="w-full h-full object-cover" />
              ) : (
                <User size={20} className="text-slate-500 dark:text-slate-300" />
              )
            ) : (
              <Bot size={20} className="text-white" />
            )}
          </div>
        </div>

        {/* Bubble */}
        <div className={`relative flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Name */}
          <span className="text-xs text-slate-400 mb-1 px-1">
            {isUser ? profile.name : 'Lyra'}
          </span>

          <div className={`
            relative px-4 py-3 rounded-2xl shadow-sm text-slate-800 dark:text-slate-100
            ${isUser 
              ? 'bg-white dark:bg-slate-800 rounded-tr-sm' 
              : 'bg-white dark:bg-slate-800 rounded-tl-sm'
            }
            ${message.isError ? 'border-2 border-red-400' : 'border border-slate-100 dark:border-slate-700'}
          `}>
            {message.image && (
              <div className="mb-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
                <img src={message.image} alt="Attachment" className="max-w-full max-h-64 object-cover" />
              </div>
            )}
            <MarkdownRenderer content={message.content} />
            
            {/* Action Bar (Hover) */}
            <div className={`
              absolute -bottom-8 ${isUser ? 'right-0' : 'left-0'} 
              opacity-0 group-hover:opacity-100 transition-opacity flex gap-2
            `}>
              <button onClick={copyText} className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// --- Chat Input ---
interface ChatInputProps {
  onSend: (text: string, image?: string) => void;
  isLoading: boolean;
  enterToSend: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading, enterToSend }) => {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [text]);

  const handleSend = () => {
    if ((!text.trim() && !image) || isLoading) return;
    onSend(text, image || undefined);
    setText('');
    setImage(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (enterToSend && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const toggleVoice = () => {
    if (isListening) {
      // Logic handled by recognition end
      setIsListening(false);
      return;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setText((prev) => prev + (prev ? ' ' : '') + transcript);
      };
      
      recognition.start();
    } else {
      alert("Voice input not supported in this browser.");
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      {image && (
        <div className="relative inline-block mb-2">
          <img src={image} alt="Preview" className="h-20 rounded-lg border border-slate-300 dark:border-slate-600" />
          <button 
            onClick={() => setImage(null)}
            className="absolute -top-2 -right-2 bg-slate-500 text-white rounded-full p-0.5 hover:bg-slate-600"
          >
            <X size={14} />
          </button>
        </div>
      )}
      
      <div className="relative flex items-end gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-lg p-2 transition-all focus-within:ring-2 focus-within:ring-lyra/50">
        
        <label className="p-2.5 text-slate-400 hover:text-lyra cursor-pointer transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <ImageIcon size={22} />
        </label>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Lyra anything..."
          className="flex-1 bg-transparent border-none outline-none resize-none py-3 max-h-[150px] text-slate-800 dark:text-slate-100 placeholder-slate-400"
          rows={1}
        />

        <button 
          onClick={toggleVoice}
          className={`p-2.5 rounded-full transition-colors ${isListening ? 'text-red-500 animate-pulse bg-red-50 dark:bg-red-900/20' : 'text-slate-400 hover:text-lyra hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        >
          <Mic size={22} />
        </button>

        <button
          onClick={handleSend}
          disabled={(!text.trim() && !image) || isLoading}
          className={`p-3 rounded-full transition-all duration-200 ${
            (!text.trim() && !image) || isLoading 
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed' 
              : 'bg-lyra text-white shadow-md hover:bg-lyra-dark hover:scale-105 active:scale-95'
          }`}
        >
          <Send size={20} />
        </button>
      </div>
      <div className="text-center mt-2 text-xs text-slate-400 hidden md:block">
        Lyra can make mistakes. Check important info.
      </div>
    </div>
  );
};
