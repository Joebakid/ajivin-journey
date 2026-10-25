import Link from 'next/link';
import Logo from '@/app/components/Logo';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#111417] text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1a1f24] border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl flex flex-col items-center text-center">
        
        {/* Brand Logo & Error Badge */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-inner">
            <Logo className="w-12 h-12 rounded-lg" />
          </div>
          <span className="absolute -bottom-2 -right-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-[#1a1f24] shadow-md">
            404
          </span>
        </div>

        {/* Status Text */}
        <span className="text-xs font-mono font-bold text-[#0a7337] uppercase tracking-widest bg-green-950/60 border border-green-900/50 px-3 py-1 rounded-full mb-3">
          Route Not Found
        </span>
        <h1 className="text-2xl font-black text-slate-100 tracking-tight">
          Destination Unreachable
        </h1>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          The requested dispatch route, personnel file, or dashboard screen does not exist or has been relocated.
        </p>

        {/* Action Buttons */}
        <div className="w-full space-y-3 mt-8">
          <Link
            href="/login"
            className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3.5 px-4 rounded-xl text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            <span>Return to Sign In</span>
          </Link>

          {/* <Link
            href="/dashboard/driver"
            className="w-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 font-bold py-3.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
          >
            <span>Open Driver Dashboard</span>
          </Link> */}
        </div>

        {/* Footer Support Info */}
        <div className="mt-8 pt-5 border-t border-slate-800/80 w-full text-center">
          <p className="text-[11px] text-slate-400 font-mono">
            AJMS Fleet Logistics Network
          </p>
        </div>
      </div>
    </main>
  );
}