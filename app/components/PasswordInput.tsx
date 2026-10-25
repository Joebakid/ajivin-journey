'use client';

import { useState } from 'react';

export default function PasswordInput() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        name="password"
        type={showPassword ? 'text' : 'password'}
        required
        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none transition-all pr-16"
        placeholder="••••••••"
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-[#0a7337] transition-colors"
      >
        {showPassword ? 'HIDE' : 'SHOW'}
      </button>
    </div>
  );
}
