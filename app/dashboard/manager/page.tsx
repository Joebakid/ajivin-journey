import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
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
import CreatePersonnelModal from '@/app/components/CreatePersonnelModal';
import VehicleFleetManager from '@/app/components/VehicleFleetManager';
import { ensureVehiclesTable } from '@/app/actions/vehicle';
import { ensureStaffTables } from '@/app/actions/staff';
import { ensureTripsTable } from '@/app/actions/trip';

async function loadActiveTrips(): Promise<any[]> {
  const rows = await sql`
    SELECT t.*, u.id as driver_id, u.name as driver_name, u.phone
    FROM trips t
    JOIN users u ON t.driver_id = u.id
    WHERE t.status IN ('Active', 'En Route')
    ORDER BY t.created_at DESC
  `;

  return rows.map((r) => ({
    ...r,
    started_at: r.started_at || r.created_at,
  }));
}

async function ManagerDashboardContent({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; tripId?: string }>;
}) {
  const cookieStore = await cookies();
  const rawUserId = cookieStore.get('userId')?.value || cookieStore.get('ajivin_session_id')?.value;
  const authUserId = rawUserId ? parseInt(rawUserId, 10) : null;

  if (!authUserId || isNaN(authUserId)) {
    redirect('/login');
  }

  await ensureTripsTable();
  await ensureVehiclesTable();
  await ensureStaffTables();

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
    vehiclesResult,
    vehicleExpensesResult,
    tripCommentsResult,
  ] = await Promise.all([
    // 1. Verify manager authorization
    sql`SELECT id, name, email, role, phone FROM users WHERE id = ${authUserId} AND role = 'manager' LIMIT 1`,

    // 2. Pending trip clearance
    sql`
      SELECT 
        t.id, 
        t.destination, 
        t.created_at, 
        t.driver_id,
        t.requester_id,
        t.scheduled_time,
        u.name as driver_name, 
        u.phone as driver_phone,
        req.name as requester_name,
        req.phone as requester_phone
      FROM trips t
      LEFT JOIN users u ON t.driver_id = u.id
      LEFT JOIN users req ON t.requester_id = req.id
      WHERE t.status = 'Pending'
      ORDER BY t.created_at DESC
    `,

    // 3. Active fleet trips
    loadActiveTrips(),

    // 4. Live personnel with active plate numbers AND current trip busy status
    sql`
      SELECT 
        u.id, u.name, u.email, u.role, u.phone, u.license_number, u.is_online, u.last_seen,
        v.plate_number, v.model as vehicle_model,
        EXISTS (
          SELECT 1 FROM trips t
          WHERE t.driver_id = u.id AND t.status IN ('Active', 'En Route')
        ) as is_busy,
        (
          SELECT t.id FROM trips t
          WHERE t.driver_id = u.id AND t.status IN ('Active', 'En Route')
          ORDER BY t.created_at DESC LIMIT 1
        ) as active_trip_id
      FROM users u
      LEFT JOIN vehicles v ON v.driver_id = u.id AND v.is_active = TRUE
      ORDER BY u.is_online DESC, u.role ASC, u.name ASC
    `,

    // 5. Selected user profile
    selectedUserId
      ? sql`
          SELECT 
            u.id, u.name, u.email, u.role, u.phone, u.license_number, u.is_online,
            v.plate_number, v.model as vehicle_model
          FROM users u
          LEFT JOIN vehicles v ON v.driver_id = u.id AND v.is_active = TRUE
          WHERE u.id = ${selectedUserId}
          LIMIT 1
        `
      : Promise.resolve([] as any[]),

    // 6. Selected driver trips
    selectedUserId
      ? sql`SELECT * FROM trips WHERE driver_id = ${selectedUserId} ORDER BY created_at DESC`
      : Promise.resolve([] as any[]),

    // 7. Selected driver OR STAFF combined expenses (Using robust ILIKE wildcard matching for staff logging)
    selectedUserId
      ? sql`
          SELECT 
            e.id,
            e.expense_type,
            e.amount,
            e.description,
            e.vehicle_plate,
            e.created_at
          FROM expenses e
          WHERE e.driver_id = ${selectedUserId}
          UNION ALL
          SELECT 
            ve.id + 2000000 as id,
            ve.expense_type,
            ve.amount,
            ve.description,
            v.plate_number as vehicle_plate,
            ve.created_at
          FROM vehicle_expenses ve
          LEFT JOIN vehicles v ON ve.vehicle_id = v.id
          WHERE v.driver_id = ${selectedUserId}
             OR ve.logged_by_name ILIKE (SELECT '%' || name || '%' FROM users WHERE id = ${selectedUserId} LIMIT 1)
          ORDER BY created_at DESC
        `
      : Promise.resolve([] as any[]),

    // 8. Fleet vehicles with assigned driver info
    sql`
      SELECT 
        v.id,
        v.driver_id,
        v.plate_number,
        v.model,
        v.is_active,
        v.created_at,
        u.name as driver_name,
        u.phone as driver_phone
      FROM vehicles v
      LEFT JOIN users u ON v.driver_id = u.id
      ORDER BY v.is_active DESC, v.created_at DESC
    `,

    // 9. All unified vehicle expenses
    sql`
      SELECT 
        ve.id,
        ve.vehicle_id,
        ve.expense_type,
        ve.amount,
        ve.description,
        ve.logged_by_name,
        ve.created_at
      FROM vehicle_expenses ve
      UNION ALL
      SELECT 
        e.id + 1000000 as id,
        v.id as vehicle_id,
        e.expense_type,
        e.amount,
        e.description,
        u.name as logged_by_name,
        e.created_at
      FROM expenses e
      JOIN users u ON e.driver_id = u.id
      JOIN vehicles v ON (
        (e.vehicle_plate IS NOT NULL AND e.vehicle_plate != '' AND UPPER(REPLACE(REPLACE(v.plate_number, ' ', ''), '-', '')) = UPPER(REPLACE(REPLACE(e.vehicle_plate, ' ', ''), '-', '')))
        OR ((e.vehicle_plate IS NULL OR e.vehicle_plate = '') AND v.driver_id = e.driver_id AND v.is_active = TRUE)
      )
      ORDER BY created_at DESC
    `,

    // 10. All Staff Trip Comments & Ratings
    sql`
      SELECT 
        c.id, 
        c.trip_id, 
        c.user_name, 
        c.comment, 
        c.rating, 
        c.created_at, 
        t.destination 
      FROM trip_comments c
      LEFT JOIN trips t ON c.trip_id = t.id
      ORDER BY c.created_at DESC
    `
  ]);

  if (managerResult.length === 0) {
    redirect('/login');
  }

  const manager = managerResult[0];
  const managerId = manager.id;
  const selectedUser = (selectedUserRows as any[])[0] || null;

  const chatPersonnel = (initialPersonnel as any[])
    .filter((p) => p.id !== managerId)
    .map((p) => ({ id: p.id, name: p.name, role: p.role, phone: p.phone }));

  const driversList = (initialPersonnel as any[])
    .filter((p) => p.role === 'driver')
    .map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      plate_number: d.plate_number,
      is_busy: Boolean(d.is_busy),
      active_trip_id: d.active_trip_id || null,
    }));

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
          <Link
            href="/dashboard/profile"
            className="text-xs font-bold text-[#0a7337] hover:underline flex items-center gap-1"
          >
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

      <VehicleFleetManager
        vehicles={vehiclesResult as any[]}
        expenses={vehicleExpensesResult as any[]}
        drivers={driversList}
      />

      <PendingApprovals
        initialTrips={pendingTrips as any}
        drivers={driversList as any}
      />

      {!selectedUserId && (
        <ActiveJourneys trips={activeTrips as any} initialTripId={initialTripId} />
      )}

      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Fleet Personnel</h3>
          <CreatePersonnelModal />
        </div>
        <LivePersonnelTracker initialPersonnel={initialPersonnel as any} />
      </div>
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
              comments={tripCommentsResult as any[]}
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
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader text="Loading dispatch board..." />
        </div>
      }
    >
      <ManagerDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}