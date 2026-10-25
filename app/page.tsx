import Link from 'next/link';

export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900 antialiased font-sans">
      <div className="w-full max-w-2xl px-6">

        {/* The Premium Elevated Card */}
        <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.08)] p-12 md:p-20 text-center space-y-10">

          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-[#0a7337]">
              AJMS
            </h1>
            <p className="text-slate-500 text-lg md:text-xl max-w-md mx-auto leading-relaxed font-medium">
              Ajivin Journey Management System. Faster, safer fleet operations.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-[#0a7337] px-10 py-4 text-sm font-bold text-white hover:bg-[#085a2b] hover:-translate-y-0.5 transition-all duration-200 shadow-lg active:scale-95"
            >
              Login to Portal
            </Link>
          </div>

          <div className="pt-10 border-t border-slate-100/80">
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-[0.3em] font-bold">
              Secure Access Only
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}
