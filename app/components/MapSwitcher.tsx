// app/components/MapSwitcher.tsx
'use client';

import React, { useState } from 'react';
import LiveLocationTracker from '@/app/components/LiveLocationTracker';
import BackupMapTracker from '@/app/components/BackupMapTracker';
import GoogleLiveMap from '@/app/components/GoogleLiveMap';
import SpeedPanel from '@/app/components/SpeedPanel';

interface MapSwitcherProps {
  tripId: number | string;
  currentLocation?: string | null;
  isManagerView?: boolean;
  driverName?: string;
  startedAt?: string | null;
}

export default function MapSwitcher(props: MapSwitcherProps) {
  const [activeMap, setActiveMap] = useState<'primary' | 'backup' | 'google'>('primary');

  const mapLabel = 
    activeMap === 'primary' ? 'Leaflet (OSM / Satellite)' : 
    activeMap === 'backup' ? 'MapLibre (Vector Failover)' : 
    'Google Maps (Keyless)';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[11px] font-medium text-slate-500">
          Engine: <strong className="text-slate-700">{mapLabel}</strong>
        </span>

        <div className="flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveMap('primary')}
            className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${
              activeMap === 'primary' ? 'bg-[#0a7337] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Main
          </button>
          <button
            type="button"
            onClick={() => setActiveMap('backup')}
            className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${
              activeMap === 'backup' ? 'bg-[#0a7337] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Backup
          </button>
          <button
            type="button"
            onClick={() => setActiveMap('google')}
            className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${
              activeMap === 'google' ? 'bg-[#0a7337] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Google
          </button>
        </div>
      </div>

      {activeMap === 'primary' && <LiveLocationTracker {...props} />}
      {activeMap === 'backup' && <BackupMapTracker {...props} onSwitchBack={() => setActiveMap('primary')} />}
      {activeMap === 'google' && <GoogleLiveMap {...props} />}

      <SpeedPanel tripId={props.tripId} />
    </div>
  );
}