'use client';

import { useEffect, useState } from 'react';

// Fired by the chat whenever it marks messages as read, so badges update straight away
export const CHAT_READ_EVENT = 'ajms:chat-read';

export default function UnreadBadge({ userId }: { userId: number }) {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/chat/unread?userId=${userId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTotal(Number(data.total) || 0);
      } catch {
        /* keep the last known count */
      }
    };

    load();
    const id = setInterval(load, 6000);
    const onRead = () => load();
    window.addEventListener(CHAT_READ_EVENT, onRead);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(CHAT_READ_EVENT, onRead);
    };
  }, [userId]);

  if (total <= 0) return null;

  return (
    <span
      className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold"
      aria-label={`${total} unread messages`}
    >
      {total > 99 ? '99+' : total}
    </span>
  );
}
