'use client';

import { useState } from 'react';
import Link from 'next/link';
import { handleLogin } from '@/app/actions/login';
import Logo from '@/app/components/Logo';
import PasswordInput from '@/app/components/PasswordInput';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await handleLogin(formData);
      if (res?.error) {
        setError(res.error);
        setLoading(false);
      }
    } catch (err) {
      // Re-throw Next.js redirect token so navigation proceeds smoothly
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
        throw err;
      }
      setError('Failed to sign in. Please verify your credentials and try again.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 md:p-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Logo className="w-16 h-16 rounded-xl" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
            AJIVIN LOGISTICS MANAGEMENT SYSTEM
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2 animate-in fade-in">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Email Address
            </label>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none transition-all text-sm bg-slate-50 focus:bg-white"
              placeholder="staff@ajivin.com"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Password
              </label>
              <Link href="/forget-password" className="text-xs font-semibold text-[#0a7337] hover:underline">
                Forgot password?
              </Link>
            </div>
            <PasswordInput />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3.5 px-4 rounded-xl transition-all active:scale-95 shadow-md text-sm disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Signing in...</span>
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </main>
  );
}