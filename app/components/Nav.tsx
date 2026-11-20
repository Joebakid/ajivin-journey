'use client';

import Link from 'next/link';
import Logo from '@/app/components/Logo';
import NotificationFeed from '@/app/components/NotificationFeed';
import LogoutButton from '@/app/components/LogoutButton';
import ThemeToggle from '@/app/components/ThemeToggle';

export interface NavProps {
  userId: number;
  userName: string;
  userRole: 'manager' | 'driver' | 'staff' | string;
}

export default function Nav({ userId, userName, userRole }: NavProps) {
  const roleDisplay =
    userRole === 'manager'
      ? 'Logistics Manager'
      : userRole === 'staff'
      ? 'Staff Member'
      : 'Fleet Driver';

  const homeHref =
    userRole === 'manager'
      ? '/dashboard/manager'
      : userRole === 'staff'
      ? '/dashboard/staff'
      : '/dashboard/driver';

  return (
    <header className="sticky top-0 z-40 w-full flex justify-center px-3 sm:px-6 pointer-events-none !bg-transparent !border-0 !shadow-none">
      <div className="pointer-events-auto w-full max-w-3xl bg-white border-x border-b border-slate-200 rounded-b-2xl sm:rounded-b-3xl shadow-md px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
        {/* Left: Logo & User Greeting */}
        <Link href={homeHref} className="flex items-center gap-3 min-w-0 group">
          <Logo className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-xs sm:text-sm leading-tight text-slate-900 truncate flex items-center gap-1.5 group-hover:text-[#0a7337] transition-colors">
              Hello, {userName}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">
              {roleDisplay}
            </p>
          </div>
        </Link>

        {/* Right: Theme + Notifications + Logout */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ThemeToggle />
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />
          <NotificationFeed userId={userId} userRole={userRole as any} />
          <LogoutButton userId={userId} />
        </div>
      </div>
    </header>
  );
}