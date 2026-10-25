'use client';

import { useEffect } from 'react';

export default function PresenceTracker({ userId }: { userId: number }) {
  useEffect(() => {
    // Ping the server to set online status
    const setStatus = async (isOnline: boolean) => {
      await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isOnline }),
        keepalive: true // Ensures the request fires even if the tab is closing
      });
    };

    setStatus(true);

    // Ping every 5 minutes to keep active
    const interval = setInterval(() => setStatus(true), 300000);

    return () => {
      clearInterval(interval);
      setStatus(false); // Set offline on unmount
    };
  }, [userId]);

  return null; // Hidden component
}
