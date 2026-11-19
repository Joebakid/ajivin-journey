// app/dashboard/manager/page.tsx
import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
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
import SosAlertCard from '@/app/components/SosAlertCard';
import BackButton from '@/app/components/BackButton';
import { ensureVehiclesTable } from '@/app/actions/vehicle';
import { ensureStaffTables } from '@/app/actions/staff';
import { ensureTripsTable } from '@/app/actions/trip';
import { ensurePanicTable } from '@/app/actions/panic';

// Helper function to format the raw datetime-local string into a readable AM/PM format
function formatScheduleTime(timeStr: any) {
  if (!timeStr || typeof timeStr !== 'string') return 'Immediate';
  if (!timeStr.includes('T')) return timeStr;

  try {
    const [datePart, timePart] = timeStr.split('T');
    const [year, month, day] = datePart.split('-');
    const [hourStr, minute] = timePart.split(':');

    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;

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

// Inline Server Action to allow managers to instantly create an Active trip
async function dispatchDriverAction(formData: FormData) {
  'use server';

  const driverId = parseInt(formData.get('driver_id') as string, 10);
  const destination = formData.get('destination') as string;
  const purpose = formData.get('purpose') as string;
  const scheduledTime = formData.get('scheduled_time') as string;
  const managerId = parseInt(formData.get('manager_id') as string, 10);

  if (!driverId || isNaN(driverId) || !destination) return;

  const ftCode = 'FT-' + Math.floor(100000 + Math.random() * 900000);
  const fullDest = purpose ? `${destination} - ${purpose}` : destination;
  const timeVal = scheduledTime ? scheduledTime : null;

  try {
    await sql`
      INSERT INTO trips (driver_id, requester_id, destination, status, fasttrack_code, scheduled_time, created_at)
      VALUES (${driverId}, ${managerId}, ${fullDest}, 'Active', ${ftCode}, ${timeVal}, NOW())
    `;
  } catch (error) {
    console.error('Failed to dispatch driver:', error);
  }

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/driver');
  redirect('/dashboard/manager?view=active');
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
  await ensurePanicTable();

  const resolvedParams = await searchParams;
  const selectedUserId = resolvedParams.userId ? parseInt(resolvedParams.userId, 10) : null;
  const selectedTripId = resolvedParams.tripId ? parseInt(resolvedParams.tripId, 10) : null;

  // Smart View Routing: Default to approvals, but override if a specific deep link is present
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
    sosLogsResult,
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

    // 7. Selected driver OR STAFF combined expenses
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
          LEFT JOIN vehicles v ON v.driver_id = u.id AND v.is_active = TRUE)
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

    // 11. General Notifications for Manager
    sql`
      SELECT id, title, message, created_at, is_read
      FROM notifications
      WHERE target_role = 'manager'
      ORDER BY created_at DESC
      LIMIT 30
    `,

    // 12. SOS alerts with driver, trip, vehicle and live location details
    sql`
      SELECT
        a.*,
        u.name AS driver_name,
        u.phone AS driver_phone,
        t.current_location AS live_location,
        t.status AS trip_status,
        t.is_started AS trip_is_started
      FROM panic_alerts a
      LEFT JOIN users u ON u.id = a.driver_id
      LEFT JOIN trips t ON t.id = a.trip_id
      ORDER BY a.is_resolved ASC, a.created_at DESC
      LIMIT 100
    `,
  ]);

  if (managerResult.length === 0) {
    redirect('/login');
  }

  const manager = managerResult[0];
  const managerId = manager.id;
  const selectedUser = (selectedUserRows as any[])[0] || null;
  const notifications = notificationsResult as any[];

  // SOS alerts and the ones still unresolved
  const sosLogs = sosLogsResult as any[];
  const activeEmergencies = sosLogs.filter((sos) => !sos.is_resolved);

  // Mark standard notifications as read in the background if the manager is currently viewing them
  if (activeView === 'notifications' && notifications.some((n) => !n.is_read && !n.title.includes('PANIC'))) {
    sql`UPDATE notifications SET is_read = TRUE WHERE target_role = 'manager' AND is_read = FALSE AND title NOT ILIKE '%PANIC%'`.catch(console.error);
  }

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

  const firstEmergency = activeEmergencies[0];

  return (
    <div className="w-full flex justify-center p-4 sm:p-6 pb-20 relative">
      {/* Essential Manager Utilities: refresh faster while an SOS is active */}
      <AutoRefresh intervalMs={activeEmergencies.length > 0 ? 5000 : 15000} />

      {/* APPLE-STYLE WRAPPER */}
      <div className="max-w-3xl w-full space-y-6">

        {/* GLOBAL EMERGENCY BANNER - visible on every view except the SOS page itself */}
        {firstEmergency && activeView !== 'sos' && (
          <div className="bg-red-600 text-white rounded-[24px] p-5 sm:p-6 shadow-[0_8px_30px_rgba(220,38,38,0.4)] animate-pulse border-4 border-red-700 flex flex-col sm:flex-row justify-between sm:items-center gap-4 relative overflow-hidden">
            <div className="relative z-10 min-w-0">
              <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
                🚨 Emergency SOS ({activeEmergencies.length} active)
              </h2>
              <p className="text-sm font-semibold mt-1.5 text-red-100 max-w-lg leading-relaxed">
                {firstEmergency.driver_name || `Driver #${firstEmergency.driver_id}`}
                {firstEmergency.plate_number ? `, ${firstEmergency.plate_number}` : ''}
                {firstEmergency.destination ? `, going to ${firstEmergency.destination}` : ''}
              </p>
            </div>
            <div className="relative z-10 w-full sm:w-auto flex flex-col gap-2 shrink-0">
              <Link
                href="/dashboard/manager?view=sos"
                className="w-full text-center bg-white text-red-700 font-black px-6 py-3 rounded-xl hover:bg-red-50 active:scale-95 transition-all shadow-lg text-sm tracking-wide"
              >
                View location & trip details
              </Link>
              {activeView !== 'chat' && (
                <Link
                  href="/dashboard/manager?view=chat"
                  className="w-full text-center bg-red-700/50 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl transition-all text-xs"
                >
                  Go to Chat
                </Link>
              )}
            </div>
          </div>
        )}

        {/* DEDICATED SOS VIEW */}
        {activeView === 'sos' && (
          <div className="space-y-6">
            <div className="mb-2 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-red-700 tracking-tight">🚨 Emergency SOS</h3>
              <p className="text-sm text-gray-500 mt-1">
                Live location and trip details for every panic alert triggered by fleet drivers.
              </p>
            </div>

            {sosLogs.length === 0 ? (
              <div className="py-12 text-center text-sm font-medium text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                No emergency alerts have been logged.
              </div>
            ) : (
              <div className="space-y-5">
                {sosLogs.map((alert: any) => (
                  <SosAlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* PAGE 1: PENDING CLEARANCES (Approvals) */}
        {activeView === 'approvals' && (
          <div className="space-y-6">
            <div className="mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Pending Clearances</h3>
                <p className="text-sm text-gray-500 mt-1">Review and approve journey requests from staff.</p>
              </div>
              <Link
                href="/dashboard/manager?view=dispatch"
                className="shrink-0 bg-[#0a7337] hover:bg-[#085a2b] text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 text-center"
              >
                + Dispatch Driver
              </Link>
            </div>
            <PendingApprovals initialTrips={formattedPendingTrips as any} drivers={driversList as any}/>
          </div>
        )}

        {/* PAGE 1.5: DIRECT DISPATCH */}
        {activeView === 'dispatch' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm active:scale-95">
                <BackButton />
              </div>
            </div>
            <div className="mb-2 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Direct Dispatch</h3>
              <p className="text-sm text-gray-500 mt-1">Instantly book and dispatch a driver to a destination (bypasses approval).</p>
            </div>

            <div className="bg-white rounded-[24px] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
              <form action={dispatchDriverAction} className="space-y-5">
                <input type="hidden" name="manager_id" value={managerId} />

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">
                    Select Driver
                  </label>
                  <select
                    name="driver_id"
                    required
                    className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-[#0a7337]/20 focus:border-[#0a7337] outline-none text-sm transition-all cursor-pointer"
                  >
                    <option value="">-- Choose an available driver --</option>
                    {driversList.map((d: any) => (
                      <option key={d.id} value={d.id} disabled={d.is_busy}>
                        {d.name} {d.plate_number ? `(${d.plate_number})` : '(No vehicle)'} {d.is_busy ? ' - BUSY' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">
                    Destination
                  </label>
                  <input
                    name="destination"
                    type="text"
                    required
                    className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-[#0a7337]/20 focus:border-[#0a7337] outline-none text-sm transition-all"
                    placeholder="e.g., Murtala Muhammed Airport"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">
                    Purpose (Optional)
                  </label>
                  <input
                    name="purpose"
                    type="text"
                    className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-[#0a7337]/20 focus:border-[#0a7337] outline-none text-sm transition-all"
                    placeholder="e.g., Client pickup, Cargo delivery..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">
                    Scheduled Time (Optional)
                  </label>
                  <input
                    name="scheduled_time"
                    type="datetime-local"
                    className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-[#0a7337]/20 focus:border-[#0a7337] outline-none text-sm transition-all"
                  />
                  <p className="text-[10px] text-gray-400 ml-1 mt-1">Leave empty to dispatch immediately.</p>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-semibold py-4 rounded-2xl transition-all shadow-[0_4px_14px_rgba(10,115,55,0.2)] active:scale-95 text-sm mt-4"
                >
                  Dispatch Driver Now
                </button>
              </form>
            </div>
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
                  <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm active:scale-95">
                    <BackButton />
                  </div>
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
                  {notifications.map((notification) => (
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