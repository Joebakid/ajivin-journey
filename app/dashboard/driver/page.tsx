import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import ChatSystem from '@/app/components/ChatSystem';
import ExpenseForm from '@/app/components/ExpenseForm';
import Loader from '@/app/components/Loader';
import Container from '@/app/components/Container';
import DriverMobileTabs from '@/app/components/DriverMobileTabs';
import OnlineTracker from '@/app/components/OnlineTracker';
import MapSwitcher from '@/app/components/MapSwitcher';
import EndTripButton from '@/app/components/EndTripButton';
import CallManager from '@/app/components/CallManager';
import Nav from '@/app/components/Nav';
import Vehicle from '@/app/components/Vehicle';
import { ensureVehiclesTable } from '@/app/actions/vehicle';
import { cancelTripAction, startTripAction } from '@/app/actions/trip';

function statusClasses(status: string) {
  if (status === 'Completed') return 'bg-green-100 text-[#0a7337]';
  if (status === 'Declined' || status === 'Cancelled') return 'bg-red-100 text-red-700';
  if (status === 'Active' || status === 'En Route') return 'bg-blue-100 text-blue-700';
  if (status === 'Pending') return 'bg-orange-100 text-orange-700';
  return 'bg-slate-100 text-slate-700';
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

async function DriverDashboardContent() {
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
    driverExpensesResult, // Unified query for all expenses related to this driver or their vehicles
  ] = await Promise.all([
    sql`SELECT id, name, phone, license_number, role FROM users WHERE id = ${driverId}`,

    // Query active trip with passenger details and scheduled time
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
    // Retrieve personal log of all trips for this specific driver
    sql`
      SELECT id, destination, status, fasttrack_code, created_at 
      FROM trips 
      WHERE driver_id = ${driverId} 
      ORDER BY created_at DESC 
      LIMIT 50
    `,
    // Retrieve consolidated expenses (Driver's manual logs + Staff/Manager fleet logs for assigned vehicles)
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
    `
  ]);

  if (userResult.length === 0) {
    redirect('/login');
  }

  const currentUser = userResult[0];
  const userRole = (currentUser.role || '').toLowerCase();

  if (userRole === 'manager') {
    redirect('/dashboard/manager');
  }
  if (userRole === 'staff') {
    redirect('/dashboard/staff');
  }
  if (userRole !== 'driver') {
    redirect('/login');
  }

  const driver = currentUser;
  const currentTrip = tripResult[0] || null;
  const manager = managerResult[0] || { id: 2, name: 'Dispatch Manager', role: 'Logistics Manager', phone: null };
  const vehicles = vehiclesResult as any[];
  const activeVehicle = vehicles.find((v) => v.is_active) || vehicles[0] || null;
  const driverTrips = driverHistoryResult as any[];
  const driverExpenses = driverExpensesResult as any[];

  // Calculate Grand Total Expenditure
  const totalSpent = driverExpenses.reduce((sum, exp) => sum + parseFloat(String(exp.amount || 0)), 0);

  const defaultVehicleDisplay = activeVehicle
    ? `${activeVehicle.model} (${activeVehicle.plate_number})`
    : driver.license_number || '';

  const tab1Content = (
    <div className="space-y-6">
      {/* Current Journey / Journey Request */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        {currentTrip ? (
          <div className="space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current Journey</p>
                <h2 className="text-xl font-bold text-slate-900">{currentTrip.destination.split(' (')[0]}</h2>
              </div>
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full ${statusClasses(currentTrip.status)}`}
              >
                {currentTrip.status}
              </span>
            </div>

            {/* Trip Specs & Scheduled Time */}
            <div className="space-y-2 text-sm border-y border-slate-100 py-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Trip ID</span>
                <span className="font-bold text-slate-900">TRP-{currentTrip.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">FastTrack Code</span>
                <span className="font-bold text-[#0a7337]">{currentTrip.fasttrack_code || 'Pending Clearance'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scheduled Time</span>
                <span className="font-bold text-slate-900">
                  ⏱ {currentTrip.scheduled_time || 'Immediate / On Demand'}
                </span>
              </div>
              {currentTrip.requester_name && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Passenger / Staff</span>
                  <span className="font-bold text-slate-900">
                    {currentTrip.requester_name} {currentTrip.requester_phone ? `(${currentTrip.requester_phone})` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* State 1: Pending Manager Approval */}
            {currentTrip.status === 'Pending' && (
              <div className="space-y-3">
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-800">
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
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2.5 rounded-xl text-xs transition-colors"
                  >
                    Withdraw Trip Request
                  </button>
                </form>
              </div>
            )}

            {/* State 2: Approved, Assigned, Ready to Start */}
            {currentTrip.status === 'Active' && !currentTrip.is_started && (
              <div className="space-y-3">
                <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl text-xs text-green-900 space-y-1">
                  <p className="font-bold">Trip Approved & Cleared by Dispatch!</p>
                  <p className="text-slate-600">
                    Scheduled Time: <strong>{currentTrip.scheduled_time || 'Immediate'}</strong>. Click below to start the trip and enable GPS tracking.
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
                    className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-md active:scale-95 uppercase tracking-wider"
                  >
                    Start Trip Now
                  </button>
                </form>
              </div>
            )}

            {/* State 3: Trip in Progress */}
            {(currentTrip.is_started || currentTrip.status === 'En Route') && (
              <div className="space-y-4">
                <MapSwitcher
                  tripId={currentTrip.id}
                  currentLocation={currentTrip.current_location}
                  driverName={driver.name}
                  startedAt={currentTrip.started_at}
                  isManagerView={false}
                />

                <div className="space-y-2">
                  <p className="text-xs text-slate-500 text-center">
                    Tap End Trip when you arrive. Your manager and passenger will be notified.
                  </p>
                  <form action={endTripAction}>
                    <input type="hidden" name="trip_id" value={currentTrip.id} />
                    <input type="hidden" name="driver_id" value={driverId} />
                    <EndTripButton />
                  </form>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-2">
            <div className="mb-5 border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">Request New Journey</h3>
              <p className="text-sm text-slate-500">Submit trip details for manager clearance.</p>
            </div>
            <form action={submitJourneyRequest} className="space-y-4">
              <input type="hidden" name="driver_id" value={driverId} />

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 uppercase">Destination</label>
                <input
                  name="destination"
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 rounded-lg border border-slate-200 focus:ring-2 focus:ring-[#0a7337] outline-none text-sm"
                  placeholder="e.g., Apapa Port Complex"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 uppercase">Vehicle Name / Plate</label>
                <input
                  name="vehicle"
                  type="text"
                  required
                  defaultValue={defaultVehicleDisplay}
                  className="w-full px-4 py-2.5 bg-slate-50 rounded-lg border border-slate-200 focus:ring-2 focus:ring-[#0a7337] outline-none text-sm"
                  placeholder="e.g. Mack Truck (KJA-991)"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 uppercase">Purpose</label>
                <textarea
                  name="purpose"
                  rows={2}
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 rounded-lg border border-slate-200 focus:ring-2 focus:ring-[#0a7337] outline-none resize-none text-sm"
                  placeholder="Details about cargo or delivery..."
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3 px-4 rounded-lg transition-all active:scale-95 shadow-md text-sm mt-2"
              >
                Submit Journey Request
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Driver's Assigned Vehicle Component (Current Plate & History) */}
      <Vehicle driverId={driverId} vehicles={vehicles} />

      {/* Driver Profile */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 relative">
        <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase">Driver Profile</h3>
          <Link
            href="/dashboard/profile"
            className="text-xs font-bold text-[#0a7337] hover:underline flex items-center gap-1"
          >
            Edit
          </Link>
        </div>
        <div className="flex justify-between text-sm">
          <div>
            <span className="block text-slate-500 text-[10px] uppercase tracking-wider mb-1">License No.</span>
            <span className="font-bold text-slate-900">{driver.license_number || 'Not Set'}</span>
          </div>
          <div className="text-right">
            <span className="block text-slate-500 text-[10px] uppercase tracking-wider mb-1">Phone</span>
            <span className="font-bold text-slate-900">{driver.phone || 'Not Set'}</span>
          </div>
        </div>
      </div>

      {/* Driver's Unified Expenses & Repairs Log */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">Vehicle Expenses & Repairs</h3>
            <span className="text-[10px] text-slate-500">History of all costs associated with your vehicle(s)</span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Total Spent</span>
            <span className="text-base font-extrabold text-[#0a7337]">
              ₦{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {driverExpenses.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No expenses or repairs have been logged for your assigned vehicles yet.
          </div>
        ) : (
          <div className="p-4 space-y-3 max-h-[350px] overflow-y-auto">
            {driverExpenses.map((exp) => (
              <div key={exp.id} className="p-3 rounded-xl border border-slate-100 bg-white flex flex-col gap-2">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-900 text-sm truncate">{exp.category}</span>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                        {exp.plate || 'NO PLATE'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">{exp.description}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-2">
                      <span className="uppercase tracking-wider">
                        By {exp.logged_by || 'System'}
                      </span>
                      <span>•</span>
                      <span>{new Date(exp.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block font-mono font-bold text-[#0a7337] text-sm">
                      ₦{parseFloat(String(exp.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Driver's Personal Trip Log */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">My Journey Log</h3>
          <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {driverTrips.length} Trips
          </span>
        </div>
        
        {driverTrips.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            You haven't logged any trips yet.
          </div>
        ) : (
          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {driverTrips.map((trip) => (
              <div
                key={trip.id}
                className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-2 hover:border-slate-300 transition-colors"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-slate-900 block text-sm leading-tight mb-1 truncate">
                      {trip.destination}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
                      <span>TRP-{trip.id}</span>
                      <span>•</span>
                      <span>{new Date(trip.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] shrink-0 ${statusClasses(trip.status)}`}>
                    {trip.status}
                  </span>
                </div>
                {trip.fasttrack_code && (
                  <div className="text-[10px] text-slate-500 font-medium">
                    FastTrack Code: <strong className="text-slate-800 font-mono">{trip.fasttrack_code}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 flex flex-col md:bg-gray-100">
      <OnlineTracker userId={driverId} />
      <CallManager userId={driverId} />

      <Nav userId={driverId} userName={driver.name} userRole="driver" />

      <Container className="flex-1 flex flex-col p-0 md:p-6 md:pt-0 min-h-0">
        <DriverMobileTabs
          tripContent={tab1Content}
          expenseContent={<ExpenseForm driverId={driverId.toString()} vehicles={vehicles} />}
          chatContent={
            <ChatSystem
              senderId={driverId}
              receiverId={manager.id}
              recipientName={`${manager.name} (${manager.role})`}
              personnelList={allManagers as { id: number; name: string; role: string; phone?: string |null }[]}
            />
          }
        />
      </Container>
    </div>
  );
}

export default function DriverDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader text="Loading dashboard..." />
        </div>
      }
    >
      <DriverDashboardContent />
    </Suspense>
  );
}