
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, ChatSession } from './types';
import { createChatSession, sendMessageStream, getGroundingSources } from './services/geminiService';
import { PlusIcon, SendIcon, ImageIcon, TrashIcon, BotIcon } from './components/Icons';
import MessageItem from './components/MessageItem';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('abhav_ai_vault');
    try {
      return saved ? (JSON.parse(saved) as ChatSession[]) : [];
    } catch (e) {
      return [];
    }
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem('abhav_ai_vault', JSON.stringify(sessions));
  }, [sessions]);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const startNewSession = useCallback(() => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Discussion',
      messages: [],
      lastModified: new Date()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    chatRef.current = createChatSession();
    setIsSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (sessions.length === 0) {
      startNewSession();
    } else if (!currentSessionId) {
      setCurrentSessionId(sessions[0].id);
      chatRef.current = createChatSession();
    }
  }, [sessions.length, currentSessionId, startNewSession]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages, isTyping]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachments(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (currentSessionId === id) {
      setCurrentSessionId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && attachments.length === 0) || isTyping || !currentSessionId) return;

    const messageText = inputText.trim();
    const currentAttachments = [...attachments];
    setInputText('');
    setAttachments([]);
    setIsTyping(true);

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: messageText,
      attachments: currentAttachments,
      timestamp: new Date()
    };

    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return {
          ...s,
          messages: [...s.messages, userMsg],
          lastModified: new Date(),
          title: s.messages.length === 0 ? (messageText.substring(0, 30) || 'Query') : s.title
        };
      }
      return s;
    }));

    try {
      if (!chatRef.current) chatRef.current = createChatSession();

      const assistantMsgId = (Date.now() + 1).toString();
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'model',
        text: '',
        timestamp: new Date(),
      };

      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: [...s.messages, assistantMsg] };
        }
        return s;
      }));

      let fullText = '';
      const stream = sendMessageStream(chatRef.current, messageText, currentAttachments);
      
      for await (const chunk of stream) {
        fullText += chunk.text || '';
        const sources = getGroundingSources(chunk);
        
        setSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            return {
              ...s,
              messages: s.messages.map(m => 
                m.id === assistantMsgId 
                  ? { ...m, text: fullText, groundingSources: sources.length > 0 ? sources : m.groundingSources } 
                  : m
              )
            };
          }
          return s;
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Navigation Drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-80 bg-slate-900 border-r border-white/5 transition-all duration-500 ease-in-out transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:relative lg:translate-x-0 shadow-2xl`}>
        <div className="flex flex-col h-full">
          <div className="p-6">
            <div className="flex items-center space-x-3 mb-8">
               <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <BotIcon className="text-white w-6 h-6" />
               </div>
               <span className="text-xl font-bold tracking-tight text-white">Abhav's ai</span>
            </div>
            <button 
              onClick={startNewSession}
              className="w-full flex items-center justify-center space-x-2 px-4 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition-all shadow-xl shadow-indigo-900/20 font-semibold group"
            >
              <PlusIcon className="group-hover:rotate-90 transition-transform" />
              <span>New Conversation</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-3 space-y-2 pb-6">
            <div className="px-3 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Public Session History</div>
            {sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => {
                  setCurrentSessionId(session.id);
                  setIsSidebarOpen(false);
                }}
                className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${currentSessionId === session.id ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'hover:bg-white/5 text-slate-400 border border-transparent'}`}
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  <span className="truncate text-sm font-medium">{session.title}</span>
                </div>
                <button 
                  onClick={(e) => deleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all ml-2"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-6 border-t border-white/5 bg-slate-900/40">
            <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-sm shadow-emerald-500"></div>
                <span>Abhav's Core Live</span>
              </div>
              <span className="text-indigo-400">v1.2</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#020617] relative">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-6 py-5 glass border-b border-white/5 sticky top-0 z-40">
          <div className="flex items-center space-x-4">
            <button 
              className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
              onClick={() => setIsSidebarOpen(true)}
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-extrabold text-white tracking-tight">Abhav's ai</h2>
              <div className="hidden sm:block px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-tighter rounded border border-emerald-500/20">Public Access</div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex px-4 py-1.5 bg-slate-800/40 rounded-full border border-white/5 text-[10px] text-slate-400 uppercase font-black tracking-widest">
              Standalone App
            </div>
          </div>
        </header>

        {/* Messaging Pane */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 md:px-12 py-8 space-y-6"
        >
          {currentSession?.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 max-w-2xl mx-auto px-6 animate-in fade-in zoom-in duration-700">
              <div className="w-24 h-24 bg-indigo-600/10 rounded-[2.5rem] flex items-center justify-center border border-indigo-600/20 shadow-2xl shadow-indigo-600/5 rotate-3 hover:rotate-0 transition-transform">
                <BotIcon className="w-12 h-12 text-indigo-500" />
              </div>
              <div className="space-y-3">
                <h2 className="text-4xl font-black text-white tracking-tighter">Welcome to Abhav's ai</h2>
                <p className="text-slate-400 text-lg font-medium leading-relaxed">The official public interface for Abhav's custom-built intelligence. Powerful, intuitive, and accessible anywhere.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {[
                  "Write a script for a web application",
                  "What are the latest breakthroughs in tech?",
                  "Analyze an image for hidden details",
                  "Plan a comprehensive project roadmap"
                ].map((suggestion, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setInputText(suggestion)}
                    className="p-5 bg-white/5 border border-white/5 rounded-2xl hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left text-sm text-slate-300 font-medium"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {currentSession?.messages.map(msg => (
                <MessageItem key={msg.id} message={msg} />
              ))}
              {isTyping && (
                <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center border border-white/5">
                      <BotIcon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="bg-slate-800/50 border border-white/5 px-5 py-3 rounded-2xl flex items-center space-x-2">
                       <div className="typing-indicator flex space-x-1">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                       </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Input Dock */}
        <div className="p-6 md:p-10 bg-[#020617] border-t border-white/5">
          <div className="max-w-4xl mx-auto space-y-4">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-3 pb-2 animate-in slide-in-from-bottom-2 duration-300">
                {attachments.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img} alt="preview" className="w-24 h-24 object-cover rounded-2xl border border-white/10 shadow-lg" />
                    <button 
                      onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative flex items-end space-x-4">
              <div className="flex-1 relative group">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Ask Abhav's ai anything..."
                  className="w-full bg-white/5 border border-white/10 text-white rounded-[2rem] px-6 py-5 pr-16 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none max-h-60 min-h-[64px] font-medium leading-relaxed"
                  rows={1}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute right-5 bottom-4 p-2.5 text-slate-400 hover:text-indigo-400 transition-colors"
                  title="Upload Image"
                >
                  <ImageIcon className="w-7 h-7" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  multiple 
                  onChange={handleFileUpload} 
                />
              </div>
              
              <button
                onClick={handleSendMessage}
                disabled={(!inputText.trim() && attachments.length === 0) || isTyping}
                className={`p-5 rounded-[2rem] transition-all shadow-2xl ${
                  (!inputText.trim() && attachments.length === 0) || isTyping
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-white/5'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-600/30 hover:scale-105 active:scale-95'
                }`}
              >
                <SendIcon className="w-7 h-7" />
              </button>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-600 uppercase font-black tracking-widest px-4">
              <div className="flex items-center space-x-2">
                <span>Optimized for Global Browsers</span>
                <span className="text-indigo-500 opacity-50">•</span>
                <span className="text-emerald-400">Public Link Active</span>
              </div>
              <span className="mt-2 sm:mt-0">Built & Owned by Abhav</span>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Sidebar Scrim */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
