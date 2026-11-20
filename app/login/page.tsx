'use client';

import { useState } from 'react';
import Link from 'next/link';
import { handleLogin } from '@/app/actions/login';
import Logo from '@/app/components/Logo';
import PasswordInput from '@/app/components/PasswordInput';
import GsapReveal from '@/app/components/GsapReveal';
import ThemeToggle from '@/app/components/ThemeToggle';

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
    <div className="min-h-screen bg-slate-50 flex flex-col relative antialiased font-sans">
      {/* Top Notch Navbar — synced with DashboardHamburgerShell */}
      <header className="sticky top-0 z-40 w-full flex justify-center px-3 sm:px-6 pointer-events-none !bg-transparent !border-0 !shadow-none">
        <div className="pointer-events-auto w-full max-w-4xl bg-white border-x border-b border-slate-200 rounded-b-2xl sm:rounded-b-3xl shadow-md px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Left: Brand + Portal Label */}
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <Logo className="w-9 h-9 rounded-lg shrink-0" />
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 min-w-0">
              <span className="h-2 w-2 rounded-full bg-[#0a7337] shrink-0" />
              <span className="text-sm font-bold text-slate-800 truncate">
                AJMS Portal
              </span>
            </div>
          </Link>

          {/* Right: Back to Home + Theme Toggle */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              Back to Home
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <GsapReveal y={16} duration={0.45} className="w-full max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-12 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
            {/* Left Brand Panel (Desktop) */}
            <div className="hidden md:flex md:col-span-5 relative flex-col justify-between bg-gradient-to-br from-[#0a7337] via-[#085a2b] to-[#053b1c] text-white p-10 overflow-hidden">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-24 -right-24 w-72 h-72 rounded-full border-[28px] border-white/5"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-16 -left-16 w-48 h-48 rounded-full border-[20px] border-white/5"
              />

              {/* Top Brand */}
              <div className="relative z-10 flex items-center gap-3">
                <div className="p-1.5 bg-white/10 rounded-xl border border-white/15">
                  <Logo className="w-10 h-10 rounded-lg" />
                </div>
                <div>
                  <p className="text-sm font-black tracking-tight leading-none text-white">AJMS</p>
                  <p className="text-[10px] text-emerald-200 uppercase tracking-widest font-semibold mt-0.5">
                    Fleet Portal
                  </p>
                </div>
              </div>

              {/* Center Headline & Highlights */}
              <div className="relative z-10 space-y-6 my-8">
                <div className="space-y-2">
                  <span className="inline-block text-[10px] font-mono font-bold uppercase tracking-widest bg-white/10 border border-white/15 px-2.5 py-1 rounded-full text-emerald-100">
                    Operations Command
                  </span>
                  <h2 className="text-2xl font-black tracking-tight leading-snug text-white">
                    Safer journeys, smarter fleet dispatch.
                  </h2>
                  <p className="text-xs text-emerald-100/80 leading-relaxed">
                    Sign in to manage active trips, approve staff requests, and monitor live vehicle telemetry.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3 text-xs text-emerald-50">
                    <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <span className="font-medium">Real-time route &amp; driver tracking</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-emerald-50">
                    <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </span>
                    <span className="font-medium">Instant approvals &amp; direct dispatch</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-emerald-50">
                    <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                      </svg>
                    </span>
                    <span className="font-medium">24/7 SOS panic alert monitoring</span>
                  </div>
                </div>
              </div>

              {/* Bottom Brand Footer */}
              <div className="relative z-10 pt-4 border-t border-white/15">
                <p className="text-[10px] font-mono text-emerald-200/80 uppercase tracking-widest">
                  Ajivin Logistics Management
                </p>
              </div>
            </div>

            {/* Right Form Panel */}
            <div className="md:col-span-7 p-8 sm:p-10 md:p-12 flex flex-col justify-center">
              {/* Mobile-only Logo Header */}
              <div className="flex md:hidden justify-center mb-4">
                <div className="p-2 rounded-2xl bg-slate-50 border border-slate-200">
                  <Logo className="w-12 h-12 rounded-xl" />
                </div>
              </div>

              {/* Heading */}
              <div className="text-center md:text-left space-y-1.5 mb-6">
                <span className="inline-block text-[10px] font-mono font-bold uppercase tracking-widest text-[#0a7337] bg-green-50 border border-green-200 px-2.5 py-1 rounded-full mb-1">
                  Staff Access
                </span>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                  Welcome Back
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Enter your credentials to access your dashboard.
                </p>
              </div>

              {/* Error Banner */}
              {error && (
                <GsapReveal y={-6} duration={0.25} className="mb-5">
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
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
                </GsapReveal>
              )}

              {/* Form */}
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Email Address
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337]/25 focus:border-[#0a7337] outline-none transition-colors text-sm bg-slate-50 focus:bg-white text-slate-900"
                    placeholder="staff@ajivin.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Password
                    </label>
                    <Link
                      href="/forget-password"
                      className="text-xs font-semibold text-[#0a7337] hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <PasswordInput />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3.5 px-4 rounded-xl transition-colors active:scale-95 shadow-md text-sm disabled:opacity-60 flex items-center justify-center gap-2 mt-2 cursor-pointer"
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

              {/* Footer */}
              <div className="mt-8 pt-5 border-t border-slate-100 text-center md:text-left">
                <p className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  Authorized Ajivin Personnel Only
                </p>
              </div>
            </div>
          </div>
        </GsapReveal>
      </main>
    </div>
  );
}