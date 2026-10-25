'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-fetches the server-rendered data on this page every few seconds,
// so the manager sees trips start and end without reloading.
export default function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}