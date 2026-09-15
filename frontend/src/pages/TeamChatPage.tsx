import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useWebSocket } from '../context/WebSocketContext';
import { 
  Send, 
  Trash2, 
  Hash, 
  MessageSquare, 
  WifiOff, 
  Plus, 
  Search, 
  X, 
  Mic, 
  Play, 
  Pause, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Paperclip, 
  Lock, 
  ShieldCheck, 
  Radio,
  AtSign
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface ChatUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  title?: string;
  role: { name: string };
  department?: { id: string; name: string; code: string; color: string };
}

interface ChatMessage {
  id: string;
  userId: string;
  recipientId?: string;
  content: string;
  channel: string;
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
  mediaName?: string;
  mediaSize?: number;
  mediaDuration?: number;
  createdAt: string;
  user: ChatUser;
  recipient?: ChatUser;
}

interface ChannelItem {
  id: string;
  name: string;
  label: string;
  description: string;
  type: 'COMPANY' | 'DEPARTMENT';
  departmentId?: string;
  departmentCode?: string;
  memberCount: number;
  color?: string;
  isGeneral?: boolean;
}

interface DMConversation {
  channel: string;
  otherUser: ChatUser;
  lastMessage?: {
    id: string;
    content: string;
    mediaType?: string;
    createdAt: string;
    senderId: string;
  };
}

// ─── AUDIO PLAYER COMPONENT (WhatsApp / Telegram style) ──────────────────────

function VoiceNotePlayer({ 
  src, 
  duration = 0, 
  isMe = false 
}: { 
  src: string; 
  duration?: number; 
  isMe?: boolean 
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {
        toast.error('Unable to play audio');
        setIsPlaying(false);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const seekTime = parseFloat(e.target.value);
    audio.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // Waveform bars simulation
  const bars = [14, 22, 10, 26, 18, 12, 28, 20, 15, 24, 19, 11, 25, 17, 23, 14, 20, 27, 13, 18];

  return (
    <div 
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '14px',
        background: isMe ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)',
        minWidth: '220px',
        maxWidth: '300px'
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: isMe ? '#ffffff' : 'var(--accent, #3b82f6)',
          color: isMe ? '#1e1b4b' : '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
        }}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>

      {/* Waveform & Scrubber */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '24px' }}>
          {bars.map((height, i) => {
            const barProgress = (i / bars.length) * 100;
            const isPassed = barProgress <= progress;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${height}px`,
                  borderRadius: '2px',
                  background: isPassed 
                    ? (isMe ? '#ffffff' : 'var(--accent, #3b82f6)') 
                    : (isMe ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.2)'),
                  transition: 'background 0.1s ease',
                  animation: isPlaying && isPassed ? 'pulse 1s infinite' : 'none'
                }}
              />
            );
          })}
        </div>

        {/* Hidden Range Input for Scrubbing */}
        <input 
          type="range"
          min="0"
          max={totalDuration || 1}
          step="0.1"
          value={currentTime}
          onChange={handleSeek}
          style={{
            width: '100%',
            height: '4px',
            opacity: 0,
            position: 'absolute',
            pointerEvents: 'none'
          }}
        />

        {/* Time Readout */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.75, fontFamily: 'monospace' }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN TEAM CHAT PAGE COMPONENT ───────────────────────────────────────────

export default function TeamChatPage() {
  const { user: currentUser } = useAuthStore();
  const { isConnected } = useWebSocket();
  const queryClient = useQueryClient();

  // Navigation & Active Room State
  const [activeChannel, setActiveChannel] = useState<string>('general');
  const [activeDMUser, setActiveDMUser] = useState<ChatUser | null>(null);

  // Filter & Search States
  const [sidebarFilter, setSidebarFilter] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [showInChatSearch, setShowInChatSearch] = useState(false);

  // New DM Modal State
  const [isNewDMModalOpen, setIsNewDMModalOpen] = useState(false);
  const [dmUserSearch, setDmUserSearch] = useState('');

  // Lightbox Modal for Media
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'IMAGE' | 'VIDEO' } | null>(null);

  // Input & Attachment States
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Mention Autocomplete States
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  // Periodic tick so 10-minute delete expiration updates dynamically
  const [, setTimeTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTimeTick(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // 1. Fetch Authorized Channels
  const { data: channelData } = useQuery<{ channels: ChannelItem[]; isSuperAdmin: boolean }>({
    queryKey: ['chat-channels'],
    queryFn: async () => {
      const res = await api.get('/chat/channels');
      return res.data;
    },
  });

  const channels: ChannelItem[] = channelData?.channels || [
    { id: 'general', name: 'general', label: 'General Team Chat', description: 'Company-wide discussion for all roles', type: 'COMPANY', memberCount: 1, isGeneral: true }
  ];

  // 2. Fetch Direct Message Conversations
  const { data: dmsList = [] } = useQuery<DMConversation[]>({
    queryKey: ['chat-dms'],
    queryFn: async () => {
      const res = await api.get('/chat/dms');
      return res.data;
    },
    refetchInterval: 5000,
  });

  // 3. Fetch Organization Users for 1-on-1 DM
  const { data: orgUsers = [] } = useQuery<ChatUser[]>({
    queryKey: ['chat-users'],
    queryFn: async () => {
      const res = await api.get('/chat/users');
      return res.data;
    },
  });

  // 4. Fetch Active Messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<ChatMessage[]>({
    queryKey: ['chat-messages', activeChannel],
    queryFn: async () => {
      const res = await api.get(`/chat/messages?channel=${activeChannel}`);
      return res.data;
    },
    refetchInterval: 3000,
  });

  // 5. Fetch Channel Unread Counts
  const { data: chatUnreadData } = useQuery<{ totalUnread: number; channelUnread: Record<string, number> }>({
    queryKey: ['chat-unread-count'],
    queryFn: async () => {
      const res = await api.get('/chat/unread-count');
      return res.data;
    },
    refetchInterval: 5000,
  });
  const channelUnread = chatUnreadData?.channelUnread || {};

  // Mark Active Channel Read Mutation
  const markReadMutation = useMutation({
    mutationFn: async (channel: string) => {
      await api.post('/chat/read', { channel });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-unread-count'] });
    }
  });

  useEffect(() => {
    if (activeChannel) {
      markReadMutation.mutate(activeChannel);
    }
  }, [activeChannel, messages?.length]);

  // Auto scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, filePreviewUrl]);

  // Handle Recording Timer
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setRecordingSeconds(0);
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  // ─── FILE SELECTION HANDLER ────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 50MB
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File exceeds maximum size of 50MB');
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── VOICE RECORDING HANDLERS (Web Audio / MediaRecorder) ──────────────────

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(250);
      setIsRecording(true);
      toast('Recording started... Speak into your microphone', { icon: '🎙️' });
    } catch (err) {
      console.error('Microphone access denied:', err);
      toast.error('Microphone access denied or not available in browser');
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    audioChunksRef.current = [];
    toast('Voice note discarded', { icon: '🗑️' });
  };

  const stopAndSendVoiceRecording = async () => {
    if (!mediaRecorderRef.current) return;

    const recordedDuration = recordingSeconds;
    setIsRecording(false);

    mediaRecorderRef.current.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      audioChunksRef.current = [];

      if (audioBlob.size < 1000) {
        toast.error('Recording too short to send');
        return;
      }

      // Upload Audio Blob
      try {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', audioBlob, `voice-note-${Date.now()}.webm`);

        const uploadRes = await api.post('/upload', formData);

        const { url, name, size } = uploadRes.data;

        // Send Voice Message
        await sendMessageMutation.mutateAsync({
          content: 'Voice note',
          mediaUrl: url,
          mediaType: 'AUDIO',
          mediaName: name || 'voice-note.webm',
          mediaSize: size,
          mediaDuration: recordedDuration,
        });

        toast.success('Voice note sent!');
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Failed to upload voice note');
      } finally {
        setIsUploading(false);
      }
    };

    mediaRecorderRef.current.stop();
  };

  // ─── SEND MESSAGE MUTATION ─────────────────────────────────────────────────

  const sendMessageMutation = useMutation({
    mutationFn: async (payload: {
      content?: string;
      mediaUrl?: string;
      mediaType?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';
      mediaName?: string;
      mediaSize?: number;
      mediaDuration?: number;
    }) => {
      const res = await api.post('/chat/messages', {
        ...payload,
        channel: activeChannel,
        recipientId: activeDMUser?.id,
      });
      return res.data;
    },
    onSuccess: (newMessage) => {
      setInputText('');
      removeSelectedFile();
      queryClient.setQueryData<ChatMessage[]>(['chat-messages', activeChannel], (old = []) => [
        ...old,
        newMessage,
      ]);
      queryClient.invalidateQueries({ queryKey: ['chat-dms'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to send message');
    },
  });

  // ─── SEND SUBMIT HANDLER (Text + Attached File) ────────────────────────────

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    try {
      let mediaUrl: string | undefined;
      let mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | undefined;
      let mediaName: string | undefined;
      let mediaSize: number | undefined;

      if (selectedFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', selectedFile);

        const uploadRes = await api.post('/upload', formData);

        mediaUrl = uploadRes.data.url;
        mediaName = uploadRes.data.originalName || selectedFile.name;
        mediaSize = uploadRes.data.size;

        if (selectedFile.type.startsWith('image/')) mediaType = 'IMAGE';
        else if (selectedFile.type.startsWith('video/')) mediaType = 'VIDEO';
        else if (selectedFile.type.startsWith('audio/')) mediaType = 'AUDIO';
        else mediaType = 'FILE';
      }

      await sendMessageMutation.mutateAsync({
        content: inputText.trim(),
        mediaUrl,
        mediaType,
        mediaName,
        mediaSize,
      });
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to deliver message');
    } finally {
      setIsUploading(false);
    }
  };

  // ─── DELETE MESSAGE MUTATION ───────────────────────────────────────────────

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await api.delete(`/chat/messages/${messageId}`);
    },
    onSuccess: (_, messageId) => {
      queryClient.setQueryData<ChatMessage[]>(['chat-messages', activeChannel], (old = []) =>
        old.filter((m) => m.id !== messageId)
      );
      toast.success('Message deleted');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to delete message');
    },
  });

  // ─── START 1-ON-1 DIRECT CHAT WITH USER ────────────────────────────────────

  const handleStartDM = (targetUser: ChatUser) => {
    const channelId = `dm_${[currentUser?.id, targetUser.id].sort().join('_')}`;
    setActiveChannel(channelId);
    setActiveDMUser(targetUser);
    setIsNewDMModalOpen(false);
  };

  // Switch to standard Channel
  const handleSelectChannel = (channel: ChannelItem) => {
    setActiveChannel(channel.id);
    setActiveDMUser(null);
  };

  // Switch to existing DM
  const handleSelectDM = (dm: DMConversation) => {
    setActiveChannel(dm.channel);
    setActiveDMUser(dm.otherUser);
  };

  // Filtered Messages by in-chat search
  const filteredMessages = messages.filter((m) => {
    if (!chatSearch.trim()) return true;
    const q = chatSearch.toLowerCase();
    return (
      m.content?.toLowerCase().includes(q) ||
      m.user?.name?.toLowerCase().includes(q) ||
      m.mediaName?.toLowerCase().includes(q)
    );
  });

  // Filtered Users in New DM modal
  const filteredDMUsers = orgUsers.filter((u) => {
    if (!dmUserSearch.trim()) return true;
    const q = dmUserSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.title?.toLowerCase().includes(q) ||
      u.department?.name.toLowerCase().includes(q)
    );
  });

  // Channel Category Groupings
  const companyChannels = channels.filter((c) => c.type === 'COMPANY');
  const departmentChannels = channels.filter((c) => c.type === 'DEPARTMENT');

  // Active Chat Header Information
  const isDMActive = activeChannel.startsWith('dm_');
  const currentChannelInfo = channels.find((c) => c.id === activeChannel);

  const getRoleBadgeColor = (roleName: string) => {
    switch (roleName?.toUpperCase()) {
      case 'SUPER_ADMIN':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'ADMIN':
        return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'FDE':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'SALES':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'MARKETING':
        return 'bg-pink-500/15 text-pink-300 border-pink-500/30';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  // ─── @ MENTION SYSTEM LOGIC ──────────────────────────────────────────────
  const mentionCandidates = React.useMemo(() => {
    const query = mentionQuery.toLowerCase();
    const isGroupChat = !activeChannel.startsWith('dm_');
    const list: { id: string; name: string; isEveryone?: boolean; user?: ChatUser }[] = [];

    // Tag @everyone option in group channels
    if (isGroupChat && ('everyone'.includes(query) || query === '')) {
      list.push({ id: '__everyone__', name: 'everyone', isEveryone: true });
    }

    // Filter candidate members for active channel
    let pool = orgUsers;
    if (activeChannel.startsWith('dept_')) {
      const deptCode = activeChannel.replace('dept_', '').toUpperCase();
      pool = orgUsers.filter((u) => u.role?.name === 'SUPER_ADMIN' || u.department?.code === deptCode);
    }

    pool
      .filter((u) => u.id !== currentUser?.id && (u.name.toLowerCase().includes(query) || (u.email && u.email.toLowerCase().includes(query))))
      .slice(0, 8)
      .forEach((u) => {
        list.push({ id: u.id, name: u.name, user: u });
      });

    return list;
  }, [mentionQuery, orgUsers, activeChannel, currentUser?.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    // Look for trailing @query pattern
    const cursorPos = e.target.selectionStart || val.length;
    const textBefore = val.slice(0, cursorPos);
    const match = textBefore.match(/@([a-zA-Z0-9_\s]*)$/);

    if (match && match[1].length < 25) {
      setMentionQuery(match[1]);
      setShowMentionMenu(true);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionMenu(false);
      setMentionQuery('');
    }
  };

  const insertMention = (name: string) => {
    const cursorPos = inputRef.current?.selectionStart ?? inputText.length;
    const textBefore = inputText.slice(0, cursorPos);
    const textAfter = inputText.slice(cursorPos);

    const atIndex = textBefore.lastIndexOf('@');
    let newText = '';
    let newPos = 0;

    if (atIndex !== -1) {
      newText = textBefore.slice(0, atIndex) + `@${name} ` + textAfter;
      newPos = atIndex + name.length + 2;
    } else {
      newText = inputText + `@${name} `;
      newPos = newText.length;
    }

    setInputText(newText);
    setShowMentionMenu(false);
    setMentionQuery('');

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionMenu && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = mentionCandidates[selectedMentionIndex];
        if (item) insertMention(item.name);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentionMenu(false);
        return;
      }
    }
  };

  const renderFormattedMessage = (content: string) => {
    if (!content) return null;
    const mentionRegex = /(@everyone|@[A-Za-z0-9_]+(?:\s+[A-Za-z0-9_]+)?)/g;
    const parts = content.split(mentionRegex);

    return (
      <span>
        {parts.map((part, i) => {
          if (!part) return null;
          if (part.toLowerCase() === '@everyone') {
            return (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 6px',
                  borderRadius: '5px',
                  background: 'rgba(245, 158, 11, 0.22)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  fontWeight: 700,
                  fontSize: '12px',
                  margin: '0 2px'
                }}
              >
                @everyone
              </span>
            );
          }
          if (part.startsWith('@')) {
            return (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '1px 6px',
                  borderRadius: '5px',
                  background: 'rgba(59, 130, 246, 0.25)',
                  color: '#93c5fd',
                  border: '1px solid rgba(96, 165, 250, 0.35)',
                  fontWeight: 600,
                  fontSize: '12px',
                  margin: '0 2px'
                }}
              >
                {part}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 4.5rem)',
        width: '100%',
        background: '#09090b',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
      }}
    >
      {/* ─── TOP APP-HEADER STRIP ─── */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'rgba(18, 18, 22, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div 
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.2))',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#93c5fd'
            }}
          >
            <MessageSquare size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#f4f4f5', letterSpacing: '-0.01em' }}>
                Enterprise Live Chat & Channels
              </span>
              <span 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  background: isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  color: isConnected ? '#34d399' : '#fbbf24',
                  border: isConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                }}
              >
                {isConnected ? (
                  <>
                    <Radio size={10} className="animate-pulse" /> Live Broadcast
                  </>
                ) : (
                  <>
                    <WifiOff size={10} /> Connecting
                  </>
                )}
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#71717a', margin: 0 }}>
              Real-time collaboration across Super Admin, Admin, Engineering, Sales, and Marketing
            </p>
          </div>
        </div>

        {/* User Status pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isSuperAdmin && (
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(168, 85, 247, 0.12)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                color: '#c084fc',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 600
              }}
              title="Super Admin has total oversight across all team channels and conversation compliance"
            >
              <ShieldCheck size={14} />
              <span>Super Admin Oversight Active</span>
            </div>
          )}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.07)'
            }}
          >
            <div 
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                color: '#ffffff'
              }}
            >
              {currentUser?.name?.charAt(0) || 'U'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f4f4f5', lineHeight: 1.2 }}>
                {currentUser?.name}
              </span>
              <span style={{ fontSize: '10px', color: '#a1a1aa' }}>
                {currentUser?.role?.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── MAIN TWO-COLUMN SPLIT ─── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        
        {/* ─── LEFT PANEL: CHANNELS & DIRECT MESSAGES SIDEBAR ─── */}
        <div 
          style={{
            width: '300px',
            background: '#0c0c0e',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0
          }}
        >
          {/* Quick Filter Input */}
          <div style={{ padding: '12px' }}>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input 
                type="text"
                placeholder="Filter channels or chats..."
                value={sidebarFilter}
                onChange={(e) => setSidebarFilter(e.target.value)}
                style={{ paddingLeft: '32px', paddingRight: '10px' }}
                className="input text-xs py-1.5 w-full bg-surface"
              />
            </div>
          </div>

          {/* Scrollable Channels & DMs List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px 8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* ─── SECTION 1: ALL-MEMBER COMPANY CHANNELS ─── */}
            <div>
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#71717a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                <span>Company Channels</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                {companyChannels
                  .filter((c) => !sidebarFilter || c.label.toLowerCase().includes(sidebarFilter.toLowerCase()))
                  .map((ch) => {
                    const isActive = activeChannel === ch.id && !isDMActive;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => handleSelectChannel(ch)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                          background: isActive 
                            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.25) 0%, rgba(79, 70, 229, 0.2) 100%)' 
                            : 'transparent',
                          color: isActive ? '#93c5fd' : '#a1a1aa',
                          boxShadow: isActive ? 'inset 0 0 0 1px rgba(96, 165, 250, 0.4)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        className="hover:bg-white/5 hover:text-white"
                      >
                        <Hash size={16} className={isActive ? 'text-blue-400' : 'text-zinc-500'} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: isActive ? 700 : 500 }} className="truncate">
                            {ch.label}
                          </div>
                          <div style={{ fontSize: '10px', color: '#71717a' }} className="truncate">
                            All organization members
                          </div>
                        </div>
                        {channelUnread[ch.id] > 0 && !isActive && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 7px',
                              borderRadius: '9999px',
                              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                              color: '#ffffff',
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              boxShadow: '0 0 10px rgba(59, 130, 246, 0.45)',
                              flexShrink: 0
                            }}
                            title={`${channelUnread[ch.id]} unopened messages`}
                          >
                            {channelUnread[ch.id]}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* ─── SECTION 2: DEDICATED TEAM CHANNELS ─── */}
            <div>
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#71717a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                <span>Team Groups</span>
                {isSuperAdmin && (
                  <span style={{ fontSize: '9px', color: '#c084fc', textTransform: 'none', fontWeight: 600 }}>
                    All Visible (Super Admin)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                {departmentChannels
                  .filter((c) => !sidebarFilter || c.label.toLowerCase().includes(sidebarFilter.toLowerCase()))
                  .map((ch) => {
                    const isActive = activeChannel === ch.id && !isDMActive;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => handleSelectChannel(ch)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                          background: isActive 
                            ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.25) 0%, rgba(79, 70, 229, 0.2) 100%)' 
                            : 'transparent',
                          color: isActive ? '#93c5fd' : '#a1a1aa',
                          boxShadow: isActive ? 'inset 0 0 0 1px rgba(96, 165, 250, 0.4)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                        className="hover:bg-white/5 hover:text-white"
                      >
                        <div 
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: ch.color || '#6366f1',
                            flexShrink: 0
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: isActive ? 700 : 500, display: 'flex', alignItems: 'center', gap: '4px' }} className="truncate">
                            <span>{ch.label}</span>
                            <Lock size={10} className="text-zinc-500" />
                          </div>
                          <div style={{ fontSize: '10px', color: '#71717a' }} className="truncate">
                            {ch.description}
                          </div>
                        </div>
                        {channelUnread[ch.id] > 0 && !isActive && (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 7px',
                              borderRadius: '9999px',
                              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                              color: '#ffffff',
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              boxShadow: '0 0 10px rgba(59, 130, 246, 0.45)',
                              flexShrink: 0
                            }}
                            title={`${channelUnread[ch.id]} unopened messages`}
                          >
                            {channelUnread[ch.id]}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* ─── SECTION 3: 1-ON-1 DIRECT MESSAGES ─── */}
            <div>
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#71717a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                <span>Direct Messages</span>
                <button
                  type="button"
                  onClick={() => setIsNewDMModalOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: '#60a5fa',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    borderRadius: '6px',
                    padding: '2px 6px',
                    cursor: 'pointer'
                  }}
                  className="hover:bg-blue-500/20"
                >
                  <Plus size={12} /> New Chat
                </button>
              </div>

              {/* DMs Conversation List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                {dmsList.length === 0 ? (
                  <div style={{ padding: '12px 8px', textAlign: 'center', fontSize: '11px', color: '#71717a' }}>
                    No 1-on-1 chats yet. Click <span style={{ color: '#60a5fa' }}>+ New Chat</span> to start messaging any colleague!
                  </div>
                ) : (
                  dmsList
                    .filter((dm) => !sidebarFilter || dm.otherUser?.name?.toLowerCase().includes(sidebarFilter.toLowerCase()))
                    .map((dm) => {
                      const isActive = activeChannel === dm.channel;
                      const user = dm.otherUser;
                      if (!user) return null;

                      return (
                        <button
                          key={dm.channel}
                          onClick={() => handleSelectDM(dm)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: 'none',
                            cursor: 'pointer',
                            width: '100%',
                            textAlign: 'left',
                            background: isActive 
                              ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.25) 0%, rgba(79, 70, 229, 0.2) 100%)' 
                              : 'transparent',
                            color: isActive ? '#93c5fd' : '#a1a1aa',
                            boxShadow: isActive ? 'inset 0 0 0 1px rgba(96, 165, 250, 0.4)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                          className="hover:bg-white/5 hover:text-white"
                        >
                          {/* User Avatar with Green Status Dot */}
                          <div className="relative shrink-0">
                            <div 
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#e4e4e7',
                                textTransform: 'uppercase'
                              }}
                            >
                              {user.avatar ? (
                                <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
                              ) : (
                                user.name?.charAt(0) || 'U'
                              )}
                            </div>
                            {/* Online dot indicator */}
                            <span 
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#10b981',
                                border: '1.5px solid #0c0c0e'
                              }}
                            />
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                              <span style={{ fontSize: '13px', fontWeight: isActive ? 700 : 600, color: isActive ? '#93c5fd' : '#f4f4f5' }} className="truncate">
                                {user.name}
                              </span>
                              {dm.lastMessage?.createdAt && (
                                <span style={{ fontSize: '10px', color: '#71717a' }}>
                                  {new Date(dm.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: '#71717a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }} className="truncate">
                                {dm.lastMessage?.mediaType === 'AUDIO' && <Mic size={11} className="text-blue-400 shrink-0" />}
                                {dm.lastMessage?.mediaType === 'IMAGE' && <ImageIcon size={11} className="text-emerald-400 shrink-0" />}
                                {dm.lastMessage?.mediaType === 'VIDEO' && <VideoIcon size={11} className="text-purple-400 shrink-0" />}
                                <span className="truncate">
                                  {dm.lastMessage?.content || (dm.lastMessage?.mediaType ? `[${dm.lastMessage.mediaType}]` : 'Direct chat')}
                                </span>
                              </div>
                              {channelUnread[dm.channel] > 0 && !isActive && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    padding: '2px 7px',
                                    borderRadius: '9999px',
                                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                    color: '#ffffff',
                                    fontFamily: 'monospace',
                                    fontWeight: 700,
                                    boxShadow: '0 0 10px rgba(59, 130, 246, 0.45)',
                                    flexShrink: 0
                                  }}
                                  title={`${channelUnread[dm.channel]} unopened messages`}
                                >
                                  {channelUnread[dm.channel]}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ─── RIGHT PANEL: ACTIVE CONVERSATION PANE ─── */}
        <div 
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#09090b',
            position: 'relative',
            minWidth: 0
          }}
        >
          {/* Active Conversation Header */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(18, 18, 22, 0.4)',
              backdropFilter: 'blur(8px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              {isDMActive ? (
                <>
                  <div className="relative shrink-0">
                    <div 
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(99, 102, 241, 0.3))',
                        border: '1px solid rgba(96, 165, 250, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#93c5fd'
                      }}
                    >
                      {activeDMUser?.avatar ? (
                        <img src={activeDMUser.avatar} alt={activeDMUser.name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        activeDMUser?.name?.charAt(0) || 'U'
                      )}
                    </div>
                    <span 
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: '9px',
                        height: '9px',
                        borderRadius: '50%',
                        background: '#10b981',
                        border: '2px solid #09090b'
                      }}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#f4f4f5' }} className="truncate">
                        {activeDMUser?.name}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border uppercase font-mono ${getRoleBadgeColor(activeDMUser?.role?.name || '')}`}>
                        {activeDMUser?.role?.name?.replace('_', ' ')}
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#71717a', margin: 0 }} className="truncate">
                      {activeDMUser?.title || activeDMUser?.department?.name || 'Direct 1-on-1 Conversation'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div 
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: currentChannelInfo?.color || '#3b82f6',
                      flexShrink: 0
                    }}
                  >
                    <Hash size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#f4f4f5' }} className="truncate">
                        {currentChannelInfo?.label || activeChannel}
                      </span>
                      {currentChannelInfo?.type === 'DEPARTMENT' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '2px 7px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                          <Lock size={10} /> Team Group
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: '#71717a', margin: 0 }} className="truncate">
                      {currentChannelInfo?.description || 'Collaborative chat room'} • {currentChannelInfo?.memberCount || 0} members
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* In-Chat Action Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowInChatSearch(!showInChatSearch)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: showInChatSearch ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  border: showInChatSearch ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.07)',
                  color: showInChatSearch ? '#93c5fd' : '#a1a1aa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                title="Search messages in this chat"
              >
                <Search size={15} />
              </button>
            </div>
          </div>

          {/* Optional In-Chat Search Bar */}
          {showInChatSearch && (
            <div 
              style={{
                padding: '8px 20px',
                background: 'rgba(24, 24, 27, 0.9)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Search size={14} className="text-muted" />
              <input 
                type="text"
                placeholder="Search messages by text or author..."
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', color: '#ffffff', fontSize: '12px', outline: 'none' }}
                autoFocus
              />
              {chatSearch && (
                <button type="button" onClick={() => setChatSearch('')} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* ─── MESSAGES FEED ─── */}
          <div 
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            {isLoadingMessages ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#71717a', fontSize: '13px' }}>
                Loading conversation messages...
              </div>
            ) : filteredMessages.length === 0 ? (
              <div 
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  textAlign: 'center',
                  padding: '40px',
                  color: '#71717a'
                }}
              >
                <div 
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '20px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                    color: '#52525b'
                  }}
                >
                  <MessageSquare size={30} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#e4e4e7', marginBottom: '6px' }}>
                  {chatSearch ? 'No messages match your search' : 'No messages in this chat yet'}
                </div>
                <p style={{ fontSize: '12px', color: '#71717a', maxWidth: '340px', lineHeight: 1.5, margin: 0 }}>
                  {chatSearch 
                    ? 'Try typing a different keyword or clear the search filter.' 
                    : isDMActive
                    ? `Start a direct conversation with ${activeDMUser?.name}. Send a text, share images, or record a voice note.`
                    : 'Be the first to share an update, start a discussion, or send a voice note to the team!'}
                </p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isMe = msg.userId === currentUser?.id;
                const messageAgeMs = Date.now() - new Date(msg.createdAt).getTime();
                const isWithin10Mins = messageAgeMs <= 10 * 60 * 1000;
                const canDelete = isSuperAdmin || (isMe && isWithin10Mins);

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      flexDirection: isMe ? 'row-reverse' : 'row'
                    }}
                    className="group/msg"
                  >
                    {/* User Avatar */}
                    <div 
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: isMe ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                        border: isMe ? '1px solid rgba(96, 165, 250, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: isMe ? '#93c5fd' : '#e4e4e7',
                        flexShrink: 0,
                        textTransform: 'uppercase'
                      }}
                    >
                      {msg.user?.avatar ? (
                        <img src={msg.user.avatar} alt={msg.user.name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        msg.user?.name?.charAt(0) || 'U'
                      )}
                    </div>

                    {/* Message Bubble Container */}
                    <div 
                      style={{
                        maxWidth: '75%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isMe ? 'flex-end' : 'flex-start',
                        gap: '4px'
                      }}
                    >
                      {/* Sender Meta Strip */}
                      <div 
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '11px',
                          color: '#71717a'
                        }}
                      >
                        <span style={{ fontWeight: 600, color: isMe ? '#93c5fd' : '#d4d4d8' }}>
                          {isMe ? 'You' : msg.user?.name}
                        </span>
                        {!isMe && msg.user?.role?.name && (
                          <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${getRoleBadgeColor(msg.user.role.name)}`}>
                            {msg.user.role.name.replace('_', ' ')}
                          </span>
                        )}
                        <span style={{ fontSize: '10px', opacity: 0.7 }}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* The Bubble Content Box */}
                      <div 
                        style={{
                          position: 'relative',
                          borderRadius: '16px',
                          padding: msg.mediaType ? '6px' : '10px 14px',
                          background: isMe 
                            ? 'linear-gradient(135deg, #2563eb 0%, #4338ca 100%)' 
                            : 'rgba(24, 24, 27, 0.95)',
                          border: isMe ? '1px solid rgba(96, 165, 250, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: '#ffffff',
                          boxShadow: isMe ? '0 4px 15px rgba(37, 99, 235, 0.25)' : '0 2px 8px rgba(0, 0, 0, 0.3)',
                          borderTopRightRadius: isMe ? '4px' : '16px',
                          borderTopLeftRadius: isMe ? '16px' : '4px'
                        }}
                      >
                        {/* 1. Voice Note Player */}
                        {msg.mediaType === 'AUDIO' && msg.mediaUrl && (
                          <VoiceNotePlayer src={msg.mediaUrl} duration={msg.mediaDuration} isMe={isMe} />
                        )}

                        {/* 2. Image Media Card */}
                        {msg.mediaType === 'IMAGE' && msg.mediaUrl && (
                          <div style={{ borderRadius: '12px', overflow: 'hidden', maxWidth: '380px' }}>
                            <img 
                              src={msg.mediaUrl} 
                              alt={msg.mediaName || 'Uploaded Image'} 
                              style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                              onClick={() => setPreviewMedia({ url: msg.mediaUrl!, type: 'IMAGE' })}
                            />
                          </div>
                        )}

                        {/* 3. Video Media Card */}
                        {msg.mediaType === 'VIDEO' && msg.mediaUrl && (
                          <div style={{ borderRadius: '12px', overflow: 'hidden', maxWidth: '420px' }}>
                            <video 
                              controls 
                              src={msg.mediaUrl} 
                              style={{ width: '100%', maxHeight: '300px', display: 'block', background: '#000000' }}
                            />
                          </div>
                        )}

                        {/* 4. Text Content */}
                        {msg.content && (
                          <div 
                            style={{
                              fontSize: '13px',
                              lineHeight: '1.5',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              padding: msg.mediaType ? '6px 8px 4px 8px' : '0'
                            }}
                          >
                            {renderFormattedMessage(msg.content)}
                          </div>
                        )}

                        {/* Delete Action on Hover */}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => deleteMessageMutation.mutate(msg.id)}
                            style={{
                              position: 'absolute',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              [isMe ? 'left' : 'right']: '-30px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#f87171',
                              width: '24px',
                              height: '24px',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                            className="opacity-0 group-hover/msg:opacity-100 transition-opacity hover:bg-rose-500/20"
                            title={isSuperAdmin ? "Delete message (Super Admin override)" : "Delete message (Available within 10 mins)"}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ─── ATTACHMENT PREVIEW STRIP (WHEN A FILE IS SELECTED) ─── */}
          {selectedFile && filePreviewUrl && (
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 16px',
                background: 'rgba(24, 24, 27, 0.95)',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(8px)'
              }}
            >
              {selectedFile.type.startsWith('image/') ? (
                <img 
                  src={filePreviewUrl} 
                  alt="Preview" 
                  style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.15)' }} 
                />
              ) : selectedFile.type.startsWith('video/') ? (
                <div 
                  style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}
                >
                  <VideoIcon size={20} />
                </div>
              ) : (
                <div 
                  style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}
                >
                  <Paperclip size={20} />
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f4f4f5' }} className="truncate">
                  {selectedFile.name}
                </div>
                <div style={{ fontSize: '10px', color: '#71717a' }}>
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to send
                </div>
              </div>

              <button
                type="button"
                onClick={removeSelectedFile}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#a1a1aa',
                  borderRadius: '50%',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                className="hover:text-white hover:bg-white/10"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* ─── COMPOSER & VOICE RECORDER INPUT BAR ─── */}
          <div 
            style={{
              padding: '12px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(18, 18, 22, 0.95)',
              backdropFilter: 'blur(12px)',
              position: 'relative'
            }}
          >
            {/* Mention Autocomplete Dropdown Menu */}
            {showMentionMenu && mentionCandidates.length > 0 && (
              <div 
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '16px',
                  right: '16px',
                  marginBottom: '8px',
                  background: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '12px',
                  boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  zIndex: 50,
                  padding: '6px'
                }}
              >
                <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Tag People or Group ({mentionCandidates.length})
                </div>
                {mentionCandidates.map((candidate, idx) => {
                  const isSelected = idx === selectedMentionIndex;
                  return (
                    <div
                      key={candidate.id}
                      onClick={() => insertMention(candidate.name)}
                      onMouseEnter={() => setSelectedMentionIndex(idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                        transition: 'all 0.12s ease'
                      }}
                    >
                      {candidate.isEveryone ? (
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'rgba(245, 158, 11, 0.25)',
                            color: '#fbbf24',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '13px'
                          }}
                        >
                          @
                        </div>
                      ) : (
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'rgba(59, 130, 246, 0.25)',
                            color: '#93c5fd',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '12px'
                          }}
                        >
                          {candidate.user?.avatar ? (
                            <img src={candidate.user.avatar} alt={candidate.user.name} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            candidate.user?.name?.charAt(0) || 'U'
                          )}
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: candidate.isEveryone ? '#fbbf24' : '#f4f4f5' }}>
                            @{candidate.name}
                          </span>
                          {candidate.isEveryone ? (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d' }}>
                              Notify all members
                            </span>
                          ) : candidate.user?.role?.name ? (
                            <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${getRoleBadgeColor(candidate.user.role.name)}`}>
                              {candidate.user.role.name.replace('_', ' ')}
                            </span>
                          ) : null}
                        </div>
                        {!candidate.isEveryone && candidate.user?.department?.name && (
                          <div style={{ fontSize: '11px', color: '#71717a' }}>
                            {candidate.user.department.name}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isRecording ? (
              /* LIVE VOICE RECORDING ACTIVE BAR */
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 16px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Pulsing Red Recording Dot */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span 
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: '#ef4444',
                        boxShadow: '0 0 10px #ef4444'
                      }}
                      className="animate-pulse"
                    />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#f87171', letterSpacing: '0.05em' }}>
                      REC
                    </span>
                  </div>

                  {/* Timer */}
                  <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: '#f4f4f5' }}>
                    {Math.floor(recordingSeconds / 60)}:{recordingSeconds % 60 < 10 ? '0' : ''}{recordingSeconds % 60}
                  </span>

                  {/* Animated Waveform Visualizer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '18px' }}>
                    {[10, 16, 22, 14, 20, 12, 24, 18, 15, 21].map((h, idx) => (
                      <div 
                        key={idx}
                        style={{
                          width: '3px',
                          height: `${h}px`,
                          borderRadius: '2px',
                          background: '#f87171',
                          animation: 'pulse 0.8s infinite'
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Cancel & Send Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={cancelVoiceRecording}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#d4d4d8',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    className="hover:bg-white/15"
                  >
                    <Trash2 size={13} /> Cancel
                  </button>

                  <button
                    type="button"
                    onClick={stopAndSendVoiceRecording}
                    disabled={isUploading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <Send size={13} /> Send Voice Note
                  </button>
                </div>
              </div>
            ) : (
              /* REGULAR INPUT FORM */
              <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Hidden File Input for Image & Video Sharing */}
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                />

                {/* Attachment Media Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#a1a1aa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  className="hover:text-white hover:bg-white/10"
                  title="Attach image or video"
                >
                  <Paperclip size={16} />
                </button>

                {/* @ Mention Trigger Button */}
                <button
                  type="button"
                  onClick={() => {
                    setInputText((prev) => (prev.endsWith('@') ? prev : (prev ? prev + ' @' : '@')));
                    setMentionQuery('');
                    setShowMentionMenu(true);
                    setTimeout(() => inputRef.current?.focus(), 20);
                  }}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: showMentionMenu ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    border: showMentionMenu ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: showMentionMenu ? '#93c5fd' : '#a1a1aa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  className="hover:text-blue-400 hover:bg-blue-500/10"
                  title="Mention someone (@everyone or member)"
                >
                  <AtSign size={16} />
                </button>

                {/* Text Message Input */}
                <input 
                  type="text"
                  ref={inputRef}
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  placeholder={
                    isDMActive 
                      ? `Message @${activeDMUser?.name}... (Type @ to tag)` 
                      : `Message #${currentChannelInfo?.label || activeChannel}... (Type @ to tag)`
                  }
                  style={{
                    flex: 1,
                    height: '40px',
                    padding: '0 14px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    color: '#f4f4f5',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                  className="focus:border-blue-500 focus:bg-white/5 transition-all"
                />

                {/* Microphone Voice Recording Trigger Button */}
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#a1a1aa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  className="hover:text-red-400 hover:bg-red-500/10"
                  title="Record voice note"
                >
                  <Mic size={16} />
                </button>

                {/* Send Message Button */}
                <button
                  type="submit"
                  disabled={(!inputText.trim() && !selectedFile) || sendMessageMutation.isPending || isUploading}
                  style={{
                    height: '40px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    background: (!inputText.trim() && !selectedFile) 
                      ? 'rgba(255, 255, 255, 0.06)' 
                      : 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                    border: 'none',
                    color: (!inputText.trim() && !selectedFile) ? '#71717a' : '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: (!inputText.trim() && !selectedFile) ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                    boxShadow: (!inputText.trim() && !selectedFile) ? 'none' : '0 2px 10px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  <Send size={14} />
                  <span>Send</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ─── NEW 1-ON-1 DIRECT CHAT MODAL ─── */}
      {isNewDMModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '480px',
              background: '#121216',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)'
            }}
          >
            {/* Modal Header */}
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f4f4f5', margin: 0 }}>
                  Start Direct Message
                </h3>
                <p style={{ fontSize: '12px', color: '#71717a', margin: '2px 0 0 0' }}>
                  Select any colleague in the organization to begin a 1-on-1 chat
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewDMModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#a1a1aa',
                  cursor: 'pointer'
                }}
                className="hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* User Search Input */}
            <div style={{ padding: '12px 20px' }}>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input 
                  type="text"
                  placeholder="Search colleagues by name, role, department..."
                  value={dmUserSearch}
                  onChange={(e) => setDmUserSearch(e.target.value)}
                  style={{ paddingLeft: '34px', paddingRight: '12px' }}
                  className="input text-xs py-2 w-full bg-surface"
                  autoFocus
                />
              </div>
            </div>

            {/* Users List */}
            <div style={{ maxHeight: '340px', overflowY: 'auto', padding: '0 12px 16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {filteredDMUsers.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
                  No members found matching your search.
                </div>
              ) : (
                filteredDMUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleStartDM(u)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left'
                    }}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <div 
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(99, 102, 241, 0.3))',
                        border: '1px solid rgba(96, 165, 250, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#93c5fd',
                        flexShrink: 0
                      }}
                    >
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        u.name.charAt(0)
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }} className="truncate">
                          {u.name}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${getRoleBadgeColor(u.role?.name || '')}`}>
                          {u.role?.name?.replace('_', ' ')}
                        </span>
                      </div>
                      <p style={{ fontSize: '11px', color: '#71717a', margin: 0 }} className="truncate">
                        {u.title || u.department?.name || u.email}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── FULLSCREEN MEDIA LIGHTBOX MODAL ─── */}
      {previewMedia && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
          onClick={() => setPreviewMedia(null)}
        >
          <div 
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewMedia(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#ffffff',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              className="hover:bg-white/20"
            >
              <X size={18} />
            </button>
            <img 
              src={previewMedia.url} 
              alt="Media Preview" 
              style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '12px', objectFit: 'contain', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }} 
            />
          </div>
        </div>
      )}

    </div>
  );
}
