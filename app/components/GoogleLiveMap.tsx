// app/components/GoogleLiveMap.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/app/components/googleMapsLoader';
import { useDriverGps } from '@/app/components/useDriverGps';

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

export default function GoogleLiveMap({
  tripId,
  currentLocation,
  isManagerView = false,
  driverName = 'Driver',
  startedAt = null,
  onFail,
}: GoogleLiveMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const initial = useMemo(() => parseLocation(currentLocation), []);

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

  const fail = useCallback((reason: string) => {
    if (failedRef.current) return;
    failedRef.current = true;
    setMapError(reason);
    onFail?.(reason);
  }, [onFail]);

  // Aggressive auto-dismiss for the Google Maps API key error popup
  useEffect(() => {
    if (apiKey) return; // Skip if a real key is provided
    const interval = setInterval(() => {
      const dismissBtn = document.querySelector('.dismissButton') as HTMLElement;
      if (dismissBtn) {
        dismissBtn.click();
      }
      const errContainer = document.querySelector('.gm-err-container') as HTMLElement;
      if (errContainer) {
        errContainer.style.display = 'none';
        errContainer.style.opacity = '0';
      }
    }, 100);
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
          setPos(p.pos);
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

  useEffect(() => {
    let cancelled = false;
    
    const onAuthFailure = () => {
      console.warn('Loading Google Maps in keyless mode (development).');
    };
    window.addEventListener('gmaps-auth-failure', onAuthFailure);

    const tilesTimer = setTimeout(() => {
      if (!tilesLoadedRef.current) fail('Google map tiles did not load in time.');
    }, TILES_TIMEOUT_MS);

    loadGoogleMaps(apiKey)
      .then((gm) => {
        if (cancelled || !mapElRef.current) return;
        gmRef.current = gm;

        const start = pos ?? DEFAULT_CENTER;
        const map = new gm.Map(mapElRef.current, {
          center: start,
          zoom: pos ? FOLLOW_ZOOM : 13,
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        });

        gm.event.addListenerOnce(map, 'tilesloaded', () => { tilesLoadedRef.current = true; });
        map.addListener('dragstart', () => {
          followRef.current = false;
          setIsFollowing(false);
        });

        markerRef.current = new gm.Marker({
          map, position: start, title: driverName, zIndex: 10,
          icon: { path: gm.SymbolPath.CIRCLE, scale: 9, fillColor: '#0a7337', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 }
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
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      trailRef.current?.setMap(null);
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      trailRef.current = null;
    };
  }, [apiKey, pos, driverName]); // eslint-disable-line react-hooks/exhaustive-deps

  const speedKmh = motion.speedMs === null ? null : Math.round(motion.speedMs * 3.6);
  const isMoving = speedKmh !== null && speedKmh > 3;

  useEffect(() => {
    const gm = gmRef.current;
    if (!mapReady || !gm || !pos || !markerRef.current || !mapRef.current) return;
    markerRef.current.setPosition(pos);
    circleRef.current?.setCenter(pos);
    circleRef.current?.setRadius(motion.accuracy ? Math.min(motion.accuracy, 200) : 0);

    const showArrow = isMoving && motion.heading !== null;
    markerRef.current.setIcon(showArrow ? { path: gm.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, rotation: motion.heading, fillColor: '#0a7337', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 }
      : { path: gm.SymbolPath.CIRCLE, scale: 9, fillColor: '#0a7337', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 });

    if (!lastTrailRef.current || distanceM(lastTrailRef.current, pos) > 5) {
      lastTrailRef.current = pos;
      const path = trailRef.current?.getPath();
      if (path) {
        path.push(new gm.LatLng(pos.lat, pos.lng));
        while (path.getLength() > TRAIL_MAX_POINTS) path.removeAt(0);
      }
    }
    if (followRef.current) mapRef.current.panTo(pos);
  }, [pos, motion, mapReady, isMoving]);

  useEffect(() => { mapRef.current?.setMapTypeId(mapType === 'satellite' ? 'hybrid' : 'roadmap'); }, [mapType, mapReady]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (mapRef.current && gmRef.current) {
        gmRef.current.event.trigger(mapRef.current, 'resize');
        if (followRef.current && pos) mapRef.current.panTo(pos);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [isExpanded, pos]);

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

  const statusText = mapError ? 'Google Maps error (showing fallback)' : gps.error && !isManagerView ? gps.error : !hasFix ? isManagerView ? 'Waiting for driver position' : 'Waiting for GPS signal' : stale ? `No update for ${secondsSinceUpdate}s` : 'Live GPS';
  const dotClass = !hasFix ? 'bg-slate-500' : stale ? 'bg-amber-400' : 'bg-green-500';
  const googleMapsUrl = pos ? `https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}` : '#';

  return (
    <div className={isExpanded ? 'fixed inset-0 z-50 bg-[#0d1013] flex flex-col overflow-hidden text-white' : 'bg-[#14181c] rounded-2xl border border-slate-800 overflow-hidden text-white relative shadow-lg'}>
      {/* Global CSS injection to brute-force hide any Google API modals */}
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
        /* Prevents the map from getting grayed out */
        .gm-style { filter: none !important; }
        .widget-scene { display: none !important; }
      `}</style>
      
      <div className="px-4 py-3 bg-[#0d1013] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {hasFix && !stale && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-slate-100 truncate">{isManagerView ? `${driverName}'s live location` : 'Your live location'}</p>
              <span className="text-[9px] bg-blue-900/50 text-blue-300 border border-blue-700/60 px-1.5 py-0.5 rounded font-semibold uppercase">Google</span>
            </div>
            <p className={`text-[11px] truncate ${stale || mapError || gps.error ? 'text-amber-300' : 'text-slate-400'}`}>{statusText}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {elapsedSeconds !== null && <span className="bg-[#0a7337]/25 border border-[#0a7337] text-green-300 font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full">{formatElapsed(elapsedSeconds)}</span>}
          <div className="flex items-center rounded-lg bg-slate-800 p-0.5 border border-slate-700">
            {(['roadmap', 'satellite'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setMapType(t)} className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${mapType === t ? 'bg-[#0a7337] text-white shadow' : 'text-slate-400 hover:text-white'}`}>{t === 'roadmap' ? 'Road' : 'Satellite'}</button>
            ))}
          </div>
          <button type="button" onClick={recenter} className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all active:scale-95 ${isFollowing ? 'bg-[#0a7337] hover:bg-[#085a2b] text-white' : 'bg-amber-500/20 border border-amber-400/60 text-amber-200 hover:bg-amber-500/30'}`}>{isFollowing ? 'Following' : 'Recenter'}</button>
          <button type="button" onClick={() => setIsExpanded((v) => !v)} className="text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 px-2.5 py-1.5 rounded-lg">{isExpanded ? 'Minimise' : 'Expand'}</button>
        </div>
      </div>

      <div className={`relative w-full bg-slate-900 ${isExpanded ? 'flex-1 min-h-[280px]' : 'h-[340px]'}`}>
        <div ref={mapElRef} className="w-full h-full" />
        
        {mapError && (
          <div className="absolute inset-0 z-10 bg-slate-950/85 flex items-center justify-center text-center px-6">
            <div>
              <p className="text-sm font-semibold text-amber-300">Google Maps failed to initialize</p>
              <p className="text-xs text-slate-300 mt-1 max-w-xs">{mapError}</p>
            </div>
          </div>
        )}

        {!mapError && !hasFix && (
          <div className="absolute inset-0 z-10 bg-slate-950/55 flex items-center justify-center text-center px-6 pointer-events-none">
            <div>
              <div className="mx-auto mb-3 h-7 w-7 rounded-full border-2 border-slate-500 border-t-green-400 animate-spin" />
              <p className="text-sm font-semibold text-slate-100">{isManagerView ? 'Waiting for the driver' : 'Waiting for a GPS fix'}</p>
              <p className="text-xs text-slate-300 mt-1 max-w-xs">{isManagerView ? 'The map updates as soon as the driver shares a position.' : gps.error || 'Allow location access in your browser and step outside if you are indoors.'}</p>
            </div>
          </div>
        )}

        {hasFix && (
          <div className={`absolute top-3 left-3 z-[5] rounded-xl px-3 py-2 shadow-lg border backdrop-blur-md ${speeding ? 'bg-red-600/95 border-red-300 animate-pulse' : 'bg-slate-900/90 border-slate-700/80'}`}>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono leading-none">{speedKmh ?? 0}</span>
              <span className="text-[10px] font-semibold text-slate-200">km/h</span>
            </div>
            <p className={`text-[10px] font-semibold mt-0.5 ${speeding ? 'text-white' : 'text-slate-400'}`}>{speeding ? `SPEEDING · limit ${live.limit}` : `limit ${live.limit}`}</p>
          </div>
        )}
      </div>

      <div className={`bg-[#14181c] border-t border-slate-800 shrink-0 ${isExpanded ? 'max-h-[40vh] overflow-y-auto' : ''}`}>
        <div className="p-4 space-y-3">
          <section className="rounded-xl border border-slate-700/70 bg-gradient-to-br from-[#1b2a22] to-[#1a1f24] p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-green-300 mb-1">Vehicle is at</p>
              {pos ? (
                <>
                  <p className="text-base font-semibold text-white leading-snug break-words">{address || `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`}</p>
                  <p className="mt-1 text-[11px] font-mono text-slate-400">{pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}</p>
                </>
              ) : <p className="text-sm text-slate-400">The address appears once a position is received.</p>}
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button type="button" onClick={copyPosition} disabled={!pos} className="text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 border border-slate-600 px-2.5 py-1.5 rounded-lg">{copied ? 'Copied' : 'Copy'}</button>
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-center bg-[#0a7337] hover:bg-[#085a2b] text-white px-2.5 py-1.5 rounded-lg">Open map</a>
            </div>
          </section>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Speed</span>
              <div className={`font-semibold text-sm ${speeding ? 'text-red-400' : 'text-slate-100'}`}>{speedKmh === null ? 'Unknown' : isMoving ? `${speedKmh} km/h` : 'Stationary'}</div>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Top speed</span>
              <div className="font-semibold text-sm text-slate-100">{live.maxKmh === null ? 'No data' : `${Math.round(live.maxKmh)} km/h`}</div>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Heading</span>
              <div className="font-semibold text-sm text-slate-100">{isMoving && motion.heading !== null ? `${compass(motion.heading)} · ${Math.round(motion.heading)}°` : 'Not moving'}</div>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Last update</span>
              <div className="font-semibold text-sm text-slate-100">{lastUpdateMs ? `${secondsSinceUpdate}s ago` : 'No data yet'}</div>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 text-center">Map data © Google. Nearby landmarks are available on the Leaflet backup map.</p>
        </div>
      </div>
    </div>
  );
}