// app/dashboard/profile/page.tsx
import { Suspense } from 'react';
import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import BackButton from '@/app/components/BackButton';
import Loader from '@/app/components/Loader';

async function updateProfile(formData: FormData) {
  'use server';

  const userId = formData.get('userId') as string;
  const name = formData.get('name') as string;
  const phone = formData.get('phone') as string;
  const license = formData.get('license') as string;

  if (!userId) return;

  try {
    const finalLicense = license ? license : null;

    await sql`
      UPDATE users
      SET name = ${name}, phone = ${phone}, license_number = ${finalLicense}
      WHERE id = ${parseInt(userId, 10)}
    `;

    revalidatePath('/dashboard', 'layout');
    revalidatePath('/dashboard/profile');
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/staff');
  } catch (error) {
    console.error('Failed to update profile:', error);
  }
}

async function ProfileContent({ targetId }: { targetId?: string }) {
  const cookieStore = await cookies();
  const rawSessionId =
    cookieStore.get('userId')?.value || cookieStore.get('ajivin_session_id')?.value;
  const sessionUserId = rawSessionId ? parseInt(rawSessionId, 10) : null;

  const userId = targetId ? parseInt(targetId, 10) : sessionUserId;

  if (!userId || isNaN(userId)) {
    redirect('/login');
  }

  const userResult = await sql`
    SELECT id, name, email, phone, license_number, role 
    FROM users 
    WHERE id = ${userId}
  `;
  const user = userResult[0];

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="w-full max-w-lg mx-auto py-4">
      <div className="mb-6">
        <BackButton />
      </div>

      <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 bg-slate-100 text-[#0a7337] rounded-full flex items-center justify-center text-2xl font-black uppercase shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">{user.name}</h1>
            <p className="text-sm text-slate-500 capitalize">{user.role} Account</p>
          </div>
        </div>

        <form action={updateProfile} className="space-y-5">
          <input type="hidden" name="userId" value={user.id} />

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 uppercase">Full Name</label>
            <input
              name="name"
              type="text"
              defaultValue={user.name}
              required
              className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0a7337] focus:bg-white outline-none transition-all text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 uppercase">Email Address</label>
            <input
              name="email"
              type="email"
              defaultValue={user.email}
              disabled
              className="w-full px-4 py-3 bg-slate-100 rounded-xl border border-slate-200 text-slate-500 outline-none cursor-not-allowed text-sm"
              title="Email cannot be changed directly"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 uppercase">Phone Number</label>
              <input
                name="phone"
                type="tel"
                defaultValue={user.phone || ''}
                className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0a7337] focus:bg-white outline-none transition-all text-sm"
                placeholder="+234..."
              />
            </div>

            {user.role === 'driver' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 uppercase">License Number</label>
                <input
                  name="license"
                  type="text"
                  defaultValue={user.license_number || ''}
                  className="w-full px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0a7337] focus:bg-white outline-none transition-all text-sm"
                  placeholder="DL-123456"
                />
              </div>
            )}
          </div>

          <div className="pt-4 mt-2 border-t border-slate-100">
            <button
              type="submit"
              className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3.5 px-4 rounded-xl transition-all active:scale-95 shadow-md flex justify-center items-center gap-2 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const resolvedParams = await searchParams;

  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader text="Loading profile..." />
        </div>
      }
    >
      <ProfileContent targetId={resolvedParams.id} />
    </Suspense>
  );
}