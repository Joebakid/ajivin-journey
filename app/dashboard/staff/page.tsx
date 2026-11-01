import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Loader from '@/app/components/Loader';
import ChatSystem from '@/app/components/ChatSystem';
import MapSwitcher from '@/app/components/MapSwitcher';
import StaffDashboardClient from '@/app/components/StaffDashboardClient';
import { ensureStaffTables } from '@/app/actions/staff';

async function StaffDashboardContent({ activeView }: { activeView: string }) {
  const cookieStore = await cookies();
  const rawUserId = cookieStore.get('userId')?.value || cookieStore.get('ajivin_session_id')?.value;
  const staffId = rawUserId ? parseInt(rawUserId, 10) : null;

  if (!staffId || isNaN(staffId)) {
    redirect('/login');
  }

  await ensureStaffTables();

  // 1. Fetch user to verify role and prevent infinite redirect loops
  const userCheck = await sql`
    SELECT id, name, email, role, phone 
    FROM users 
    WHERE id = ${staffId} 
    LIMIT 1
  `;

  if (userCheck.length === 0) {
    redirect('/login');
  }

  const currentUser = userCheck[0];
  const userRole = (currentUser.role || '').toLowerCase();

  // Smart role guards
  if (userRole === 'manager') redirect('/dashboard/manager');
  if (userRole === 'driver') redirect('/dashboard/driver');
  if (userRole !== 'staff') redirect('/login');

  const staff = currentUser;

  // 2. Load staff data in parallel
  const [tripsResult, commentsResult, vehiclesResult, personnelResult, currentTripResult] = await Promise.all([
    // Trips requested by this staff member
    sql`
      SELECT id, destination, status, fasttrack_code, created_at 
      FROM trips 
      WHERE requester_id = ${staffId}
      ORDER BY created_at DESC
    `,
    // All journey feedback comments
    sql`
      SELECT id, trip_id, user_name, comment, rating, created_at 
      FROM trip_comments 
      ORDER BY created_at DESC
    `,
    // Fleet vehicles available for expense reporting
    sql`
      SELECT id, plate_number, model 
      FROM vehicles 
      ORDER BY plate_number ASC
    `,
    // Directory of personnel for universal chat and driver lookup
    sql`
      SELECT 
        u.id, u.name, u.role, u.phone, 
        v.plate_number 
      FROM users u
      LEFT JOIN vehicles v ON v.driver_id = u.id AND v.is_active = TRUE
      ORDER BY u.is_online DESC, u.role ASC, u.name ASC
    `,
    // Latest active or pending trip for the map view
    sql`
      SELECT t.*, d.name as driver_name, d.phone as driver_phone
      FROM trips t
      LEFT JOIN users d ON t.driver_id = d.id
      WHERE t.requester_id = ${staffId} AND t.status IN ('Active', 'Pending', 'En Route')
      ORDER BY t.created_at DESC
      LIMIT 1
    `,
  ]);

  const currentTrip = currentTripResult[0] || null;

  const chatPersonnel = (personnelResult as any[])
    .filter((p) => p.id !== staffId)
    .map((p) => ({
      id: p.id,
      name: `${p.name} (${p.role.toUpperCase()})`,
      role: p.role,
      phone: p.phone,
    }));

  const driversList = (personnelResult as any[])
    .filter((p) => p.role === 'driver')
    .map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      plate_number: d.plate_number,
    }));

  return (
    <div className="w-full flex justify-center p-4 sm:p-6 pb-20">
      {/* 
        APPLE-STYLE WRAPPER: 
        max-w-3xl keeps the UI tight and focused. 
        mx-auto centers it nicely.
      */}
      <div className="max-w-3xl w-full space-y-6">
        
        {/* PAGE 1: REQUEST / BOOK A TRIP */}
        {activeView === 'request' && (
          <div className="space-y-6">
            <div className="mb-2 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Request a Trip</h3>
              <p className="text-sm text-gray-500 mt-1">Submit a new journey request to the dispatch manager.</p>
            </div>

            <StaffDashboardClient
              staffId={staffId}
              staffName={staff.name}
              trips={tripsResult as any[]}
              comments={commentsResult as any[]}
              vehicles={vehiclesResult as any[]}
              drivers={driversList}
            />
          </div>
        )}

        {/* PAGE 2: MY TRIPS & TRACKING (Map Only) */}
        {activeView === 'trips' && (
          <div className="space-y-6">
            <div className="mb-2 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Your Trips & Tracking</h3>
              <p className="text-sm text-gray-500 mt-1">Track your active journeys in real-time.</p>
            </div>

            {/* LIVE TRACKING WIDGET */}
            {currentTrip && (currentTrip.is_started || currentTrip.status === 'En Route') ? (
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-gray-100 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Live Tracking</h3>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                    {currentTrip.status}
                  </span>
                </div>
                <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm relative">
                  <MapSwitcher
                    tripId={currentTrip.id}
                    currentLocation={currentTrip.current_location}
                    driverName={currentTrip.driver_name || 'Driver'}
                    startedAt={currentTrip.started_at}
                    isManagerView={true} // Setting to true forces read-only tracking mode
                  />
                </div>
                <div className="flex justify-between text-sm items-center bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                  <div className="min-w-0 pr-4">
                    <span className="block text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Destination</span>
                    <span className="font-semibold text-gray-900 truncate block">{currentTrip.destination.split(' (')[0]}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Driver</span>
                    <span className="font-semibold text-gray-900">{currentTrip.driver_name || 'Assigned Driver'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-12 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-gray-100 text-center">
                <p className="text-gray-500 font-medium">You have no active journeys currently in progress.</p>
              </div>
            )}
          </div>
        )}

        {/* PAGE 3: VEHICLE FLEET & EXPENSES (Fleet Directory) */}
        {activeView === 'fleet' && (
          <div className="bg-white rounded-[24px] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
            <div className="mb-6 text-center sm:text-left">
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Fleet Drivers Directory</h3>
              <p className="text-sm text-gray-500 mt-1">Contact details and assigned vehicles for fleet drivers.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {driversList.map((driver) => (
                <div 
                  key={driver.id} 
                  className="p-5 rounded-2xl border border-gray-100 bg-gray-50 flex flex-col gap-2 transition-colors hover:border-gray-200 hover:shadow-sm"
                >
                  <span className="font-semibold text-gray-900 text-base block truncate">{driver.name}</span>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>📞 {driver.phone || 'No phone set'}</span>
                  </div>
                  <div className="mt-2">
                    <span className="font-mono text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 inline-block shadow-sm">
                      {driver.plate_number || 'NO CAR ASSIGNED'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAGE 4: DISPATCH CHAT */}
        {activeView === 'chat' && (
          <div className="h-[calc(100vh-140px)] bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden flex flex-col">
            <ChatSystem
              senderId={staffId}
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

export default async function StaffDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const resolvedParams = await searchParams;
  const activeView = resolvedParams.view || 'request';

  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader text="Loading staff console..." />
        </div>
      }
    >
      <StaffDashboardContent activeView={activeView} />
    </Suspense>
  );
}