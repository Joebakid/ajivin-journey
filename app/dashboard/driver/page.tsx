import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
import { cancelTripAction, startTripAction } from '@/app/actions/trip';

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
      INSERT INTO trips (driver_id, destination, status)
      VALUES (${driverId}, ${destination + ' (' + vehicle + ') - ' + purpose}, 'Pending')
    `;

    // Alert logistics manager
    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES (
        'New Journey Request',
        ${'Driver requested a journey to ' + destination},
        'manager'
      )
    `;

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
  } catch (error) {
    console.error('Failed to submit journey request:', error);
  }
}

// Driver ends an in-progress trip: marks it Completed and notifies the manager.
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
}

async function DriverDashboardContent({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const resolvedParams = await searchParams;
  const parsedId = resolvedParams.userId ? parseInt(resolvedParams.userId, 10) : null;

  // Strict Privacy Check: Do NOT default to driver 1. If no valid session ID, redirect to login
  if (!parsedId || isNaN(parsedId)) {
    redirect('/login');
  }

  const driverId = parsedId;

  // Fetch Driver Profile (Reverted to only fetch existing columns)
  const userResult = await sql`SELECT id, name, phone, license_number FROM users WHERE id = ${driverId}`;
  if (userResult.length === 0) {
    redirect('/login');
  }

  const driver = userResult[0];

  // Fetch Active/Pending Trip for THIS specific driver only
  const tripResult = await sql`
    SELECT * FROM trips
    WHERE driver_id = ${driverId} AND status IN ('Active', 'Pending', 'En Route')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const currentTrip = tripResult[0] || null;

  // Fetch Manager Details for Direct Chat & VoIP Calls
  const managerResult = await sql`SELECT id, name, role, phone FROM users WHERE role = 'manager' ORDER BY id ASC LIMIT 1`;
  const manager = managerResult[0] || { id: 2, name: 'Dispatch Manager', role: 'Logistics Manager', phone: null };

  // Fetch All Managers for Search Selection & Calling
  const allManagers = await sql`SELECT id, name, role, phone FROM users WHERE role = 'manager' ORDER BY name ASC`;

  const tab1Content = (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        {currentTrip ? (
          <div className="space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current Journey</p>
                <h2 className="text-xl font-bold text-slate-900">{currentTrip.destination.split(' (')[0]}</h2>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                currentTrip.status === 'Pending' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-[#0a7337]'
              }`}>
                {currentTrip.status}
              </span>
            </div>

            <div className="space-y-2 text-sm border-y border-slate-100 py-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Trip ID</span>
                <span className="font-bold text-slate-900">TRP-{currentTrip.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">FastTrack Code</span>
                <span className="font-bold text-[#0a7337]">{currentTrip.fasttrack_code || 'Pending Clearance'}</span>
              </div>
            </div>

            {/* State 1: Pending Manager Approval */}
            {currentTrip.status === 'Pending' && (
              <div className="space-y-3">
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-800">
                  Waiting for Logistics Manager to approve this journey request.
                </div>
                <form action={async () => {
                  'use server';
                  await cancelTripAction(currentTrip.id);
                }}>
                  <button type="submit" className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2.5 rounded-xl text-xs transition-colors">
                    Withdraw Trip Request
                  </button>
                </form>
              </div>
            )}

            {/* State 2: Approved, ready to Start Trip */}
            {currentTrip.status === 'Active' && !currentTrip.is_started && (
              <div className="space-y-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800">
                  Trip approved! Click below to start the trip and enable GPS tracking.
                </div>
                <form action={async () => {
                  'use server';
                  await startTripAction(currentTrip.id);
                }}>
                  <button type="submit" className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-md active:scale-95">
                    Start Trip Now
                  </button>
                </form>
              </div>
            )}

            {/* State 3: Trip in progress -> Map Switcher (Primary / Backup), transit details, End Trip */}
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
                    Tap End Trip when you arrive. Your manager will be notified.
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
                  defaultValue={driver.license_number || ''}
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

      {/* Driver Profile */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 relative">
        <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
          <h3 className="text-xs font-bold text-slate-800 uppercase">Driver Profile</h3>
          <Link href={`/dashboard/profile?id=${driverId}`} className="text-xs font-bold text-[#0a7337] hover:underline flex items-center gap-1">
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
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 flex flex-col md:bg-gray-100">
      <OnlineTracker userId={driverId} />
      {/* Real-time WebRTC Call Manager listener */}
      <CallManager userId={driverId} />

      <Nav userId={driverId} userName={driver.name} userRole="driver" />

      <Container className="flex-1 flex flex-col p-0 md:p-6 md:pt-0 min-h-0">
        <DriverMobileTabs
          tripContent={tab1Content}
          expenseContent={<ExpenseForm driverId={driverId.toString()} />}
          chatContent={
            <ChatSystem
              senderId={driverId}
              receiverId={manager.id}
              recipientName={`${manager.name} (${manager.role})`}
              personnelList={allManagers as { id: number; name: string; role: string; phone?: string | null }[]}
            />
          }
        />
      </Container>
    </div>
  );
}

export default function DriverDashboardPage({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader text="Loading dashboard..." /></div>}>
      <DriverDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}
