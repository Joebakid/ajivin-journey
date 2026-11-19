// app/components/ThemeToggle.tsx
'use client';

import { useEffect, useState } from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    try {
      // 1. Check local storage for persistent user preference
      const savedTheme = localStorage.getItem('ajivin-theme');
      
      // 2. Check system preference as a fallback
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      
      let isDark = false;
      if (savedTheme === 'dark') {
        isDark = true;
      } else if (savedTheme === 'light') {
        isDark = false;
      } else {
        // 3. Fallback to existing HTML class or system preference
        isDark = document.documentElement.classList.contains('dark') || prefersDark;
      }

      setDark(isDark);
      document.documentElement.classList.toggle('dark', isDark);
    } catch {
      // Fallback if localStorage is blocked by browser settings
      setDark(document.documentElement.classList.contains('dark'));
    }
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('ajivin-theme', next ? 'dark' : 'light');
    } catch {}
  }

  // Prevent hydration mismatch on the icon before the theme is read
  if (!mounted) {
    return (
      <button className="p-2 sm:p-2.5 rounded-full sm:rounded-xl text-slate-500 bg-white border border-slate-200 shrink-0 flex items-center justify-center opacity-50 cursor-default">
        <FiMoon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="p-2 sm:p-2.5 rounded-full sm:rounded-xl text-slate-500 bg-white hover:bg-green-50 hover:text-[#0a7337] hover:border-green-200 active:scale-95 transition-all border border-slate-200 shrink-0 flex items-center justify-center cursor-pointer"
    >
      {dark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
    </button>
  );
}