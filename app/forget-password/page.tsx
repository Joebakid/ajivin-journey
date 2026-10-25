'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgetPasswordPage() {
  const [resetLink, setResetLink] = useState<string | null>(null);

  const generateHash = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate generating a secure token/hash and storing it in the database
    const mockHash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    // In production, you would email this link. For now, we display it on screen.
    setResetLink(`/reset-password/${mockHash}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 md:p-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Reset Password</h1>
          <p className="text-sm text-slate-500">Enter your email to receive a reset hash</p>
        </div>

        {!resetLink ? (
          <form onSubmit={generateHash} className="space-y-5">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Email Address</label>
              <input
                name="email"
                type="email"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none transition-all"
                placeholder="manager@ajivin.com"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-95 shadow-md"
            >
              Generate Reset Hash
            </button>
          </form>
        ) : (
          <div className="bg-green-50 text-green-800 p-4 rounded-xl border border-green-200 text-center space-y-4">
            <p className="text-sm font-medium">Hash generated successfully! In a real app, this would be emailed.</p>
            <Link
              href={resetLink}
              className="inline-block w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-95"
            >
              Click here to test Reset form
            </Link>
          </div>
        )}

        <div className="text-center">
          <Link href="/login" className="text-sm font-medium text-slate-500 hover:text-slate-800">
            &larr; Back to Login
          </Link>
        </div>
      </div>
    </main>
  );
}
