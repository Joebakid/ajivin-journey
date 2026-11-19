// app/components/SpeedPanel.tsx
'use client';

import { useEffect, useState } from 'react';

interface SpeedPanelProps {
  tripId: number | string;
  /** Hide the panel entirely until the trip is on the road */
  hideWhenNotLive?: boolean;
}

interface SpeedState {
  live: boolean;
  speedKmh: number | null;
  limit: number;
  maxKmh: number | null;
  speeding: boolean;
  lat: number | null;
  lng: number | null;
  ageSeconds: number | null;
}

const EMPTY: SpeedState = {
  live: false,
  speedKmh: null,
  limit: 100,
  maxKmh: null,
  speeding: false,
  lat: null,
  lng: null,
  ageSeconds: null,
};

function readLocation(raw: unknown) {
  if (typeof raw !== 'string') return { speedKmh: null, lat: null, lng: null };
  try {
    const p = JSON.parse(raw);
    const lat = parseFloat(p.lat);
    const lng = parseFloat(p.lng);
    let speedKmh: number | null = null;
    if (p.speedKmh !== null && p.speedKmh !== undefined && Number.isFinite(Number(p.speedKmh))) {
      speedKmh = Number(p.speedKmh);
    } else if (p.speed !== null && p.speed !== undefined && Number.isFinite(Number(p.speed))) {
      speedKmh = Number(p.speed) * 3.6;
    }
    return {
      speedKmh: speedKmh === null ? null : Math.round(speedKmh),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    };
  } catch {
    return { speedKmh: null, lat: null, lng: null };
  }
}

/**
 * Shows the driver's speed next to whichever map is on screen.
 * It reads /api/trips/:id/live, so it works the same for Leaflet and MapLibre and needs
 * no changes inside either map.
 */
export default function SpeedPanel({ tripId, hideWhenNotLive = true }: SpeedPanelProps) {
  const [s, setS] = useState<SpeedState>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/trips/${tripId}/live`, { cache: 'no-store' });
        if (!res.ok) return;
        const t = await res.json();
        if (cancelled) return;
        const loc = readLocation(t.current_location);
        setS({
          live: Boolean(t.live),
          speedKmh: loc.speedKmh,
          limit: typeof t.speed_limit_kmh === 'number' ? t.speed_limit_kmh : 100,
          maxKmh: typeof t.max_speed_kmh === 'number' ? t.max_speed_kmh : null,
          speeding: Boolean(t.speeding),
          lat: loc.lat,
          lng: loc.lng,
          ageSeconds: typeof t.location_age_seconds === 'number' ? t.location_age_seconds : null,
        });
        setLoaded(true);
      } catch {
        /* network blip: try again next tick */
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tripId]);

  if (!loaded || (hideWhenNotLive && !s.live)) return null;

  const stale = s.ageSeconds !== null && s.ageSeconds > 30;
  const over = s.speedKmh !== null && s.speedKmh > s.limit;
  const speeding = over || s.speeding;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
        speeding ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex items-center gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Speed</p>
          <p className={`text-2xl font-black font-mono leading-none ${speeding ? 'text-red-600' : 'text-slate-900'}`}>
            {stale || s.speedKmh === null ? '--' : s.speedKmh}
            <span className="text-xs font-semibold text-slate-500 ml-1">km/h</span>
          </p>
        </div>

        <div className="hidden sm:block h-8 w-px bg-slate-200" />

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Limit</p>
          <p className="text-sm font-bold text-slate-700">{s.limit} km/h</p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Top speed</p>
          <p className="text-sm font-bold text-slate-700">
            {s.maxKmh === null ? 'No data' : `${Math.round(s.maxKmh)} km/h`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
            speeding
              ? 'bg-red-600 text-white border-red-600 animate-pulse'
              : stale
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-green-50 text-[#0a7337] border-green-200'
          }`}
        >
          {speeding ? 'SPEEDING' : stale ? 'Signal delayed' : 'Within limit'}
        </span>

        {s.lat !== null && s.lng !== null && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-[#0a7337] hover:underline"
          >
            Open in Google Maps
          </a>
        )}
      </div>
    </div>
  );
}