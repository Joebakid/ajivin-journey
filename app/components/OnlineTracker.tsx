'use client';

import { useEffect } from 'react';

interface OnlineTrackerProps {
  userId: number;
}

const HEARTBEAT_MS = 10000;

export default function OnlineTracker({ userId }: OnlineTrackerProps) {
  useEffect(() => {
    if (!userId || isNaN(userId)) return;

    // 1. Periodic heartbeat to keep presence refreshed while the dashboard is open
    const sendHeartbeat = () => {
      fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'online' }),
        keepalive: true,
      }).catch(() => {});
    };

    // Beat straight away when the tab becomes visible again or the internet comes back
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };

    // 2. Instant offline when the tab or browser window is closed (the login session is kept)
    const handleExit = () => {
      const payload = JSON.stringify({ userId, status: 'away' });

      // sendBeacon is delivered even while the page is unloading
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/presence', blob);
      } else {
        fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_MS);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', sendHeartbeat);
    window.addEventListener('online', sendHeartbeat);
    window.addEventListener('pagehide', handleExit);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', sendHeartbeat);
      window.removeEventListener('online', sendHeartbeat);
      window.removeEventListener('pagehide', handleExit);
    };
  }, [userId]);

  return null; // Background worker component (no visual rendering)
}