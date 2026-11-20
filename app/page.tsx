import Link from 'next/link';
import Logo from './components/Logo';
import GsapReveal from './components/GsapReveal';

const FEATURES = [
  {
    title: 'Live Fleet Tracking',
    description: 'Monitor active journeys, routes, and driver status in real time.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    title: 'Instant Dispatch',
    description: 'Approve staff requests or assign available drivers in seconds.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    title: 'SOS Safety Response',
    description: 'Immediate panic alerts with live coordinates and direct dispatch chat.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
];

export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50/40 via-slate-50 to-slate-100 text-slate-900 antialiased font-sans px-6 py-12">
      {/* Single lightweight GSAP wrapper for the whole page */}
      <GsapReveal y={16} duration={0.45} stagger={0.08} className="w-full max-w-4xl space-y-6">
        {/* Main Hero Card */}
        <div className="relative overflow-hidden bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-10 md:p-14 text-center">
          <div className="absolute top-0 inset-x-0 h-1 bg-[#0a7337]" />

          <div className="flex flex-col items-center space-y-5">
            {/* Status Pill */}
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200/70 px-3.5 py-1 text-[11px] font-bold uppercase tracking-widest text-[#0a7337]">
              <span className="h-2 w-2 rounded-full bg-[#0a7337]" />
              Fleet Operations Network
            </div>

            {/* Brand Logo & Title */}
            <div className="space-y-3">
              <div className="flex justify-center">
                <div className="p-2 rounded-2xl bg-slate-50 border border-slate-200/70">
                  <Logo className="w-12 h-12 rounded-xl" />
                </div>
              </div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-slate-900">
                <span className="text-[#0a7337]">AJMS</span> Portal
              </h1>
              <p className="text-slate-500 text-base md:text-lg max-w-lg mx-auto leading-relaxed font-medium">
                Ajivin Journey Management System. Faster dispatch, live tracking, and safer fleet operations.
              </p>
            </div>

            {/* CTA */}
            <div className="pt-2">
              <Link
                href="/login"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#0a7337] px-8 py-3.5 text-sm font-bold text-white hover:bg-[#085a2b] transition-colors shadow-md active:scale-95"
              >
                <span>Login to Portal</span>
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
                  className="transition-transform duration-150 group-hover:translate-x-1"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:border-[#0a7337]/40 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-[#0a7337] flex items-center justify-center mb-3">
                {feature.icon}
              </div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                {feature.title}
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-2 text-[11px] font-mono text-slate-400 uppercase tracking-[0.2em]">
          <span>Secure Access Only</span>
          <span>Ajivin Logistics Management</span>
        </div>
      </GsapReveal>
    </main>
  );
}
