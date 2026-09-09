import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { 
  Bot, 
  Send, 
  Sparkles, 
  RefreshCw,
  User
} from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AIAssistantPage() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hello **${user?.name}**! I am the **SnapServe Executive AI Assistant**.\n\nI have direct access to our live work management database with strict role-based authorization. You can ask me questions regarding real tasks, tickets, active workloads, cross-department dependencies, or project risks.\n\nHow can I help you right now?`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'ADMIN' || isSuperAdmin;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      api.post('/ai/chat', {
        message,
        history: messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
      }),
    onSuccess: (res: any) => {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: res.data.response,
          timestamp: new Date()
        }
      ]);
    },
    onError: (err: any) => {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `⚠️ Error processing query: ${err?.response?.data?.error || 'Unable to connect to AI orchestrator.'}`,
          timestamp: new Date()
        }
      ]);
    }
  });

  const handleSend = (text?: string) => {
    const queryText = text || input;
    if (!queryText.trim() || chatMutation.isPending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: queryText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    chatMutation.mutate(queryText);
  };

  const adminPrompts = [
    'What is happening today across the company?',
    'Which projects are at risk and why?',
    'Who is currently overloaded on our teams?',
    'What tasks or blockers are impacting FDE?',
    'Show ABC Corp open issues and linked deliverables',
    'Which tasks need immediate attention before deadline?'
  ];

  const employeePrompts = [
    'What should I work on today?',
    'Show my overdue or high priority tasks',
    'Are any of my tasks blocked by dependencies?',
    'Break down my current priority task into steps',
  ];

  const suggestedPrompts = isAdmin ? adminPrompts : employeePrompts;

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-subtle">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-purple text-white shadow-sm">
            <Bot size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
              SnapServe Executive Assistant
              <span className="badge bg-purple-subtle text-purple border border-purple/30 text-[10px] font-mono">
                RBAC ENFORCED
              </span>
            </h1>
            <p className="text-xs text-muted">
              Live operational query engine backed by real database records.
            </p>
          </div>
        </div>

        <button 
          className="btn btn-ghost btn-sm text-xs flex items-center gap-1 text-muted hover:text-primary"
          onClick={() => setMessages([messages[0]])}
        >
          <RefreshCw size={13} /> Clear Chat
        </button>
      </div>

      {/* Suggested Quick Prompt Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {suggestedPrompts.map((prompt, i) => (
          <button
            key={i}
            className="px-3 py-1.5 rounded-full bg-surface border border-subtle text-xs text-secondary hover:text-primary hover:border-purple/50 transition shrink-0 flex items-center gap-1"
            onClick={() => handleSend(prompt)}
          >
            <Sparkles size={11} className="text-purple" />
            <span>{prompt}</span>
          </button>
        ))}
      </div>

      {/* Chat Messages Log */}
      <div className="card flex-1 p-4 bg-surface border-subtle overflow-y-auto space-y-4">
        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div 
              key={m.id}
              className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white ${
                isUser ? 'bg-accent' : 'bg-purple'
              }`}>
                {isUser ? <User size={16} /> : <Bot size={16} />}
              </div>

              <div className={`p-4 rounded-xl text-xs leading-relaxed ${
                isUser 
                  ? 'bg-accent text-white rounded-tr-none' 
                  : 'bg-elevated border border-subtle text-primary rounded-tl-none space-y-2'
              }`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          );
        })}

        {chatMutation.isPending && (
          <div className="flex gap-3 max-w-xl">
            <div className="w-8 h-8 rounded-lg bg-purple text-white flex items-center justify-center shrink-0">
              <Bot size={16} />
            </div>
            <div className="p-3.5 rounded-xl bg-elevated border border-subtle text-xs text-muted flex items-center gap-2">
              <div className="spinner spinner-sm" />
              <span>Querying database and reasoning...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form 
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        className="flex items-center gap-2 bg-surface border border-subtle p-2 rounded-xl focus-within:border-accent transition"
      >
        <input 
          type="text" 
          placeholder="Ask about tasks, blocked deliverables, customer projects, or team workloads..."
          className="flex-1 bg-transparent border-none text-xs text-primary px-3 py-2 focus:outline-none placeholder:text-muted"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button 
          type="submit" 
          className="btn btn-primary btn-sm flex items-center gap-1 px-4"
          disabled={!input.trim() || chatMutation.isPending}
        >
          <Send size={13} />
          <span>Ask</span>
        </button>
      </form>
    </div>
  );
}
