// app/dashboard/driver/page.tsx
import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import ChatSystem from '@/app/components/ChatSystem';
import ExpenseForm from '@/app/components/ExpenseForm';
import Loader from '@/app/components/Loader';
import MapSwitcher from '@/app/components/MapSwitcher';
import EndTripButton from '@/app/components/EndTripButton';
import Vehicle from '@/app/components/Vehicle';
import { ensureVehiclesTable } from '@/app/actions/vehicle';
import { cancelTripAction, startTripAction } from '@/app/actions/trip';

function statusClasses(status: string) {
  if (status === 'Completed') return 'bg-green-50 text-[#0a7337] border-green-200';
  if (status === 'Declined' || status === 'Cancelled') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'Active' || status === 'En Route') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status === 'Pending') return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-gray-50 text-gray-700 border-gray-200';
}

// Minimal Server-Side Pagination Component
function SimplePagination({ view, currentPage, totalPages }: { view: string, currentPage: number, totalPages: number }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-6 border-t border-gray-100 mt-4">
      <Link
        href={`?view=${view}&page=${currentPage - 1}`}
        className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
          currentPage <= 1 
            ? 'text-gray-300 pointer-events-none' 
            : 'text-gray-600 bg-gray-50 hover:bg-gray-100 active:scale-95'
        }`}
      >
        Previous
      </Link>
      <span className="text-xs font-medium text-gray-400">
        Page {currentPage} of {totalPages}
      </span>
      <Link
        href={`?view=${view}&page=${currentPage + 1}`}
        className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
          currentPage >= totalPages 
            ? 'text-gray-300 pointer-events-none' 
            : 'text-gray-600 bg-gray-50 hover:bg-gray-100 active:scale-95'
        }`}
      >
        Next
      </Link>
    </div>
  );
}

async function submitJourneyRequest(formData: FormData) {
  'use server';

  const driverIdRaw = formData.get('driver_id') as string;
  const driverId = parseInt(driverIdRaw, 10);
  if (!driverId || isNaN(driverId)) return;

  const destination = formData.get('destination') as string;
  const vehicle = formData.get('vehicle') as string;
  const purpose = formData.get('purpose') as string;

  try {
    await sql`
      INSERT INTO trips (driver_id, destination, status, created_at)
      VALUES (${driverId}, ${destination + ' (' + vehicle + ') - ' + purpose}, 'Pending', NOW())
    `;

    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES (
        'New Journey Request',
        ${'Driver requested a journey to ' + destination + ' with ' + vehicle},
        'manager'
      )
    `;

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
  } catch (error) {
    console.error('Failed to submit journey request:', error);
  }
}

async function endTripAction(formData: FormData) {
  'use server';

  const tripId = parseInt(formData.get('trip_id') as string, 10);
  const driverId = parseInt(formData.get('driver_id') as string, 10);
  if (!tripId || !driverId) return;

  try {
    const updated = await sql`
      UPDATE trips
      SET status = 'Completed', ended_at = NOW()
      WHERE id = ${tripId}
        AND driver_id = ${driverId}
        AND status IN ('Active', 'En Route')
      RETURNING id, destination
    `;

    if (updated.length > 0) {
      const driverRows = await sql`SELECT name FROM users WHERE id = ${driverId}`;
      const driverName = driverRows[0]?.name || 'Driver';
      const place = String(updated[0].destination).split(' (')[0];

      await sql`
        INSERT INTO notifications (title, message, target_role)
        VALUES (
          'Trip Completed',
          ${`${driverName} has ended the trip to ${place} (TRP-${tripId}).`},
          'manager'
        )
      `;
    }
  } catch (error) {
    console.error('Failed to end trip:', error);
  }

  revalidatePath('/dashboard/driver');
  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/staff');
}

async function DriverDashboardContent({ activeView, currentPage }: { activeView: string, currentPage: number }) {
  const cookieStore = await cookies();
  const rawUserId = cookieStore.get('userId')?.value || cookieStore.get('ajivin_session_id')?.value;
  const driverId = rawUserId ? parseInt(rawUserId, 10) : null;

  if (!driverId || isNaN(driverId)) {
    redirect('/login');
  }

  await ensureVehiclesTable();

  const [
    userResult,
    tripResult,
    managerResult,
    allManagers,
    vehiclesResult,
    driverHistoryResult,
    driverExpensesResult,
  ] = await Promise.all([
    sql`SELECT id, name, phone, license_number, role FROM users WHERE id = ${driverId}`,
    sql`
      SELECT 
        t.*,
        req.name as requester_name,
        req.phone as requester_phone
      FROM trips t
      LEFT JOIN users req ON t.requester_id = req.id
      WHERE t.driver_id = ${driverId} AND t.status IN ('Active', 'Pending', 'En Route')
      ORDER BY t.created_at DESC
      LIMIT 1
    `,
    sql`SELECT id, name, role, phone FROM users WHERE role = 'manager' ORDER BY id ASC LIMIT 1`,
    sql`SELECT id, name, role, phone FROM users WHERE role = 'manager' ORDER BY name ASC`,
    sql`
      SELECT id, driver_id, plate_number, model, is_active, created_at
      FROM vehicles
      WHERE driver_id = ${driverId}
      ORDER BY is_active DESC, created_at DESC
    `,
    sql`
      SELECT id, destination, status, fasttrack_code, created_at 
      FROM trips 
      WHERE driver_id = ${driverId} 
      ORDER BY created_at DESC 
      LIMIT 100
    `,
    sql`
      SELECT 
        e.id, e.expense_type as category, e.amount, e.description, e.vehicle_plate as plate, u.name as logged_by, e.created_at
      FROM expenses e
      LEFT JOIN users u ON e.driver_id = u.id
      WHERE e.driver_id = ${driverId}
      UNION ALL
      SELECT 
        ve.id + 1000000 as id, ve.expense_type as category, ve.amount, ve.description, v.plate_number as plate, ve.logged_by_name as logged_by, ve.created_at
      FROM vehicle_expenses ve
      JOIN vehicles v ON ve.vehicle_id = v.id
      WHERE v.driver_id = ${driverId}
      ORDER BY created_at DESC
    `,
  ]);

  if (userResult.length === 0) {
    redirect('/login');
  }

  const currentUser = userResult[0];
  const userRole = (currentUser.role || '').toLowerCase();

  if (userRole === 'manager') redirect('/dashboard/manager');
  if (userRole === 'staff') redirect('/dashboard/staff');
  if (userRole !== 'driver') redirect('/login');

  const driver = currentUser;
  const currentTrip = tripResult[0] || null;
  const manager = managerResult[0] || { id: 2, name: 'Dispatch Manager', role: 'Logistics Manager', phone: null };
  const vehicles = vehiclesResult as any[];
  const activeVehicle = vehicles.find((v) => v.is_active) || vehicles[0] || null;
  const driverTrips = driverHistoryResult as any[];
  const driverExpenses = driverExpensesResult as any[];

  const totalSpent = driverExpenses.reduce((sum, exp) => sum + parseFloat(String(exp.amount || 0)), 0);

  const defaultVehicleDisplay = activeVehicle
    ? `${activeVehicle.model} (${activeVehicle.plate_number})`
    : driver.license_number || '';

  // Pagination Logic
  const itemsPerPage = 8;
  const historyPages = Math.ceil(driverTrips.length / itemsPerPage);
  const paginatedTrips = driverTrips.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const expensesPages = Math.ceil(driverExpenses.length / itemsPerPage);
  const paginatedExpenses = driverExpenses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="w-full flex justify-center p-4 sm:p-6 pb-20">
      {/* 
        APPLE-STYLE WRAPPER: 
        max-w-3xl keeps the UI tight and focused. 
        mx-auto centers it nicely.
      */}
      <div className="max-w-3xl w-full space-y-6">
        
        {/* PAGE 1: CURRENT JOURNEY & NEW REQUEST */}
        {activeView === 'journey' && (
          <div className="space-y-6">
            <div className="bg-white rounded-[24px] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
              {currentTrip ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Current Journey</p>
                      <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{currentTrip.destination.split(' (')[0]}</h2>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${statusClasses(currentTrip.status)}`}>
                      {currentTrip.status}
                    </span>
                  </div>

                  <div className="space-y-3 text-sm border-y border-gray-100 py-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Trip ID</span>
                      <span className="font-semibold text-gray-900">TRP-{currentTrip.id}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">FastTrack Code</span>
                      <span className="font-semibold text-[#0a7337]">{currentTrip.fasttrack_code || 'Pending Clearance'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Scheduled Time</span>
                      <span className="font-semibold text-gray-900">
                        {currentTrip.scheduled_time || 'Immediate / On Demand'}
                      </span>
                    </div>
                    {currentTrip.requester_name && (
                      <div className="flex justify-between items-center pt-2">
                        <span className="text-gray-500 font-medium">Passenger / Staff</span>
                        <span className="font-semibold text-gray-900 text-right">
                          {currentTrip.requester_name} <br className="sm:hidden" />
                          <span className="text-gray-500 text-xs sm:ml-1 font-normal">
                            {currentTrip.requester_phone ? `(${currentTrip.requester_phone})` : ''}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  {currentTrip.status === 'Pending' && (
                    <div className="space-y-4 pt-2">
                      <div className="p-4 bg-orange-50 rounded-2xl text-sm text-orange-800 font-medium text-center">
                        Waiting for Logistics Manager to clear this trip request.
                      </div>
                      <form
                        action={async () => {
                          'use server';
                          await cancelTripAction(currentTrip.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-3.5 rounded-2xl text-sm transition-all active:scale-95"
                        >
                          Withdraw Trip Request
                        </button>
                      </form>
                    </div>
                  )}

                  {currentTrip.status === 'Active' && !currentTrip.is_started && (
                    <div className="space-y-4 pt-2">
                      <div className="p-5 bg-green-50 rounded-2xl text-sm text-green-900 space-y-1.5 text-center">
                        <p className="font-semibold text-base">Trip Approved & Cleared!</p>
                        <p className="text-green-700/80">
                          Scheduled for <strong>{currentTrip.scheduled_time || 'Immediate'}</strong>.
                        </p>
                      </div>
                      <form
                        action={async () => {
                          'use server';
                          await startTripAction(currentTrip.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-semibold py-4 rounded-2xl text-sm transition-all shadow-[0_4px_14px_rgba(10,115,55,0.3)] active:scale-95"
                        >
                          Start Trip Now
                        </button>
                      </form>
                    </div>
                  )}

                  {(currentTrip.is_started || currentTrip.status === 'En Route') && (
                    <div className="space-y-6 pt-2">
                      <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                        <MapSwitcher
                          tripId={currentTrip.id}
                          currentLocation={currentTrip.current_location}
                          driverName={driver.name}
                          startedAt={currentTrip.started_at}
                          isManagerView={false}
                        />
                      </div>
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500 text-center font-medium">
                          Tap End Trip when you arrive. Your manager and passenger will be notified.
                        </p>
                        <form action={endTripAction}>
                          <input type="hidden" name="trip_id" value={currentTrip.id} />
                          <input type="hidden" name="driver_id" value={driverId} />
                          <div className="transform transition-all active:scale-95">
                            <EndTripButton />
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="mb-6 text-center">
                    <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Request Journey</h3>
                    <p className="text-sm text-gray-500 mt-1">Submit trip details for manager clearance.</p>
                  </div>
                  <form action={submitJourneyRequest} className="space-y-5">
                    <input type="hidden" name="driver_id" value={driverId} />
                    
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Destination</label>
                      <input
                        name="destination"
                        type="text"
                        required
                        className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-[#0a7337]/20 focus:border-[#0a7337] outline-none text-sm transition-all"
                        placeholder="e.g., Apapa Port Complex"
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Vehicle Name / Plate</label>
                      <input
                        name="vehicle"
                        type="text"
                        required
                        defaultValue={defaultVehicleDisplay}
                        className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-[#0a7337]/20 focus:border-[#0a7337] outline-none text-sm transition-all"
                        placeholder="e.g. Mack Truck (KJA-991)"
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Purpose</label>
                      <textarea
                        name="purpose"
                        rows={3}
                        required
                        className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl border border-gray-100 focus:bg-white focus:ring-2 focus:ring-[#0a7337]/20 focus:border-[#0a7337] outline-none resize-none text-sm transition-all"
                        placeholder="Details about cargo or delivery..."
                      ></textarea>
                    </div>
                    
                    <button
                      type="submit"
                      className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-semibold py-4 rounded-2xl transition-all shadow-[0_4px_14px_rgba(10,115,55,0.2)] active:scale-95 text-sm mt-4"
                    >
                      Submit Journey Request
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Driver Summary Mini Widget */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Driver Summary</h3>
                <Link href="/dashboard/profile" className="text-xs font-semibold text-[#0a7337] hover:underline">
                  Edit Profile
                </Link>
              </div>
              <div className="flex justify-between items-center text-sm">
                <div>
                  <span className="block text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-0.5">License No.</span>
                  <span className="font-semibold text-gray-900">{driver.license_number || 'Not Set'}</span>
                </div>
                <div className="text-right">
                  <span className="block text-gray-400 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Phone</span>
                  <span className="font-semibold text-gray-900">{driver.phone || 'Not Set'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 2: ASSIGNED VEHICLE */}
        {activeView === 'vehicle' && <Vehicle driverId={driverId} vehicles={vehicles} />}

        {/* PAGE 3: SUBMIT NEW EXPENSE */}
        {activeView === 'log-expense' && (
          <ExpenseForm driverId={driverId.toString()} vehicles={vehicles} />
        )}

        {/* PAGE 4: EXPENSES & REPAIRS LOG */}
        {activeView === 'expenses' && (
          <div className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden">
            <div className="p-6 sm:p-8 bg-gray-50/50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Vehicle Expenses</h3>
                <span className="text-xs text-gray-500 font-medium mt-1 block">
                  History of costs associated with your vehicle(s)
                </span>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm text-right w-full sm:w-auto">
                <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Spent</span>
                <span className="text-lg font-bold text-[#0a7337]">
                  ₦{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {driverExpenses.length === 0 ? (
                <div className="py-12 text-center text-sm font-medium text-gray-400">
                  No expenses or repairs have been logged yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedExpenses.map((exp) => (
                    <div key={exp.id} className="p-4 rounded-2xl border border-gray-100 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors hover:border-gray-200 hover:shadow-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-semibold text-gray-900 text-sm">{exp.category}</span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-gray-50 text-gray-500 border border-gray-200 shrink-0">
                            {exp.plate || 'NO PLATE'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed mb-2">{exp.description}</p>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                          <span className="uppercase tracking-wider">By {exp.logged_by || 'System'}</span>
                          <span>•</span>
                          <span>{new Date(exp.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="text-left sm:text-right shrink-0 mt-2 sm:mt-0">
                        <span className="block font-medium text-[#0a7337] text-base">
                          ₦{parseFloat(String(exp.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <SimplePagination view="expenses" currentPage={currentPage} totalPages={expensesPages} />
            </div>
          </div>
        )}

        {/* PAGE 5: MY JOURNEY LOG */}
        {activeView === 'history' && (
          <div className="bg-white rounded-[24px] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">My Journey Log</h3>
              <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                {driverTrips.length} Trips
              </span>
            </div>

            {driverTrips.length === 0 ? (
              <div className="py-12 text-center text-sm font-medium text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                You haven't logged any trips yet.
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedTrips.map((trip) => (
                  <div
                    key={trip.id}
                    className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 flex flex-col gap-3 hover:shadow-sm hover:border-gray-200 transition-all"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-gray-900 block text-base leading-tight mb-2 truncate">
                          {trip.destination}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                          <span>TRP-{trip.id}</span>
                          <span>•</span>
                          <span>{new Date(trip.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full font-semibold text-[10px] border shrink-0 ${statusClasses(trip.status)}`}>
                        {trip.status}
                      </span>
                    </div>
                    {trip.fasttrack_code && (
                      <div className="text-[11px] text-gray-500 font-medium bg-gray-50 p-2.5 rounded-xl inline-block mt-1 border border-gray-100">
                        FastTrack Code: <strong className="text-gray-800 ml-1">{trip.fasttrack_code}</strong>
                      </div>
                    )}
                  </div>
                ))}

                <SimplePagination view="history" currentPage={currentPage} totalPages={historyPages} />
              </div>
            )}
          </div>
        )}

        {/* PAGE 6: DISPATCH CHAT */}
        {activeView === 'chat' && (
          <div className="h-[calc(100vh-140px)] bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden flex flex-col">
            <ChatSystem
              senderId={driverId}
              receiverId={manager.id}
              recipientName={`${manager.name} (${manager.role})`}
              personnelList={allManagers as { id: number; name: string; role: string; phone?: string | null }[]}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default async function DriverDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const resolvedParams = await searchParams;
  const activeView = resolvedParams.view || 'journey';
  const currentPage = parseInt(resolvedParams.page || '1', 10);

  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader text="Loading driver view..." />
        </div>
      }
    >
      <DriverDashboardContent activeView={activeView} currentPage={currentPage} />
    </Suspense>
  );
}