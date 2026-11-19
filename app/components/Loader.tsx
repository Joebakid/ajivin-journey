import Logo from '@/app/components/Logo';

export default function Loader({ text }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <div className="relative flex h-[100px] w-[100px] items-center justify-center rounded-full bg-white">
        {/* Subtle background track */}
        <div className="absolute inset-0 rounded-full border-2 border-slate-200" />

        {/* Spinning green arc */}
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-[#0a7337] border-l-transparent border-t-transparent" />

        {/* Centered logo */}
        <div className="pointer-events-none relative z-10 flex h-10 w-10 items-center justify-center">
          <Logo className="h-full w-full" />
        </div>
      </div>

      {text && (
        <p className="mt-5 animate-pulse text-xs font-bold uppercase tracking-widest text-[#0a7337]">
          {text}
        </p>
      )}
    </div>
  );
}
