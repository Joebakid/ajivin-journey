import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Container from '@/app/components/Container';
import Loader from '@/app/components/Loader';
import ChatSystem from '@/app/components/ChatSystem';
import OnlineTracker from '@/app/components/OnlineTracker';
import DashboardLayout from '@/app/components/DashboardLayout';
import CallManager from '@/app/components/CallManager';
import UnreadBadge from '@/app/components/UnreadBadge';
import Nav from '@/app/components/Nav';
import StaffDashboardClient from '@/app/components/StaffDashboardClient';
import { ensureStaffTables } from '@/app/actions/staff';

async function StaffDashboardContent() {
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
  if (userRole === 'manager') {
    redirect('/dashboard/manager');
  }
  if (userRole === 'driver') {
    redirect('/dashboard/driver');
  }
  if (userRole !== 'staff') {
    redirect('/login');
  }

  const staff = currentUser;

  // 2. Load staff data in parallel
  const [tripsResult, commentsResult, vehiclesResult, personnelResult] = await Promise.all([
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
  ]);

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

  const tab1Content = (
    <div className="space-y-6">
      {/* Staff Profile Overview Card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Staff Portal</span>
            <h2 className="text-lg font-bold text-slate-900">{staff.name}</h2>
            <p className="text-xs text-slate-500">{staff.email}</p>
          </div>
          <span className="self-start sm:self-auto text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-100 text-[#0a7337] uppercase">
            Official Staff Member
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-bold">Contact Phone</span>
            <span className="font-bold text-slate-800">{staff.phone || 'Not set'}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Trips Booked</span>
            <span className="font-bold text-[#0a7337]">{tripsResult.length}</span>
          </div>
        </div>
      </div>

      {/* Staff Operations: Trip Booking, Comments, Driver Reports & Vehicle Expenses */}
      <StaffDashboardClient
        staffId={staffId}
        staffName={staff.name}
        trips={tripsResult as any[]}
        comments={commentsResult as any[]}
        vehicles={vehiclesResult as any[]}
        drivers={driversList}
      />
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-60px)] bg-slate-50 flex flex-col md:bg-gray-100">
      <OnlineTracker userId={staffId} />
      <CallManager userId={staffId} />

      <Nav userId={staffId} userName={staff.name} userRole="staff" />

      <Container className="flex-1 flex flex-col p-0 md:p-6 md:pt-0 min-h-0">
        <DashboardLayout
          initialTab="tab1"
          tab1Label="Staff Portal"
          tab1Content={tab1Content}
          tab2Label="Fleet Drivers"
          tab2Content={
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase">Fleet Driver Directory</h3>
              <p className="text-xs text-slate-500">Contact details and assigned vehicles for fleet drivers.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {driversList.map((driver) => (
                  <div key={driver.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1">
                    <span className="font-bold text-slate-900 block">{driver.name}</span>
                    <span className="text-slate-500 block">📞 {driver.phone || 'No phone set'}</span>
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-300 inline-block">
                      {driver.plate_number || 'NO CAR ASSIGNED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          }
          tab3Label="Fleet Chat"
          tab3Badge={<UnreadBadge userId={staffId} />}
          tab3Content={
            <ChatSystem
              senderId={staffId}
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

export default function StaffDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader text="Loading staff console..." />
        </div>
      }
    >
      <StaffDashboardContent />
    </Suspense>
  );
}