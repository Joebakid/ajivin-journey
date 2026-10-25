'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getLivePresenceAction } from '@/app/actions/presence';

interface Personnel {
  id: number;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  license_number: string | null;
  is_online: boolean;
}

export default function LivePersonnelTracker({ initialPersonnel }: { initialPersonnel: Personnel[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedUserId = searchParams.get('userId');

  const [personnel, setPersonnel] = useState<Personnel[]>(initialPersonnel);

  // Poll for live online status changes every 2 seconds
  useEffect(() => {
    const fetchPresence = async () => {
      const updatedList = await getLivePresenceAction();
      if (updatedList && updatedList.length > 0) {
        setPersonnel(updatedList as Personnel[]);
      }
    };

    fetchPresence();
    const interval = setInterval(fetchPresence, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectUser = (id: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('userId', id.toString());
    
    // Update query params and force Next.js server component refresh
    router.push(`?${params.toString()}`, { scroll: false });
    router.refresh();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <h2 className="font-bold text-slate-900">Live Personnel Tracking</h2>
        <span className="text-xs text-slate-500 font-semibold">{personnel.length} Total Users</span>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 ">
        {personnel.map((user) => {
          const isSelected = selectedUserId === user.id.toString();

          return (
            <button
              type="button"
              key={user.id}
              onClick={() => handleSelectUser(user.id)}
              className={`flex items-center cursor-pointer justify-between p-4 rounded-xl border text-left transition-all active:scale-95 ${
                isSelected 
                  ? 'border-[#0a7337] bg-green-50/80 shadow-sm ring-2 ring-[#0a7337]/20' 
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 ">
                  {user.name} 
                  <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${user.role === 'manager' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                    {user.role}
                  </span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">{user.phone || 'No phone set'}</p>
              </div>
              
              {/* Online / Offline Status Badge */}
              <div className="flex items-center gap-2 shrink-0">
                {user.is_online ? (
                  <span className="flex items-center gap-1.5 bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                    Online
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                    Offline
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}