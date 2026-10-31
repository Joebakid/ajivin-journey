'use client';

import Link from 'next/link';
import Logo from '@/app/components/Logo';
import NotificationFeed from '@/app/components/NotificationFeed';
import LogoutButton from '@/app/components/LogoutButton';

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
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={homeHref} className="flex items-center gap-3">
            <Logo className="w-9 h-9 rounded-lg" />
            <div>
              <h1 className="font-bold text-sm leading-tight text-white flex items-center gap-1.5">
                Hello, {userName}
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">
                {roleDisplay}
              </p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <NotificationFeed userId={userId} userRole={userRole as any} />
          <LogoutButton userId={userId} />
        </div>
      </div>
    </header>
  );
}