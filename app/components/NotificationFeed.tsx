'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getNotificationsAction,
  markAllNotificationsReadAction,
  type NotificationItem,
} from '@/app/actions/notification';

export type NotificationRole = 'manager' | 'driver' | 'staff';

interface NotificationFeedProps {
  userId?: number;
  userRole?: NotificationRole | string;
}

export default function NotificationFeed({ userId, userRole }: NotificationFeedProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFetchDone = useRef(false);

  // Strictly typed role fallback
  const resolvedRole: NotificationRole =
    userRole === 'manager' || userRole === 'staff' || userRole === 'driver'
      ? userRole
      : typeof window !== 'undefined' && window.location.pathname.includes('/manager')
      ? 'manager'
      : typeof window !== 'undefined' && window.location.pathname.includes('/staff')
      ? 'staff'
      : 'driver';

  // Load client-cached read IDs
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`read_notifications_${resolvedRole}`);
      if (stored) {
        setReadIds(new Set(JSON.parse(stored)));
      }
    } catch {}
  }, [resolvedRole]);

  const fetchNotifications = async () => {
    try {
      const data = await getNotificationsAction(userId, resolvedRole as any);
      if (Array.isArray(data)) {
        if (initialFetchDone.current) {
          const latestUnread = data.find((n) => !n.is_read && !readIds.has(n.id));
          if (latestUnread && (!toastNotification || toastNotification.id !== latestUnread.id)) {
            setToastNotification(latestUnread);

            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => {
              setToastNotification(null);
            }, 12000);
          }
        }

        initialFetchDone.current = true;
        setNotifications(data);

        const unread = data.filter((n) => !n.is_read && !readIds.has(n.id)).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 3500);
    return () => {
      clearInterval(interval);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [userId, resolvedRole, readIds]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    const allIds = new Set([...Array.from(readIds), ...notifications.map((n) => n.id)]);
    setReadIds(allIds);
    setUnreadCount(0);
    setToastNotification(null);
    try {
      localStorage.setItem(`read_notifications_${resolvedRole}`, JSON.stringify(Array.from(allIds)));
    } catch {}
    await markAllNotificationsReadAction(userId, resolvedRole as any);
  };

  const getNotificationIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('missed call') || t.includes('report') || t.includes('declined')) {
      return (
        <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 text-sm font-bold">
          ⚠️
        </span>
      );
    }
    if (t.includes('trip') || t.includes('booking') || t.includes('journey')) {
      return (
        <span className="w-8 h-8 rounded-full bg-green-100 text-[#0a7337] flex items-center justify-center shrink-0 text-sm font-bold">
          🚗
        </span>
      );
    }
    if (t.includes('vehicle') || t.includes('expense')) {
      return (
        <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-sm font-bold">
          💰
        </span>
      );
    }
    return (
      <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 text-sm font-bold">
        🔔
      </span>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Toast Pop-up Banner */}
      {toastNotification && (
        <div className="fixed top-20 right-6 z-50 max-w-sm w-full bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-start gap-3">
            {getNotificationIcon(toastNotification.title)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-slate-900 truncate">
                  {toastNotification.title}
                </h4>
                <button
                  type="button"
                  onClick={() => setToastNotification(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold p-0.5"
                >
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                {toastNotification.message}
              </p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <span className="text-[10px] text-slate-400 font-mono">
                  {toastNotification.time}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setToastNotification(null);
                    setIsOpen(true);
                  }}
                  className="text-[11px] font-bold text-[#0a7337] hover:underline"
                >
                  View Details →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-300 hover:text-white transition-colors rounded-lg hover:bg-slate-800 focus:outline-none"
        title="Notifications"
        type="button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>

        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center border-2 border-[#1a1f24] animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">System Alerts</span>
              {unreadCount > 0 && (
                <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-[#0a7337] hover:text-[#085a2b] font-bold transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs italic">
                No notifications right now.
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.is_read && !readIds.has(n.id);
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3.5 flex items-start gap-3 transition-colors ${
                      isUnread ? 'bg-green-50/40 hover:bg-green-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    {getNotificationIcon(n.title)}

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2 mb-0.5">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {n.title}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {n.time}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed break-words">
                        {n.message}
                      </p>
                    </div>

                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-[#0a7337] mt-1.5 shrink-0"></span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}