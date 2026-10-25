'use client';

import React, { useState } from 'react';
import LiveLocationTracker from '@/app/components/LiveLocationTracker';
import BackupMapTracker from '@/app/components/BackupMapTracker';

interface MapSwitcherProps {
  tripId: number | string;
  currentLocation?: string | null;
  isManagerView?: boolean;
  driverName?: string;
  startedAt?: string | null;
}

export default function MapSwitcher(props: MapSwitcherProps) {
  const [activeMap, setActiveMap] = useState<'primary' | 'backup'>('primary');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-slate-500">
          Engine: <strong className="text-slate-700">{activeMap === 'primary' ? 'Leaflet (OSM / Satellite)' : 'MapLibre (Vector Failover)'}</strong>
        </span>
        <button
          type="button"
          onClick={() => setActiveMap((prev) => (prev === 'primary' ? 'backup' : 'primary'))}
          className="text-xs font-semibold text-[#0a7337] hover:text-[#085a2b] hover:underline transition-colors flex items-center gap-1"
        >
          {activeMap === 'primary' ? '⚡ Switch to Backup Map' : '↩ Switch to Primary Map'}
        </button>
      </div>

      {activeMap === 'primary' ? (
        <LiveLocationTracker {...props} />
      ) : (
        <BackupMapTracker {...props} onSwitchBack={() => setActiveMap('primary')} />
      )}
    </div>
  );
}
