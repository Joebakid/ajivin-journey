import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Loader from '@/app/components/Loader';
import ChatSystem from '@/app/components/ChatSystem';
import PersonnelActivityViewer from '@/app/components/PersonnelActivityViewer';
import LivePersonnelTracker from '@/app/components/LivePersonnelTracker';
import PendingApprovals from '@/app/components/PendingApprovals';
import ActiveJourneys from '@/app/components/ActiveJourneys';
import AutoRefresh from '@/app/components/AutoRefresh';
import CreatePersonnelModal from '@/app/components/CreatePersonnelModal';
import VehicleFleetManager from '@/app/components/VehicleFleetManager';
import { ensureVehiclesTable } from '@/app/actions/vehicle';
import { ensureStaffTables } from '@/app/actions/staff';
import { ensureTripsTable } from '@/app/actions/trip';

// Helper function to format the raw datetime-local string into a readable AM/PM format
function formatScheduleTime(timeStr: any) {
  if (!timeStr || typeof timeStr !== 'string') return 'Immediate';
  if (!timeStr.includes('T')) return timeStr; // Returns as-is if already formatted or 'Immediate'
  
  try {
    const [datePart, timePart] = timeStr.split('T');
    const [year, month, day] = datePart.split('-');
    const [hourStr, minute] = timePart.split(':');
    
    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12; // Convert '0' to '12'
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[parseInt(month, 10) - 1];
    
    return `${monthName} ${parseInt(day, 10)}, ${year} at ${hour}:${minute} ${ampm}`;
  } catch (e) {
    return timeStr;
  }
}

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
  searchParams: Promise<{ userId?: string; tripId?: string; view?: string }>;
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

  // Smart View Routing: Default to approvals, but override if a specific deep link (userId/tripId) is present
  let activeView = resolvedParams.view || 'approvals';
  if (!resolvedParams.view) {
    if (selectedUserId) activeView = 'personnel';
    else if (selectedTripId) activeView = 'active';
  }

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
    notificationsResult,
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
    `,

    // 11. Notifications for Manager
    sql`
      SELECT id, title, message, created_at, is_read 
      FROM notifications 
      WHERE target_role = 'manager' 
      ORDER BY created_at DESC 
      LIMIT 30
    `
  ]);

  if (managerResult.length === 0) {
    redirect('/login');
  }

  const manager = managerResult[0];
  const managerId = manager.id;
  const selectedUser = (selectedUserRows as any[])[0] || null;
  const notifications = notificationsResult as any[];

  // Mark notifications as read in the background if the manager is currently viewing them
  if (activeView === 'notifications' && notifications.some(n => !n.is_read)) {
    sql`UPDATE notifications SET is_read = TRUE WHERE target_role = 'manager' AND is_read = FALSE`.catch(console.error);
  }

  // Format the scheduled time for all pending trips to make it human-readable
  const formattedPendingTrips = (pendingTrips as any[]).map((trip) => ({
    ...trip,
    scheduled_time: formatScheduleTime(trip.scheduled_time),
  }));

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

  return (
    <div className="w-full flex justify-center p-4 sm:p-6 pb-20 relative">
      {/* Essential Manager Utilities */}
      <AutoRefresh intervalMs={15000} />

      {/* APPLE-STYLE WRAPPER */}
      <div className="max-w-3xl w-full space-y-6">

        {/* PAGE 1: PENDING CLEARANCES (Approvals) */}
        {activeView === 'approvals' && (
          <div className="space-y-6">
            <div className="mb-2 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Pending Clearances</h3>
              <p className="text-sm text-gray-500 mt-1">Review and approve journey requests from staff.</p>
            </div>
            <PendingApprovals initialTrips={formattedPendingTrips as any} drivers={driversList as any} />
          </div>
        )}

        {/* PAGE 2: ACTIVE JOURNEYS & LIVE MAP */}
        {activeView === 'active' && (
          <div className="space-y-6">
            <div className="mb-2 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Active Journeys & Live Map</h3>
              <p className="text-sm text-gray-500 mt-1">Track ongoing fleet trips in real-time.</p>
            </div>
            <ActiveJourneys trips={activeTrips as any} initialTripId={initialTripId} />
          </div>
        )}

        {/* PAGE 3: VEHICLE FLEET & EXPENSES */}
        {activeView === 'fleet' && (
          <div className="space-y-6">
            <div className="mb-2 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Vehicle Fleet & Expenses</h3>
              <p className="text-sm text-gray-500 mt-1">Manage vehicles, assign drivers, and monitor fleet expenses.</p>
            </div>
            <VehicleFleetManager
              vehicles={vehiclesResult as any[]}
              expenses={vehicleExpensesResult as any[]}
              drivers={driversList}
            />
          </div>
        )}

        {/* PAGE 4: PERSONNEL & ACTIVITY */}
        {activeView === 'personnel' && (
          <div className="space-y-6">
            {!selectedUserId ? (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-2">
                  <div className="text-center sm:text-left">
                    <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Personnel Directory</h3>
                    <p className="text-sm text-gray-500 mt-1">Manage drivers, staff, and view activity history.</p>
                  </div>
                  <CreatePersonnelModal />
                </div>
                <LivePersonnelTracker initialPersonnel={initialPersonnel as any} />
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Link href="/dashboard/manager?view=personnel" className="inline-flex items-center text-sm font-semibold text-gray-500 hover:text-[#0a7337] transition-colors bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm active:scale-95">
                    &larr; Back to Directory
                  </Link>
                </div>
                <PersonnelActivityViewer
                  key={selectedUser.id}
                  user={selectedUser as any}
                  trips={userTrips as any[]}
                  expenses={userExpenses as any[]}
                  comments={tripCommentsResult as any[]}
                />
              </div>
            )}
          </div>
        )}

        {/* PAGE 5: NOTIFICATIONS FEED */}
        {activeView === 'notifications' && (
          <div className="space-y-6">
            <div className="mb-2 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Notifications Feed</h3>
              <p className="text-sm text-gray-500 mt-1">Recent alerts, trip completions, and system updates.</p>
            </div>
            
            <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-sm font-medium text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                  You have no new notifications.
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map(notification => (
                    <div 
                      key={notification.id} 
                      className={`p-4 rounded-2xl border flex flex-col gap-1.5 transition-colors ${
                        notification.is_read 
                          ? 'bg-white border-gray-100' 
                          : 'bg-blue-50/50 border-blue-100 shadow-sm'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-4">
                        <span className="text-sm font-bold text-gray-900">{notification.title}</span>
                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5"></span>
                        )}
                      </div>
                      <span className="text-xs text-gray-600 leading-relaxed">{notification.message}</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
                        {new Date(notification.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PAGE 6: DISPATCH CHAT */}
        {activeView === 'chat' && (
          <div className="h-[calc(100vh-140px)] bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden flex flex-col">
            <ChatSystem
              senderId={managerId}
              receiverId={0}
              recipientName="Fleet Broadcast"
              personnelList={chatPersonnel}
            />
          </div>
        )}

      </div>
    </div>
  );
}

export default async function ManagerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; tripId?: string; view?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader text="Loading dispatch board..." />
        </div>
      }
    >
      <ManagerDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}