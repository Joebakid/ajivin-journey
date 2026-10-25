'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import CustomAudioPlayer from './CustomAudioPlayer';
import { requestCall, isCallLogText, stripCallPrefix } from './callEvents';
import { CHAT_READ_EVENT } from './UnreadBadge';

interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  text: string;
  created_at: string;
  sender_name: string;
  parent_id?: number | null;
  parent_text?: string | null;
  media_url?: string | null;
  media_type?: 'image' | 'video' | 'audio' | null;
  read_at?: string | null;
}

interface Personnel {
  id: number;
  name: string;
  role: string;
  phone?: string | null;
}

const MESSAGE_POLL_MS = 3000;
const UNREAD_POLL_MS = 6000;
const PRESENCE_POLL_MS = 8000;

// True only when the chat is on screen: the browser tab is in front and the chat panel is not hidden
const isOnScreen = (el: HTMLElement | null) =>
  typeof document !== 'undefined' &&
  document.visibilityState === 'visible' &&
  !!el &&
  el.getClientRects().length > 0;

export default function ChatSystem({
  senderId,
  receiverId,
  recipientName,
  personnelList = [],
}: {
  senderId: number;
  receiverId: number; // the conversation shown first (0 = fleet broadcast)
  recipientName: string;
  personnelList?: Personnel[];
}) {
  // The open conversation is this component's own state. It never reads or writes the URL,
  // so choosing someone here cannot change the other tabs, the maps or the activity panel.
  const [activeId, setActiveId] = useState(receiverId);
  const [activeName, setActiveName] = useState(recipientName);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecordingVN, setIsRecordingVN] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [online, setOnline] = useState<Record<string, boolean>>({});

  const rootRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef(activeId);
  const lastIdRef = useRef(0);
  const stickRef = useRef(true); // keep the view pinned to the newest message unless the user scrolled up
  const unreadRef = useRef<Record<string, number>>({});

  /* ------------------------------- Read state ------------------------------ */

  const markRead = useCallback(
    async (peerId: number) => {
      if (!peerId) return;
      try {
        await fetch('/api/chat/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: senderId, peerId }),
        });
        unreadRef.current = { ...unreadRef.current, [String(peerId)]: 0 };
        setUnread((prev) => (prev[String(peerId)] ? { ...prev, [String(peerId)]: 0 } : prev));
        window.dispatchEvent(new Event(CHAT_READ_EVENT));
      } catch {
        /* the next poll will retry */
      }
    },
    [senderId]
  );

  const maybeMarkRead = useCallback(() => {
    const peer = activeIdRef.current;
    if (!peer || (unreadRef.current[String(peer)] || 0) <= 0) return;
    if (isOnScreen(rootRef.current)) markRead(peer);
  }, [markRead]);

  /* -------------------------------- Messages ------------------------------- */

  const fetchMessages = useCallback(
    async (full: boolean) => {
      const peerId = activeIdRef.current;
      const after = full ? 0 : lastIdRef.current;
      try {
        const res = await fetch(`/api/chat/messages?userId=${senderId}&peerId=${peerId}&afterId=${after}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (activeIdRef.current !== peerId) return; // the user switched conversation meanwhile

        const incoming: Message[] = data.messages || [];

        if (full) {
          setMessages(incoming);
          setLoaded(true);
        } else if (incoming.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
          });
        }

        if (incoming.length > 0) {
          lastIdRef.current = incoming.reduce((max, m) => Math.max(max, m.id), lastIdRef.current);
        }

        if (peerId !== 0 && incoming.some((m) => m.sender_id === peerId) && isOnScreen(rootRef.current)) {
          markRead(peerId);
        }
      } catch {
        /* network blip: the next poll will try again */
      }
    },
    [senderId, markRead]
  );

  useEffect(() => {
    activeIdRef.current = activeId;
    lastIdRef.current = 0;
    stickRef.current = true;
    setMessages([]);
    setLoaded(false);
    setReplyingTo(null);
    setSendError(null);

    fetchMessages(true);
    const id = setInterval(() => {
      if (!document.hidden) fetchMessages(false);
    }, MESSAGE_POLL_MS);
    return () => clearInterval(id);
  }, [activeId, fetchMessages]);

  useEffect(() => {
    const el = chatContainerRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, filePreview, loaded]);

  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  /* --------------------------- Unread and presence ------------------------- */

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/chat/unread?userId=${senderId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        unreadRef.current = data.byPeer || {};
        setUnread(data.byPeer || {});
        maybeMarkRead();
      } catch {
        /* keep the last known counts */
      }
    };

    load();
    const id = setInterval(load, UNREAD_POLL_MS);
    const onRead = () => load();
    const onVisible = () => maybeMarkRead();
    window.addEventListener(CHAT_READ_EVENT, onRead);
    document.addEventListener('visibilitychange', onVisible);

    // When the chat panel is switched to (mobile tabs), clear what is now on screen
    let observer: IntersectionObserver | null = null;
    if (rootRef.current && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) maybeMarkRead();
        },
        { threshold: 0.1 }
      );
      observer.observe(rootRef.current);
    }

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(CHAT_READ_EVENT, onRead);
      document.removeEventListener('visibilitychange', onVisible);
      observer?.disconnect();
    };
  }, [senderId, maybeMarkRead]);

  const idsKey = Array.from(
    new Set([...personnelList.map((p) => p.id), activeId].filter((id) => id > 0 && id !== senderId))
  ).join(',');

  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;

    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/presence?ids=${idsKey}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setOnline(data.online || {});
      } catch {
        /* keep the last known status */
      }
    };

    load();
    const id = setInterval(load, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [idsKey]);

  const isActiveOnline = activeId !== 0 && !!online[String(activeId)];
  const othersUnread = (Object.entries(unread) as [string, number][]).reduce(
    (sum: number, [id, count]) => (Number(id) === activeId ? sum : sum + count),
    0
  );

  /* -------------------------------- Actions -------------------------------- */

  const handleStartCall = () => {
    if (activeId === 0) return;
    requestCall({ userId: activeId, name: activeName });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview('media');
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (filePreview && filePreview.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading || (!input.trim() && !selectedFile)) return;

    // Keep a copy so nothing is lost if sending fails
    const draft = { text: input.trim(), file: selectedFile, preview: filePreview, reply: replyingTo };
    const targetId = activeId;

    const formData = new FormData();
    formData.append('senderId', senderId.toString());
    formData.append('receiverId', targetId.toString());
    formData.append('text', draft.text);
    if (draft.reply) {
      formData.append('parentId', draft.reply.id.toString());
      formData.append(
        'parentText',
        draft.reply.text || (draft.reply.media_type ? `[${draft.reply.media_type}]` : 'Media')
      );
    }
    if (draft.file) formData.append('media', draft.file);

    setIsUploading(true);
    setSendError(null);
    setInput('');
    setReplyingTo(null);
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      const res = await fetch('/api/chat/send', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed');

      if (draft.preview && draft.preview.startsWith('blob:')) URL.revokeObjectURL(draft.preview);
      stickRef.current = true;
      await fetchMessages(false);
    } catch {
      // Put everything back so the user can try again
      setInput(draft.text);
      setReplyingTo(draft.reply);
      if (draft.file) {
        setSelectedFile(draft.file);
        setFilePreview(draft.preview);
      }
      setSendError('Message not sent. Check your connection and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAudioReady = (file: File) => {
    setSelectedFile(file);
    setFilePreview('audio');
    setIsRecordingVN(false);
  };

  const handleSelectChatTarget = (target: Personnel | null) => {
    setActiveId(target ? target.id : 0);
    setActiveName(target ? `${target.name} (${target.role})` : 'Fleet Broadcast');
    setIsSearching(false);
    setSearchQuery('');
  };

  const filteredPersonnel = personnelList
    .filter((p) => p.id !== senderId)
    .filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.role.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (unread[String(b.id)] || 0) - (unread[String(a.id)] || 0));

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      ref={rootRef}
      className="flex flex-col h-full w-full bg-white md:border border-slate-200 md:rounded-xl md:shadow-sm overflow-hidden relative"
    >
      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <img src={previewImage} alt="Expanded preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
          <button className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300">&times;</button>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#1a1f24] text-white px-4 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex items-center justify-center w-8 h-8 bg-[#0a7337] rounded-full text-xs font-bold uppercase shrink-0">
            {activeName.charAt(0)}
            {/* Green dot only while the person is actually online */}
            {isActiveOnline && (
              <span
                className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-[#1a1f24] rounded-full"
                title="Online"
              ></span>
            )}
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm block leading-tight truncate">{activeName}</span>
            <span className="text-[10px] text-slate-400">
              {activeId === 0 ? (
                'Fleet Broadcast (CompanyWide)'
              ) : (
                <>
                  Direct Message -{' '}
                  <span className={isActiveOnline ? 'text-green-400 font-semibold' : 'text-slate-500'}>
                    {isActiveOnline ? 'Online' : 'Offline'}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeId !== 0 && (
            <button
              type="button"
              onClick={handleStartCall}
              className="p-1.5 rounded-lg bg-[#0a7337] hover:bg-[#085a2b] text-white transition-all shadow-sm active:scale-95 flex items-center gap-1.5 text-xs px-2.5 font-bold"
              title={`Call ${activeName}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              <span>Call</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSearching(!isSearching)}
            className="relative p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Choose who to chat with"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            {othersUnread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
                {othersUnread > 99 ? '99+' : othersUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Personnel Search Overlay Dropdown */}
      {isSearching && (
        <div className="absolute top-[56px] left-0 right-0 bg-white border-b border-slate-200 shadow-xl z-30 p-3 space-y-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search personnel by name or role..."
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-[#0a7337]"
            autoFocus
          />
          <div className="max-h-56 overflow-y-auto space-y-1">
            <button
              onClick={() => handleSelectChatTarget(null)}
              className={`w-full text-left px-3 py-2 text-xs rounded-lg flex justify-between items-center ${activeId === 0 ? 'bg-green-50 text-[#0a7337] font-bold' : 'hover:bg-slate-100'}`}
            >
              <span>Fleet Broadcast</span>
              <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">All</span>
            </button>
            {filteredPersonnel.map((p) => {
              const count = unread[String(p.id)] || 0;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectChatTarget(p)}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg flex justify-between items-center gap-2 ${activeId === p.id ? 'bg-green-50 text-[#0a7337] font-bold' : 'hover:bg-slate-100'}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${online[String(p.id)] ? 'bg-green-500' : 'bg-slate-300'}`}
                      title={online[String(p.id)] ? 'Online' : 'Offline'}
                    ></span>
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {count > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                    <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">{p.role}</span>
                  </span>
                </button>
              );
            })}
            {filteredPersonnel.length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-2">No one matches that search.</p>
            )}
          </div>
        </div>
      )}

      {/* Messages Feed */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50 min-h-0"
      >
        {loaded && messages.length === 0 && (
          <p className="text-center text-xs text-slate-400 pt-6">No messages yet. Say hello.</p>
        )}

        {messages.map((msg) => {
          const isMe = msg.sender_id === senderId;
          const isCallLog = isCallLogText(msg.text);
          const cleanText = isCallLog ? stripCallPrefix(msg.text) : msg.text;
          const lowerClean = cleanText.toLowerCase();
          const isMissed = isCallLog && (lowerClean.includes('missed') || lowerClean.includes('declined'));

          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              {isCallLog ? (
                <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-sm border ${
                  isMissed
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : isMe
                    ? 'bg-green-50 text-green-800 border-green-200'
                    : 'bg-white text-slate-800 border-slate-200'
                }`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    isMissed ? 'bg-red-100 text-red-600' : 'bg-green-100 text-[#0a7337]'
                  }`}>
                    {isMissed ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    )}
                  </div>
                  <div>
                    <span className="block leading-tight">{cleanText}</span>
                    <span className="text-[10px] opacity-70 font-mono mt-0.5 block">{formatTime(msg.created_at)}</span>
                  </div>
                </div>
              ) : (
                <div className={`group relative max-w-[80%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                  isMe 
                    ? 'bg-[#0a7337] text-white rounded-br-none' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                }`}>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(msg)}
                    className={`absolute top-2 ${isMe ? '-left-7' : '-right-7'} opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-slate-600`}
                    title="Reply"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                  </button>

                  {!isMe && activeId === 0 && (
                    <span className="text-[10px] font-bold block mb-1 text-slate-400">{msg.sender_name}</span>
                  )}

                  {msg.parent_text && (
                    <div className={`text-xs p-2 mb-2 rounded border-l-2 ${
                      isMe ? 'bg-[#085a2b] border-green-200 text-green-100' : 'bg-slate-100 border-[#0a7337] text-slate-600'
                    }`}>
                      <p className="truncate font-semibold text-[10px]">Replying to message</p>
                      <p className="truncate line-clamp-1">{msg.parent_text}</p>
                    </div>
                  )}

                  {msg.media_url && (
                    <div className="mb-2 overflow-hidden rounded-lg">
                      {msg.media_type === 'image' ? (
                        <img
                          src={msg.media_url}
                          alt="Click to enlarge"
                          onClick={() => setPreviewImage(msg.media_url!)}
                          className="max-w-full max-h-60 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      ) : msg.media_type === 'video' ? (
                        <video src={msg.media_url} controls preload="metadata" className="max-w-full max-h-60 rounded-lg" />
                      ) : msg.media_type === 'audio' ? (
                        <CustomAudioPlayer src={msg.media_url} isMe={isMe} />
                      ) : null}
                    </div>
                  )}

                  {msg.text && <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>}

                  <span className={`text-[10px] block mt-1 text-right ${isMe ? 'text-green-200' : 'text-slate-400'}`}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Send error */}
      {sendError && (
        <div className="bg-red-50 border-t border-red-200 text-red-700 text-xs px-4 py-2 flex justify-between items-center shrink-0" role="alert">
          <span>{sendError}</span>
          <button onClick={() => setSendError(null)} className="font-bold text-base leading-none">&times;</button>
        </div>
      )}

      {/* Replying Context Banner */}
      {replyingTo && (
        <div className="bg-slate-100 px-4 py-2 border-t border-slate-200 flex justify-between items-center text-xs shrink-0">
          <div className="truncate pr-2">
            <span className="font-bold text-[#0a7337]">
              Replying to {replyingTo.sender_id === senderId ? 'yourself' : replyingTo.sender_name}:
            </span>
            <p className="text-slate-600 truncate">{replyingTo.text || (replyingTo.media_type ? `[${replyingTo.media_type}]` : 'Media')}</p>
          </div>
          <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-slate-600 font-bold text-base">&times;</button>
        </div>
      )}

      {/* Selected File Preview Banner */}
      {filePreview && (
        <div className="bg-slate-100 px-4 py-2 border-t border-slate-200 flex justify-between items-center text-xs shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            {filePreview.startsWith('blob:') ? (
              <img src={filePreview} alt="Preview" className="w-10 h-10 object-cover rounded cursor-pointer" onClick={() => setPreviewImage(filePreview)} />
            ) : filePreview === 'audio' ? (
              <div className="flex items-center gap-2 text-xs font-bold text-[#0a7337]">
                <span>Voice note attached</span>
              </div>
            ) : (
              <div className="w-10 h-10 bg-slate-300 rounded flex items-center justify-center font-bold text-slate-700">FILE</div>
            )}
            <span className="truncate text-slate-700 text-xs font-medium">{selectedFile?.name}</span>
          </div>
          <button onClick={clearFile} className="text-slate-400 hover:text-slate-600 font-bold text-base">&times;</button>
        </div>
      )}

      {/* Input Bar */}
      {isRecordingVN ? (
        <div className="p-3 bg-white border-t border-slate-200 shrink-0">
          <VoiceNoteRecorder onAudioReady={handleAudioReady} onCancel={() => setIsRecordingVN(false)} />
        </div>
      ) : (
        <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200 flex gap-2 items-center shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,video/*,audio/*"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-500 hover:text-[#0a7337] transition-colors rounded-full hover:bg-slate-100"
            title="Attach photo, video, or audio"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          </button>

          <button
            type="button"
            onClick={() => setIsRecordingVN(true)}
            className="p-2 text-slate-500 hover:text-red-600 transition-colors rounded-full hover:bg-slate-100"
            title="Record Voice Note"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message ${activeName}...`}
            className="flex-1 min-w-0 px-4 py-2.5 text-sm border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#0a7337] transition-all bg-slate-50 focus:bg-white"
          />

          <button
            type="submit"
            disabled={isUploading || (!input.trim() && !selectedFile)}
            className="bg-[#0a7337] hover:bg-[#085a2b] text-white p-2.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0"
          >
            {isUploading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
