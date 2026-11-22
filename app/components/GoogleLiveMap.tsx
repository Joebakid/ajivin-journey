// app/components/GoogleLiveMap.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/app/components/googleMapsLoader';
import { useDriverGps } from '@/app/components/useDriverGps';
import type { ReactNode } from 'react';

/* ---------------------------------- Icons --------------------------------- */
function Icon({ children, size = 14, className = '' }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}
const IconPin = (p: { size?: number; className?: string }) => (<Icon {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></Icon>);
const IconCopy = (p: { size?: number; className?: string }) => (<Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>);
const IconCheck = (p: { size?: number; className?: string }) => (<Icon {...p}><polyline points="20 6 9 17 4 12" /></Icon>);
const IconExternal = (p: { size?: number; className?: string }) => (<Icon {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></Icon>);
const IconClock = (p: { size?: number; className?: string }) => (<Icon {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>);
const IconMaximize = (p: { size?: number; className?: string }) => (<Icon {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></Icon>);
const IconMinimize = (p: { size?: number; className?: string }) => (<Icon {...p}><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></Icon>);
const IconCrosshair = (p: { size?: number; className?: string }) => (<Icon {...p}><circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" /><line x1="12" y1="22" x2="12" y2="18" /></Icon>);
const IconArrow = (p: { size?: number; className?: string; style?: React.CSSProperties }) => (<svg xmlns="http://www.w3.org/2000/svg" width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" fill="currentColor" className={p.className} style={p.style} aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>);

/* Types & helpers */
interface LatLng { lat: number; lng: number; }
interface Motion { speedMs: number | null; heading: number | null; accuracy: number | null; }
interface LiveInfo { limit: number; maxKmh: number | null; speeding: boolean; }

export interface GoogleLiveMapProps {
  tripId: number | string;
  currentLocation?: string | null;
  isManagerView?: boolean;
  driverName?: string;
  startedAt?: string | null;
  onFail?: (reason: string) => void;
}

const DEFAULT_CENTER: LatLng = { lat: 5.5544, lng: 5.7932 };
const FOLLOW_ZOOM = 16;
const STALE_AFTER_SECONDS = 30;
const TILES_TIMEOUT_MS = 15000;
const TRAIL_MAX_POINTS = 300;
const GEOCODE_MIN_MOVE_M = 25;

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg: number) => DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const toRad = (d: number) => (d * Math.PI) / 180;
function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parseLocation(raw?: string | null) {
  const empty = { pos: null as LatLng | null, speedMs: null as number | null, heading: null as number | null, accuracy: null as number | null, updatedAt: null as number | null };
  if (!raw) return empty;
  try {
    const p = JSON.parse(raw);
    const lat = parseFloat(p.lat);
    const lng = parseFloat(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return empty;
    const ts = p.updatedAt ? new Date(p.updatedAt).getTime() : NaN;
    const speedMs = p.speed != null && Number.isFinite(Number(p.speed))
      ? Number(p.speed)
      : p.speedKmh != null && Number.isFinite(Number(p.speedKmh))
      ? Number(p.speedKmh) / 3.6
      : null;
    return {
      pos: { lat, lng },
      speedMs,
      heading: Number.isFinite(Number(p.heading)) && p.heading !== null ? Number(p.heading) : null,
      accuracy: Number.isFinite(Number(p.accuracy)) && p.accuracy !== null ? Number(p.accuracy) : null,
      updatedAt: isNaN(ts) ? null : ts,
    };
  } catch {
    return empty;
  }
}

const formatElapsed = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s` : `${pad(m)}m ${pad(sec)}s`;
};

// Compact "time ago" so a long gap never prints something like "72874s"
const formatAgo = (s: number) => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
};

export default function GoogleLiveMap({
  tripId,
  currentLocation,
  isManagerView = false,
  driverName = 'Driver',
  startedAt = null,
  onFail,
}: GoogleLiveMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const initial = useMemo(() => parseLocation(currentLocation), []); // eslint-disable-line react-hooks/exhaustive-deps

  const gps = useDriverGps({ tripId, enabled: !isManagerView });

  const mapElRef = useRef<HTMLDivElement>(null);
  const gmRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const trailRef = useRef<any>(null);
  const followRef = useRef(true);
  const tilesLoadedRef = useRef(false);
  const failedRef = useRef(false);
  const firstFixZoomedRef = useRef(Boolean(initial.pos));
  const lastTrailRef = useRef<LatLng | null>(null);
  const lastGeocodeRef = useRef<LatLng | null>(null);
  const elapsedAnchorRef = useRef<{ seconds: number; perf: number } | null>(null);

  const [pos, setPos] = useState<LatLng | null>(initial.pos);
  const [motion, setMotion] = useState<Motion>({ speedMs: initial.speedMs, heading: initial.heading, accuracy: initial.accuracy });
  const [lastUpdateMs, setLastUpdateMs] = useState<number | null>(initial.updatedAt);
  const [live, setLive] = useState<LiveInfo>({ limit: 100, maxKmh: null, speeding: false });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite'>('roadmap');
  const [isFollowing, setIsFollowing] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [tripStart, setTripStart] = useState<string | null>(startedAt);

  // The map is built once, so it must read the latest values through refs, not through effect deps.
  const posRef = useRef<LatLng | null>(pos);
  posRef.current = pos;
  const driverNameRef = useRef(driverName);
  driverNameRef.current = driverName;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  const fail = useCallback((reason: string) => {
    if (failedRef.current) return;
    failedRef.current = true;
    setMapError(reason);
    onFailRef.current?.(reason);
  }, []);

  // Keyless mode only: dismiss Google's "development purposes" popup
  useEffect(() => {
    if (apiKey) return;
    const interval = setInterval(() => {
      const dismissBtn = document.querySelector('.dismissButton') as HTMLElement | null;
      if (dismissBtn) dismissBtn.click();
      const errContainer = document.querySelector('.gm-err-container') as HTMLElement | null;
      if (errContainer) {
        errContainer.style.display = 'none';
        errContainer.style.opacity = '0';
      }
    }, 300);
    return () => clearInterval(interval);
  }, [apiKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isManagerView || !gps.fix) return;
    setPos({ lat: gps.fix.lat, lng: gps.fix.lng });
    setMotion({ speedMs: gps.fix.speedMs, heading: gps.fix.heading, accuracy: gps.fix.accuracy });
    setLastUpdateMs(Date.now());
  }, [gps.fix, isManagerView]);

  /* ------------------- Poll the trip (speed, timer, position) ------------------- */

  useEffect(() => {
    let cancelled = false;
    const poll = async (force = false) => {
      if (document.hidden && !force) return;
      const sentAt = performance.now();
      let trip: any = null;
      try {
        const res = await fetch(`/api/trips/${tripId}/live`, { cache: 'no-store' });
        if (res.ok) trip = await res.json();
      } catch { /* network blip */ }

      const receivedAt = performance.now();
      if (cancelled || !trip) return;

      if (trip.started_at) setTripStart((prev) => prev ?? trip.started_at);

      if (typeof trip.elapsed_seconds === 'number') {
        const sampled = (sentAt + receivedAt) / 2;
        const a = elapsedAnchorRef.current;
        const predicted = a ? a.seconds + (sampled - a.perf) / 1000 : null;
        if (predicted === null || Math.abs(predicted - trip.elapsed_seconds) > 1.5) {
          elapsedAnchorRef.current = { seconds: trip.elapsed_seconds, perf: sampled };
        }
      }

      setLive({
        limit: typeof trip.speed_limit_kmh === 'number' ? trip.speed_limit_kmh : 100,
        maxKmh: typeof trip.max_speed_kmh === 'number' ? trip.max_speed_kmh : null,
        speeding: Boolean(trip.speeding),
      });

      if (isManagerView && trip.live && trip.current_location) {
        const p = parseLocation(trip.current_location);
        if (p.pos) {
          // Keep the same object when nothing moved, so the map is not touched needlessly
          setPos((prev) => (prev && prev.lat === p.pos!.lat && prev.lng === p.pos!.lng ? prev : p.pos));
          setMotion({ speedMs: p.speedMs, heading: p.heading, accuracy: p.accuracy });
          setLastUpdateMs(
            typeof trip.location_age_seconds === 'number'
              ? Date.now() - trip.location_age_seconds * 1000
              : p.updatedAt ?? Date.now()
          );
        }
      }
    };

    poll(true);
    const id = setInterval(() => poll(), 2500);
    return () => { cancelled = true; clearInterval(id); };
  }, [tripId, isManagerView]);

  /* ---------------------- Build the map ONCE per mount ---------------------- */
  // Before: this effect depended on `pos`, so every GPS update destroyed and rebuilt the whole
  // map (the flicker/reload). Each rebuild is also a billable "map load" when a key is used.
  // Now it only depends on the API key. Position changes are applied by the effect further down.

  useEffect(() => {
    let cancelled = false;

    const onAuthFailure = () => {
      console.warn('Google Maps auth failure (keyless or invalid key).');
    };
    window.addEventListener('gmaps-auth-failure', onAuthFailure);

    const tilesTimer = setTimeout(() => {
      if (!tilesLoadedRef.current) fail('Google map tiles did not load in time.');
    }, TILES_TIMEOUT_MS);

    loadGoogleMaps(apiKey)
      .then((gm) => {
        if (cancelled || !mapElRef.current) return;
        gmRef.current = gm;

        const start = posRef.current ?? DEFAULT_CENTER;
        const map = new gm.Map(mapElRef.current, {
          center: start,
          zoom: posRef.current ? FOLLOW_ZOOM : 13,
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          zoomControl: true,
          // 'cooperative' lets a phone user scroll the page past the map with one finger.
          // Expanded (full screen) switches to 'greedy' in an effect below.
          gestureHandling: 'cooperative',
          clickableIcons: false,
        });

        gm.event.addListenerOnce(map, 'tilesloaded', () => { tilesLoadedRef.current = true; });
        map.addListener('dragstart', () => {
          followRef.current = false;
          setIsFollowing(false);
        });

        markerRef.current = new gm.Marker({
          map, position: start, title: driverNameRef.current, zIndex: 10,
          icon: { path: gm.SymbolPath.CIRCLE, scale: 9, fillColor: '#0a7337', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 },
        });
        circleRef.current = new gm.Circle({ map, center: start, radius: 0, strokeColor: '#0a7337', strokeOpacity: 0.4, strokeWeight: 1, fillColor: '#0a7337', fillOpacity: 0.12, clickable: false });
        trailRef.current = new gm.Polyline({ map, path: [], strokeColor: '#0a7337', strokeOpacity: 0.7, strokeWeight: 4, clickable: false });

        mapRef.current = map;
        setMapReady(true);
      })
      .catch((e: Error) => fail(e.message));

    return () => {
      cancelled = true;
      clearTimeout(tilesTimer);
      window.removeEventListener('gmaps-auth-failure', onAuthFailure);

      if (mapRef.current && gmRef.current) {
        gmRef.current.event.clearInstanceListeners(mapRef.current);
      }
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      trailRef.current?.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      trailRef.current = null;
      if (mapElRef.current) mapElRef.current.innerHTML = '';
      setMapReady(false);
    };
  }, [apiKey, fail]);

  /* ------------------ Move the marker when the position changes ------------------ */

  const speedKmh = motion.speedMs === null ? null : Math.round(motion.speedMs * 3.6);
  const isMoving = speedKmh !== null && speedKmh > 3;

  useEffect(() => {
    const gm = gmRef.current;
    if (!mapReady || !gm || !pos || !markerRef.current || !mapRef.current) return;

    markerRef.current.setPosition(pos);
    circleRef.current?.setCenter(pos);
    circleRef.current?.setRadius(motion.accuracy ? Math.min(motion.accuracy, 200) : 0);

    const showArrow = isMoving && motion.heading !== null;
    markerRef.current.setIcon(
      showArrow
        ? { path: gm.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, rotation: motion.heading, fillColor: '#0a7337', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }
        : { path: gm.SymbolPath.CIRCLE, scale: 9, fillColor: '#0a7337', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }
    );

    if (!lastTrailRef.current || distanceM(lastTrailRef.current, pos) > 5) {
      lastTrailRef.current = pos;
      const path = trailRef.current?.getPath();
      if (path) {
        path.push(new gm.LatLng(pos.lat, pos.lng));
        while (path.getLength() > TRAIL_MAX_POINTS) path.removeAt(0);
      }
    }

    // First real fix after starting on the default centre: zoom in once
    if (!firstFixZoomedRef.current) {
      firstFixZoomedRef.current = true;
      mapRef.current.setZoom(FOLLOW_ZOOM);
    }

    if (followRef.current) mapRef.current.panTo(pos);
  }, [pos, motion, mapReady, isMoving]);

  useEffect(() => {
    markerRef.current?.setTitle(driverName);
  }, [driverName, mapReady]);

  useEffect(() => {
    mapRef.current?.setMapTypeId(mapType === 'satellite' ? 'hybrid' : 'roadmap');
  }, [mapType, mapReady]);

  /* ---------------------------- Responsiveness ---------------------------- */

  // Collapsed: one finger scrolls the page, two fingers move the map. Expanded: map takes all gestures.
  useEffect(() => {
    mapRef.current?.setOptions({ gestureHandling: isExpanded ? 'greedy' : 'cooperative' });
  }, [isExpanded, mapReady]);

  // Tell Google Maps whenever its container changes size (rotation, window resize, expand)
  useEffect(() => {
    const el = mapElRef.current;
    if (!mapReady || !el || typeof ResizeObserver === 'undefined') return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (mapRef.current && gmRef.current) {
          gmRef.current.event.trigger(mapRef.current, 'resize');
          if (followRef.current && posRef.current) mapRef.current.setCenter(posRef.current);
        }
      });
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mapReady]);

  // Full-screen mode: stop the page behind from scrolling, and let Escape close it
  useEffect(() => {
    if (!isExpanded) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isExpanded]);

  /* ------------------------------- Address -------------------------------- */

  useEffect(() => {
    if (!pos) return;
    if (lastGeocodeRef.current && distanceM(lastGeocodeRef.current, pos) < GEOCODE_MIN_MOVE_M) return;
    lastGeocodeRef.current = pos;
    const ctrl = new AbortController();
    fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.lat}&longitude=${pos.lng}&localityLanguage=en`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const line = [d.locality || d.neighbourhood, d.city, d.principalSubdivision].filter(Boolean).join(', ');
        if (line) setAddress(line);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [pos]);

  /* -------------------------------- Actions -------------------------------- */

  const recenter = () => {
    followRef.current = true;
    setIsFollowing(true);
    if (pos && mapRef.current) {
      mapRef.current.panTo(pos);
      mapRef.current.setZoom(FOLLOW_ZOOM);
    }
  };

  const copyPosition = async () => {
    if (!pos) return;
    try {
      await navigator.clipboard.writeText(`${address ? address + '\n' : ''}${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  /* ---------------------------- Derived values ---------------------------- */

  const elapsedSeconds = (() => {
    void now;
    const a = elapsedAnchorRef.current;
    if (a) return Math.max(0, Math.floor(a.seconds + (performance.now() - a.perf) / 1000));
    if (!tripStart) return null;
    const s = new Date(tripStart).getTime();
    return isNaN(s) ? null : Math.max(0, Math.floor((Date.now() - s) / 1000));
  })();

  const secondsSinceUpdate = lastUpdateMs ? Math.max(0, Math.floor((now - lastUpdateMs) / 1000)) : null;
  const hasFix = pos !== null && lastUpdateMs !== null;
  const stale = hasFix && secondsSinceUpdate !== null && secondsSinceUpdate > STALE_AFTER_SECONDS;
  const overLimit = speedKmh !== null && speedKmh > live.limit;
  const speeding = overLimit || live.speeding;

  const statusText = mapError
    ? 'Google Maps error'
    : gps.error && !isManagerView
    ? gps.error
    : !hasFix
    ? isManagerView ? 'Waiting for driver' : 'Waiting for GPS'
    : stale
    ? `No update for ${formatAgo(secondsSinceUpdate ?? 0)}`
    : 'Live GPS';
  const dotClass = !hasFix ? 'bg-slate-500' : stale ? 'bg-amber-400' : 'bg-green-500';
  const pingClass = !hasFix ? '' : stale ? 'bg-amber-300' : 'bg-green-400';
  const googleMapsUrl = pos ? `https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}` : '#';

  /* ----------------------------------- UI ----------------------------------- */

  return (
    <div
      className={
        isExpanded
          ? 'map-dark-scope fixed inset-0 z-50 bg-[#0d1013] flex flex-col overflow-hidden text-white pb-[env(safe-area-inset-bottom)]'
          : 'map-dark-scope bg-[#14181c] rounded-2xl border border-slate-800 overflow-hidden text-white relative shadow-lg w-full max-w-full'
      }
    >
      {/* Only in keyless mode: hide Google's "for development purposes only" popup */}
      {!apiKey && (
        <style>{`
          .gm-err-container,
          .gm-err-message,
          .gm-err-title,
          .gm-err-content,
          .gm-err-links,
          .gm-err-icon,
          .dismissButton {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
          }
          .gm-style { filter: none !important; }
          .widget-scene { display: none !important; }
        `}</style>
      )}

      {/* Header: two rows on phones, one row from sm up */}
      <div
        className={`px-3 sm:px-4 py-3 bg-[#0d1013] border-b border-slate-800 shrink-0 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
          isExpanded ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {hasFix && !stale && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pingClass}`} />}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-slate-100 truncate">{isManagerView ? `${driverName}'s location` : 'Your location'}</p>
                <span className="hidden min-[420px]:inline text-[9px] bg-blue-900/50 text-blue-300 border border-blue-700/60 px-1.5 py-0.5 rounded font-semibold uppercase shrink-0">Google</span>
              </div>
              <p className={`text-[11px] leading-snug ${stale || mapError || gps.error ? 'text-amber-300' : 'text-slate-400'}`}>{statusText}</p>
            </div>
          </div>

          {elapsedSeconds !== null && (
            <span className="sm:hidden shrink-0 bg-[#0a7337]/25 border border-[#0a7337] text-green-300 font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
              <IconClock size={12} />
              {formatElapsed(elapsedSeconds)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {elapsedSeconds !== null && (
            <span className="hidden sm:flex shrink-0 bg-[#0a7337]/25 border border-[#0a7337] text-green-300 font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full items-center gap-1.5 whitespace-nowrap">
              <IconClock size={12} />
              {formatElapsed(elapsedSeconds)}
            </span>
          )}

          <div className="flex flex-1 sm:flex-none items-center rounded-lg bg-slate-800 p-0.5 border border-slate-700 min-w-0">
            {(['roadmap', 'satellite'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMapType(t)}
                className={`flex-1 sm:flex-none px-3 sm:px-2.5 py-2 sm:py-1 text-[11px] font-semibold rounded-md transition-all ${
                  mapType === t ? 'bg-[#0a7337] text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t === 'roadmap' ? 'Road' : 'Satellite'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={recenter}
            className={`shrink-0 text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-all flex items-center gap-1.5 active:scale-95 ${
              isFollowing
                ? 'bg-[#0a7337] hover:bg-[#085a2b] text-white'
                : 'bg-amber-500/20 border border-amber-400/60 text-amber-200 hover:bg-amber-500/30'
            }`}
            title="Centre the map on the vehicle and keep following it"
          >
            <IconCrosshair size={13} />
            <span className="hidden min-[420px]:inline">{isFollowing ? 'Following' : 'Recenter'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="shrink-0 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-all flex items-center gap-1.5 active:scale-95"
            title={isExpanded ? 'Minimise map' : 'Expand map'}
            aria-label={isExpanded ? 'Minimise map' : 'Expand map'}
          >
            {isExpanded ? <IconMinimize size={13} /> : <IconMaximize size={13} />}
            <span className="hidden sm:inline">{isExpanded ? 'Minimise' : 'Expand'}</span>
          </button>
        </div>
      </div>

      {/* Map */}
      <div
        className={`relative w-full bg-slate-900 ${
          isExpanded
            ? 'flex-1 min-h-[240px]'
            : 'h-[52dvh] min-h-[280px] max-h-[520px] sm:h-[380px] sm:max-h-none lg:h-[440px]'
        }`}
      >
        <div ref={mapElRef} className="w-full h-full" />

        {!mapReady && !mapError && (
          <div className="absolute inset-0 z-10 bg-slate-950/60 flex items-center justify-center pointer-events-none">
            <div className="h-7 w-7 rounded-full border-2 border-slate-500 border-t-green-400 animate-spin" />
          </div>
        )}

        {mapError && (
          <div className="absolute inset-0 z-10 bg-slate-950/85 flex items-center justify-center text-center px-6">
            <div>
              <p className="text-sm font-semibold text-amber-300">Google Maps failed to initialize</p>
              <p className="text-xs text-slate-300 mt-1 max-w-xs">{mapError}</p>
              <p className="text-xs text-slate-400 mt-2 max-w-xs">Switch to the Main map above. It does not need a key.</p>
            </div>
          </div>
        )}

        {!mapError && mapReady && !hasFix && (
          <div className="absolute inset-0 z-10 bg-slate-950/55 flex items-center justify-center text-center px-6 pointer-events-none">
            <div>
              <div className="mx-auto mb-3 h-7 w-7 rounded-full border-2 border-slate-500 border-t-green-400 animate-spin" />
              <p className="text-sm font-semibold text-slate-100">{isManagerView ? 'Waiting for the driver' : 'Waiting for a GPS fix'}</p>
              <p className="text-xs text-slate-300 mt-1 max-w-xs">{isManagerView ? 'The map updates as soon as the driver shares a position.' : gps.error || 'Allow location access in your browser and step outside if you are indoors.'}</p>
            </div>
          </div>
        )}

        {hasFix && (
          <div className={`absolute top-2.5 left-2.5 sm:top-3 sm:left-3 z-[5] rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 shadow-lg border backdrop-blur-md ${speeding ? 'bg-red-600/95 border-red-300 animate-pulse' : 'bg-slate-900/90 border-slate-700/80'}`}>
            <div className="flex items-baseline gap-1">
              <span className="text-xl sm:text-2xl font-black font-mono leading-none">{speedKmh ?? 0}</span>
              <span className="text-[9px] sm:text-[10px] font-semibold text-slate-200">km/h</span>
            </div>
            <p className={`text-[9px] sm:text-[10px] font-semibold mt-0.5 ${speeding ? 'text-white' : 'text-slate-400'}`}>{speeding ? `SPEEDING · limit ${live.limit}` : `limit ${live.limit}`}</p>
          </div>
        )}
      </div>

      {/* Details */}
      <div
        className={`bg-[#14181c] border-t border-slate-800 shrink-0 ${
          isExpanded ? 'max-h-[44dvh] sm:max-h-[48vh] overflow-y-auto overscroll-contain' : ''
        }`}
      >
        <div className="p-3 sm:p-4 space-y-3">
          <section className="rounded-xl border border-slate-700/70 bg-gradient-to-br from-[#1b2a22] to-[#1a1f24] p-3.5 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-green-300 mb-1 flex items-center gap-1.5">
                  <IconPin size={12} />
                  Vehicle is at
                </p>
                {pos ? (
                  <p className="text-base sm:text-lg font-semibold text-white leading-snug break-words">{address || `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`}</p>
                ) : (
                  <p className="text-xs sm:text-sm text-slate-400">The address appears once a position is received.</p>
                )}
              </div>
              <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2 sm:gap-1.5 shrink-0">
                <button type="button" onClick={copyPosition} disabled={!pos} className="text-xs sm:text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 border border-slate-600 px-3 py-2.5 sm:px-2.5 sm:py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 active:scale-95">
                  {copied ? <IconCheck size={13} className="text-green-400" /> : <IconCopy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs sm:text-[11px] font-semibold text-center bg-[#0a7337] hover:bg-[#085a2b] text-white px-3 py-2.5 sm:px-2.5 sm:py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 active:scale-95 whitespace-nowrap">
                  <IconExternal size={13} />
                  Open map
                </a>
              </div>
            </div>
            {pos && (
              <p className="mt-2 pt-2 border-t border-slate-700/60 text-[10px] font-mono text-slate-400 flex flex-wrap gap-x-4">
                <span>Lat {pos.lat.toFixed(6)}</span>
                <span>Lng {pos.lng.toFixed(6)}</span>
              </p>
            )}
          </section>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800 min-w-0">
              <span className="block text-xs text-slate-400 mb-1">Speed</span>
              <div className={`font-semibold text-sm flex items-center gap-1.5 ${speeding ? 'text-red-400' : 'text-slate-100'}`}>
                {isMoving ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                    {speedKmh} km/h
                  </>
                ) : speedKmh === null ? (
                  'Unknown'
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    Stationary
                  </>
                )}
              </div>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800 min-w-0">
              <span className="block text-xs text-slate-400 mb-1">Top speed</span>
              <div className="font-semibold text-sm text-slate-100">{live.maxKmh === null ? 'No data' : `${Math.round(live.maxKmh)} km/h`}</div>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800 min-w-0">
              <span className="block text-xs text-slate-400 mb-1">Heading</span>
              <div className="font-semibold text-sm text-slate-100 flex items-center gap-1.5">
                {isMoving && motion.heading !== null ? (
                  <>
                    <IconArrow size={11} className="text-green-400 shrink-0" style={{ transform: `rotate(${(motion.heading as number) - 45}deg)` }} />
                    {compass(motion.heading)}
                  </>
                ) : 'Not moving'}
              </div>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800 min-w-0">
              <span className="block text-xs text-slate-400 mb-1">Last update</span>
              <div className="font-semibold text-sm text-slate-100">
                {lastUpdateMs ? (
                  <>
                    {new Date(lastUpdateMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span className="text-slate-400 font-normal text-[11px] ml-1.5">({formatAgo(secondsSinceUpdate ?? 0)})</span>
                  </>
                ) : 'No data yet'}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 text-center pb-1">Map data © Google</p>
        </div>
      </div>
    </div>
  );
}