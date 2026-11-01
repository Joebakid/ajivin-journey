import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@/src/lib/db';
import OnlineTracker from '@/app/components/OnlineTracker';
import CallManager from '@/app/components/CallManager';
import Loader from '@/app/components/Loader';
import DashboardHamburgerShell from './DashboardHamburgerShell';
import { getNotificationsAction } from '@/app/actions/notification';

async function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  // Check ajivin_session_id first, fallback to userId
  const rawUserId =
    cookieStore.get('ajivin_session_id')?.value || cookieStore.get('userId')?.value;
  const userId = rawUserId ? parseInt(rawUserId, 10) : null;

  if (!userId || isNaN(userId)) {
    redirect('/login');
  }

  const userRows = await sql`
    SELECT id, name, role FROM users WHERE id = ${userId} LIMIT 1
  `;

  if (userRows.length === 0) {
    redirect('/login');
  }

  const user = userRows[0];
  const role = (user.role || 'driver').toLowerCase() as 'driver' | 'manager' | 'staff';

  // Fetch notifications globally based on the user's role and ID
  const notifications = await getNotificationsAction(userId, role as 'manager' | 'driver');

  return (
    <>
      <OnlineTracker userId={userId} />
      <CallManager userId={userId} />
      <DashboardHamburgerShell
        userId={userId}
        userName={user.name}
        userRole={role}
        notifications={notifications}
      >
        {children}
      </DashboardHamburgerShell>
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader text="Loading workspace..." />
        </div>
      }
    >
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </Suspense>
  );
}