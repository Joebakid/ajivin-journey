export default function Loader({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center space-y-3 p-6">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-[#0a7337] rounded-full animate-spin"></div>
      <p className="text-sm font-medium text-slate-500 animate-pulse">{text}</p>
    </div>
  );
}
