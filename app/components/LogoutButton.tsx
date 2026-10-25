'use client';

import { useRouter } from 'next/navigation';
import { handleLogoutAction } from '../actions/login';

export default function LogoutButton({ userId }: { userId?: number }) {
  const router = useRouter();

  const handleLogout = async () => {
    if (userId) {
      await handleLogoutAction(userId);
    }
    router.push('/login');
  };

  return (
    <button 
      onClick={handleLogout}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
      Logout
    </button>
  );
}