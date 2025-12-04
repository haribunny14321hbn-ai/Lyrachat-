import React, { useState, useEffect, useRef } from 'react';
import { Settings, Plus, MessageSquare, Trash2, Moon, Sun, Menu, X, Save, Bot } from 'lucide-react';
import { 
  ChatSession, 
  Message, 
  AppSettings, 
  DEFAULT_SETTINGS, 
  ModelProvider,
  DEFAULT_SYSTEM_INSTRUCTION
} from './types';
import { aiService } from './services/aiService';
import { ChatInput, MessageItem } from './components/ChatComponents';

export default function App() {
  // State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load Data
  useEffect(() => {
    const savedSessions = localStorage.getItem('lyra_sessions');
    const savedSettings = localStorage.getItem('lyra_settings');
    if (savedSessions) setSessions(JSON.parse(savedSessions));
    if (savedSettings) setSettings(JSON.parse(savedSettings));
    
    // Create new chat if none exists
    if (!savedSessions || JSON.parse(savedSessions).length === 0) {
      createNewChat();
    } else {
        // Select most recent
        const parsed = JSON.parse(savedSessions);
        if(parsed.length > 0) setCurrentSessionId(parsed[0].id);
    }
  }, []);

  // Persist Data
  useEffect(() => {
    localStorage.setItem('lyra_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('lyra_settings', JSON.stringify(settings));
    // Apply Dark Mode
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, currentSessionId, isLoading]);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const createNewChat = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: settings.activeModel
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    if (currentSessionId === id) {
      setCurrentSessionId(newSessions[0]?.id || null);
      if (newSessions.length === 0) createNewChat();
    }
  };

  const handleSendMessage = async (text: string, image?: string) => {
    if (!currentSessionId) return;

    // 1. Add User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      image
    };

    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return { ...s, messages: [...s.messages, userMsg], updatedAt: Date.now() };
      }
      return s;
    }));

    setIsLoading(true);

    // 2. Prepare Placeholder for AI Message
    const aiMsgId = (Date.now() + 1).toString();
    const aiMsgPlaceholder: Message = {
      id: aiMsgId,
      role: 'model',
      content: '', // Will stream into here
      timestamp: Date.now()
    };

    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return { ...s, messages: [...s.messages, aiMsgPlaceholder] };
      }
      return s;
    }));

    // 3. Stream Response
    const sessionMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];
    const contextMessages = [...sessionMessages, userMsg];

    await aiService.streamResponse(contextMessages, settings, {
      onChunk: (chunk) => {
        setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            const newMsgs = [...s.messages];
            const target = newMsgs.find(m => m.id === aiMsgId);
            if (target) target.content += chunk;
            return { ...s, messages: newMsgs };
          }
          return s;
        }));
      },
      onComplete: async (fullText) => {
        setIsLoading(false);
        // Smart Title Check
        if (contextMessages.length <= 1) { // If this was the first turn
           const title = await aiService.generateTitle(settings, text, settings.activeModel);
           setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, title } : s));
        }
      },
      onError: (err) => {
        setIsLoading(false);
        setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            const newMsgs = [...s.messages];
            const target = newMsgs.find(m => m.id === aiMsgId);
            if (target) {
                target.content = `Error: ${err.message}`;
                target.isError = true;
            }
            return { ...s, messages: newMsgs };
          }
          return s;
        }));
      }
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-30 w-72 h-full flex flex-col
        bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800
        transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r from-lyra to-blue-500 bg-clip-text text-transparent">
            Lyra Chat
          </h1>
          <button onClick={createNewChat} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Plus size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => {
                setCurrentSessionId(session.id);
                if (window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              className={`
                group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all
                ${currentSessionId === session.id 
                  ? 'bg-lyra/10 text-lyra-dark dark:text-lyra-light font-medium' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}
              `}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare size={18} className="flex-shrink-0 opacity-70" />
                <span className="truncate text-sm">{session.title}</span>
              </div>
              <button 
                onClick={(e) => deleteChat(e, session.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center w-full gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-lyra to-blue-500 flex items-center justify-center text-white text-xs font-bold">
               {settings.profile.name[0].toUpperCase()}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{settings.profile.name}</p>
              <p className="text-xs opacity-70">Settings</p>
            </div>
            <Settings size={18} />
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full relative w-full">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
            >
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[200px] md:max-w-md">
                {currentSession?.title || 'New Chat'}
              </h2>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-lyra animate-pulse' : 'bg-green-500'}`}></span>
                {settings.activeModel}
              </span>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
          <div className="max-w-4xl mx-auto min-h-full flex flex-col justify-end">
            {currentSession?.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400 space-y-4">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                  <Bot size={40} className="text-lyra" />
                </div>
                <h3 className="text-2xl font-bold text-slate-700 dark:text-slate-200">Hello, {settings.profile.name}</h3>
                <p>How can I help you today?</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-8 w-full max-w-lg">
                  {["Explain quantum physics", "Write a haiku about code", "Debug this React component", "Plan a trip to Japan"].map(q => (
                    <button 
                      key={q} 
                      onClick={() => handleSendMessage(q)}
                      className="p-3 text-sm border border-slate-200 dark:border-slate-700 rounded-xl hover:border-lyra/50 hover:bg-lyra/5 transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              currentSession?.messages.map((msg) => (
                <MessageItem key={msg.id} message={msg} profile={settings.profile} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="w-full bg-white dark:bg-slate-950">
          <ChatInput onSend={handleSendMessage} isLoading={isLoading} enterToSend={settings.enterToSend} />
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-xl font-bold">Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Profile */}
              <section>
                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Profile</h4>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-medium">Display Name</span>
                    <input 
                      type="text" 
                      value={settings.profile.name}
                      onChange={(e) => setSettings({...settings, profile: {...settings.profile, name: e.target.value}})}
                      className="mt-1 w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-lyra outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Avatar URL</span>
                    <input 
                      type="text" 
                      value={settings.profile.avatarUrl || ''}
                      placeholder="https://example.com/me.jpg"
                      onChange={(e) => setSettings({...settings, profile: {...settings.profile, avatarUrl: e.target.value}})}
                      className="mt-1 w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-lyra outline-none text-sm"
                    />
                  </label>
                </div>
              </section>

              {/* API Keys */}
              <section>
                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">API Keys</h4>
                <div className="space-y-3">
                  {[ModelProvider.OpenAI, ModelProvider.DeepSeek].map(provider => (
                    <div key={provider} className="relative">
                      <span className="text-xs font-medium mb-1 block">{provider}</span>
                      <input 
                        type="password"
                        value={settings.apiKeys[provider] || ''}
                        onChange={(e) => setSettings({
                          ...settings, 
                          apiKeys: { ...settings.apiKeys, [provider]: e.target.value }
                        })}
                        placeholder={`sk-...`}
                        className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-lyra outline-none font-mono text-sm"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-slate-500">Keys are stored locally in your browser.</p>
                </div>
              </section>

              {/* Model Config */}
              <section>
                <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Configuration</h4>
                <div className="space-y-4">
                  <div>
                    <span className="text-sm font-medium block mb-2">Active Model</span>
                    <div className="flex gap-2">
                      {[ModelProvider.Gemini, ModelProvider.OpenAI, ModelProvider.DeepSeek].map(m => (
                        <button
                          key={m}
                          onClick={() => setSettings({...settings, activeModel: m})}
                          className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                            settings.activeModel === m 
                              ? 'bg-lyra text-white border-lyra' 
                              : 'bg-transparent border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-sm font-medium">System Instruction</span>
                    <textarea 
                      value={settings.systemInstruction}
                      onChange={(e) => setSettings({...settings, systemInstruction: e.target.value})}
                      className="mt-1 w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-lyra outline-none text-sm h-24"
                    />
                  </label>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Dark Mode</span>
                    <button 
                      onClick={() => setSettings({...settings, darkMode: !settings.darkMode})}
                      className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.darkMode ? 'bg-lyra' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${settings.darkMode ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                     <span className="text-sm font-medium">Enter to Send</span>
                     <button
                        onClick={() => setSettings({...settings, enterToSend: !settings.enterToSend})}
                        className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.enterToSend ? 'bg-lyra' : 'bg-slate-300'}`}
                     >
                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${settings.enterToSend ? 'translate-x-6' : 'translate-x-0'}`} />
                     </button>
                  </div>
                </div>
              </section>

            </div>
            
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end">
               <button 
                 onClick={() => setIsSettingsOpen(false)}
                 className="flex items-center gap-2 px-6 py-2.5 bg-lyra text-white rounded-xl hover:bg-lyra-dark transition-colors font-medium shadow-lg shadow-lyra/20"
               >
                 <Save size={18} />
                 Done
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}