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
  plate_number?: string | null;
  vehicle_model?: string | null;
  is_online: boolean;
}

export default function LivePersonnelTracker({ initialPersonnel }: { initialPersonnel: Personnel[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedUserId = searchParams.get('userId');

  const [personnel, setPersonnel] = useState<Personnel[]>(initialPersonnel);

  // Sync state when initialPersonnel changes (e.g. after adding a new user or vehicle)
  useEffect(() => {
    setPersonnel(initialPersonnel);
  }, [initialPersonnel]);

  // Poll for live presence status every 2 seconds without overwriting vehicle & plate details
  useEffect(() => {
    const fetchPresence = async () => {
      const updatedList = await getLivePresenceAction();
      if (updatedList && updatedList.length > 0) {
        setPersonnel((prev) =>
          prev.map((p) => {
            const updated = (updatedList as any[]).find((u) => u.id === p.id);
            return updated
              ? {
                  ...p,
                  is_online: Boolean(updated.is_online),
                  last_seen: updated.last_seen,
                }
              : p;
          })
        );
      }
    };

    fetchPresence();
    const interval = setInterval(fetchPresence, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectUser = (id: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('userId', id.toString());

    // Update query params and revalidate Next.js server component
    router.push(`?${params.toString()}`, { scroll: false });
    router.refresh();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <h2 className="font-bold text-slate-900 text-sm">Live Personnel Tracking</h2>
        <span className="text-xs text-slate-500 font-semibold">{personnel.length} Total Users</span>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {personnel.map((user) => {
          const isSelected = selectedUserId === user.id.toString();

          return (
            <button
              type="button"
              key={user.id}
              onClick={() => handleSelectUser(user.id)}
              className={`flex flex-col justify-between p-4 rounded-xl border text-left transition-all active:scale-95 ${
                isSelected
                  ? 'border-[#0a7337] bg-green-50/80 shadow-sm ring-2 ring-[#0a7337]/20'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between w-full gap-2">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    {user.name}
                    <span
                      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold ${
                        user.role === 'manager'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
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
              </div>

              {/* Driver Primary Identifier: Assigned Plate Number */}
              {user.role === 'driver' && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between w-full">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Assigned Plate
                  </span>
                  <span className="font-mono text-xs font-black text-slate-900 bg-white border border-slate-300 px-2 py-0.5 rounded shadow-sm">
                    {user.plate_number ? user.plate_number : 'NO CAR'}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}