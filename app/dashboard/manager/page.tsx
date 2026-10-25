import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import Link from 'next/link';
import Container from '@/app/components/Container';
import Loader from '@/app/components/Loader';
import ChatSystem from '@/app/components/ChatSystem';
import OnlineTracker from '@/app/components/OnlineTracker';
import DashboardLayout from '@/app/components/DashboardLayout';
import PersonnelActivityViewer from '@/app/components/PersonnelActivityViewer';
import LivePersonnelTracker from '@/app/components/LivePersonnelTracker';
import PendingApprovals from '@/app/components/PendingApprovals';
import ActiveJourneys from '@/app/components/ActiveJourneys';
import AutoRefresh from '@/app/components/AutoRefresh';
import CallManager from '@/app/components/CallManager';
import UnreadBadge from '@/app/components/UnreadBadge';
import Nav from '@/app/components/Nav';

// Optimized to prevent throwing expensive SQL errors if 'started_at' doesn't exist
async function loadActiveTrips(): Promise<any[]> {
  const rows = await sql`
    SELECT t.*, u.id as driver_id, u.name as driver_name, u.phone
    FROM trips t
    JOIN users u ON t.driver_id = u.id
    WHERE t.status IN ('Active', 'En Route')
    ORDER BY t.created_at DESC
  `;
  
  return rows.map(r => ({
    ...r,
    started_at: r.started_at || r.created_at // JavaScript fallback is instant
  }));
}

async function ManagerDashboardContent({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; tripId?: string }>;
}) {
  const managerId = 2;
  const resolvedParams = await searchParams;
  const selectedUserId = resolvedParams.userId ? parseInt(resolvedParams.userId, 10) : null;
  const selectedTripId = resolvedParams.tripId ? parseInt(resolvedParams.tripId, 10) : null;

  const [
    managerResult,
    pendingTrips,
    activeTripRows,
    initialPersonnel,
    selectedUserRows,
    userTrips,
    userExpenses,
  ] = await Promise.all([
    sql`SELECT name, email, role, phone FROM users WHERE id = ${managerId}`,
    sql`
      SELECT t.id, t.destination, t.created_at, u.name as driver_name, u.phone
      FROM trips t
      JOIN users u ON t.driver_id = u.id
      WHERE t.status = 'Pending'
      ORDER BY t.created_at DESC
    `,
    loadActiveTrips(),
    sql`
      SELECT id, name, email, role, phone, license_number, is_online, last_seen
      FROM users
      ORDER BY is_online DESC, role ASC, name ASC
    `,
    selectedUserId
      ? sql`SELECT id, name, email, role, phone, license_number, is_online FROM users WHERE id = ${selectedUserId}`
      : Promise.resolve([] as any[]),
    selectedUserId
      ? sql`SELECT * FROM trips WHERE driver_id = ${selectedUserId} ORDER BY created_at DESC`
      : Promise.resolve([] as any[]),
    selectedUserId
      ? sql`SELECT * FROM expenses WHERE driver_id = ${selectedUserId} ORDER BY created_at DESC`
      : Promise.resolve([] as any[]),
  ]);

  const manager = managerResult[0] || { name: 'Manager', email: 'N/A', role: 'manager', phone: 'N/A' };
  const selectedUser = (selectedUserRows as any[])[0] || null;

  // Everyone is included in the chat menu now
  const chatPersonnel = (initialPersonnel as any[])
    .filter((p) => p.id !== managerId)
    .map((p) => ({ id: p.id, name: p.name, role: p.role, phone: p.phone }));

  const activeTrips = (activeTripRows as any[]).map((t) => ({
    id: t.id as number,
    destination: t.destination as string,
    status: t.status as string,
    fasttrack_code: (t.fasttrack_code ?? null) as string | null,
    current_location: (t.current_location ?? null) as string | null,
    is_started: (t.is_started ?? null) as boolean | null,
    started_at: t.started_at ? new Date(t.started_at).toISOString() : null,
    driver_id: t.driver_id as number,
    driver_name: t.driver_name as string,
  }));

  const initialTripId =
    selectedTripId && activeTrips.some((t) => t.id === selectedTripId)
      ? selectedTripId
      : selectedUserId
      ? activeTrips.find((t) => t.driver_id === selectedUserId)?.id ?? null
      : null;

  const tab1Content = (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 relative">
        <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase">My Profile</h3>
          <Link href={`/dashboard/profile?id=${managerId}`} className="text-xs font-bold text-[#0a7337] hover:underline flex items-center gap-1">
            Edit
          </Link>
        </div>
        <div className="flex justify-between text-sm">
          <div>
            <span className="block text-slate-500 text-[10px] uppercase tracking-wider mb-1">Email Address</span>
            <span className="font-bold text-slate-900">{manager.email}</span>
          </div>
          <div className="text-right">
            <span className="block text-slate-500 text-[10px] uppercase tracking-wider mb-1">Phone</span>
            <span className="font-bold text-slate-900">{manager.phone || 'Not Set'}</span>
          </div>
        </div>
      </div>

      <PendingApprovals initialTrips={pendingTrips as any} />
      
      {/* Renders the global fleet map ONLY if no specific driver is selected */}
      {!selectedUserId && (
        <ActiveJourneys trips={activeTrips as any} initialTripId={initialTripId} />
      )}

      {/* The list of drivers to click on */}
      <LivePersonnelTracker initialPersonnel={initialPersonnel as any} />
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 flex flex-col md:bg-gray-100">
      <OnlineTracker userId={managerId} />
      <AutoRefresh intervalMs={15000} />
      <CallManager userId={managerId} />

      <Nav userId={managerId} userName={manager.name} userRole="manager" />

      <Container className="flex-1 flex flex-col p-0 md:p-6 md:pt-0 min-h-0">
        <DashboardLayout
          initialTab={selectedUserId && !selectedTripId ? 'tab2' : 'tab1'}
          tab1Label="Overview"
          tab1Content={tab1Content}
          tab2Label="Details & Activity"
          tab2Content={
            <PersonnelActivityViewer
              key={selectedUser ? (selectedUser as any).id : 'none'}
              user={selectedUser as any}
              trips={userTrips as any[]}
              expenses={userExpenses as any[]}
            />
          }
          tab3Label="Chat"
          tab3Badge={<UnreadBadge userId={managerId} />}
          tab3Content={
            <ChatSystem
              senderId={managerId}
              receiverId={0}
              recipientName="Fleet Broadcast"
              personnelList={chatPersonnel}
            />
          }
        />
      </Container>
    </div>
  );
}

export default function ManagerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; tripId?: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader text="Loading dispatch board..." /></div>}>
      <ManagerDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}