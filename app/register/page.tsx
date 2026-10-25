'use client';

import { useState } from 'react';
import Link from 'next/link';
import Logo from '@/app/components/Logo';
import PasswordInput from '@/app/components/PasswordInput';
import { handleRegister } from '@/app/actions/register';

export default function RegisterPage() {
  const [role, setRole] = useState('driver');

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 md:p-10 space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Logo className="w-16 h-16" />
          </div>
          
          <p className="text-sm text-slate-500">Create your account to access the portal.</p>
        </div>

        <form action={handleRegister} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-semibold text-slate-700 uppercase">Full Name</label>
              <input name="name" type="text" required className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none" placeholder="John Doe" />
            </div>

            <div className="space-y-1 col-span-2">
              <label className="text-xs font-semibold text-slate-700 uppercase">Email Address</label>
              <input name="email" type="email" required className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none" placeholder="staff@ajivin.com" />
            </div>

            <div className="space-y-1 col-span-2">
              <label className="text-xs font-semibold text-slate-700 uppercase">Phone</label>
              <input name="phone" type="tel" required className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none" placeholder="+234..." />
            </div>
            
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-semibold text-slate-700 uppercase">Role</label>
              <select 
                name="role" 
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
              >
                <option value="driver">Driver</option>
                <option value="manager">Logistics Manager</option>
              </select>
            </div>

            {/* Conditionally render the License field only if the role is 'driver' */}
            {role === 'driver' && (
              <div className="space-y-1 col-span-2 transition-all">
                <label className="text-xs font-semibold text-slate-700 uppercase">License (Drivers)</label>
                <input name="license" type="text" required className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none" placeholder="DL-12345" />
              </div>
            )}
          </div>

          <div className="space-y-1 pt-2">
            <label className="text-xs font-semibold text-slate-700 uppercase">Password</label>
            <PasswordInput />
          </div>

          <button type="submit" className="w-full mt-4 bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-95 shadow-md">
            Complete Registration
          </button>
        </form>

        <p className="text-center text-sm text-slate-600">
          Already have an account? <Link href="/login" className="font-bold text-[#0a7337] hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}