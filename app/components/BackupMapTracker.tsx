// app/components/BackupMapTracker.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { updateTripLocation } from '@/app/actions/trip';

/* -------------------------------------------------------------------------- */
/*  Types & Interfaces                                                        */
/* -------------------------------------------------------------------------- */

type LngLat = [number, number]; // MapLibre takes [longitude, latitude]

interface BackupMapTrackerProps {
  tripId: number | string;
  currentLocation?: string | null;
  isManagerView?: boolean;
  driverName?: string;
  startedAt?: string | null;
  onSwitchBack?: () => void;
}

interface Motion {
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
}

interface AddressDetails {
  placeName?: string;
  street: string;
  area: string;
  postcode?: string;
  country?: string;
  full: string;
  precision: 'exact' | 'street' | 'area';
}

interface RawLandmark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  color: string;
}

interface Landmark extends RawLandmark {
  distance: number;
  bearing: number;
  direction: string;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/* -------------------------------------------------------------------------- */
/*  Constants & Geographic Helpers                                            */
/* -------------------------------------------------------------------------- */

// Default zoom matching regional/town corridor view
const DEFAULT_ZOOM = 12.2;
const LANDMARK_FOCUS_ZOOM = 13.5;

const DEFAULT_COORDS: LngLat = [5.7932, 5.5544]; // [lng, lat]
const LANDMARK_RADIUS_M = 1500;
const GEOCODE_MIN_MOVE_M = 25;
const LANDMARK_MIN_MOVE_M = 120;
const STALE_AFTER_SECONDS = 30;

const REGION_COORDS: Record<string, LngLat> = {
  effurun: [5.7932, 5.5544],
  warri: [5.75, 5.5174],
  lagos: [3.3792, 6.5244],
  apapa: [3.3582, 6.4474],
  ikeja: [3.3515, 6.6018],
  abuja: [7.3986, 9.0765],
  portharcourt: [7.0498, 4.8156],
  ibadan: [3.947, 7.3775],
  benin: [5.6037, 6.335],
};

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg: number) => DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function calcDistanceM(from: LngLat, to: LngLat): number {
  const R = 6371000;
  const dLat = toRad(to[1] - from[1]);
  const dLng = toRad(to[0] - from[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function calcBearingDeg(from: LngLat, to: LngLat): number {
  const dLng = toRad(to[0] - from[0]);
  const y = Math.sin(dLng) * Math.cos(toRad(to[1]));
  const x =
    Math.cos(toRad(from[1])) * Math.sin(toRad(to[1])) -
    Math.sin(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const formatDistance = (m: number) =>
  m < 1000 ? `${Math.max(1, Math.round(m / 5) * 5)} m` : `${(m / 1000).toFixed(1)} km`;

// Compact "time ago" so a long gap never prints something like "72874s"
const formatAgo = (s: number) => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function createGeoJSONCircle(center: LngLat, radiusMeters: number, points = 32) {
  const [lng, lat] = center;
  const coords: [number, number][] = [];
  const distanceX = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusMeters / 110540;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([lng + distanceX * Math.cos(theta), lat + distanceY * Math.sin(theta)]);
  }
  coords.push(coords[0]);

  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
    properties: {},
  };
}

/* ------------------------------- Parsing ---------------------------------- */

function parseLocation(raw?: string | null): { coords: LngLat; label: string; motion: Motion; hasFix: boolean; updatedAt: number | null } {
  const empty: Motion = { speed: null, heading: null, accuracy: null };
  if (!raw) return { coords: DEFAULT_COORDS, label: 'Waiting for GPS signal', motion: empty, hasFix: false, updatedAt: null };

  try {
    const parsed = JSON.parse(raw);
    if (parsed.lat && parsed.lng) {
      const lat = parseFloat(parsed.lat);
      const lng = parseFloat(parsed.lng);
      const ts = parsed.updatedAt ? new Date(parsed.updatedAt).getTime() : NaN;
      if (!isNaN(lat) && !isNaN(lng)) {
        return {
          coords: [lng, lat],
          label: parsed.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          motion: {
            speed: parsed.speed ?? null,
            heading: parsed.heading ?? null,
            accuracy: parsed.accuracy ?? null,
          },
          hasFix: true,
          updatedAt: isNaN(ts) ? null : ts,
        };
      }
    }
  } catch {
    // plain text fallback
  }

  const clean = raw.toLowerCase().replace(/\s+/g, '');
  for (const [k, c] of Object.entries(REGION_COORDS)) {
    if (clean.includes(k)) {
      return { coords: c, label: raw, motion: empty, hasFix: false, updatedAt: null };
    }
  }

  return { coords: DEFAULT_COORDS, label: raw, motion: empty, hasFix: false, updatedAt: null };
}

function categorizeLandmark(t: Record<string, string>): { label: string; color: string } | null {
  const amenity = t.amenity;
  if (['parking', 'bench', 'waste_basket', 'toilets', 'shelter'].includes(amenity)) return null;

  if (amenity === 'place_of_worship') return { label: 'Place of Worship', color: '#a78bfa' };
  if (['school', 'university', 'college'].includes(amenity)) return { label: 'School / Campus', color: '#60a5fa' };
  if (['hospital', 'clinic', 'pharmacy'].includes(amenity) || t.healthcare) return { label: 'Healthcare', color: '#f87171' };
  if (['restaurant', 'fast_food', 'cafe', 'bar'].includes(amenity)) return { label: 'Food & Dining', color: '#fb923c' };
  if (['bank', 'atm'].includes(amenity)) return { label: 'Bank / ATM', color: '#facc15' };
  if (amenity === 'fuel') return { label: 'Fuel Station', color: '#f472b6' };
  if (amenity === 'marketplace' || t.shop) return { label: 'Market / Commercial', color: '#34d399' };
  if (t.tourism || t.aeroway) return { label: 'Airport / Hotel', color: '#22d3ee' };
  if (['police', 'community_centre', 'post_office'].includes(amenity)) return { label: 'Public Service', color: '#94a3b8' };
  if (amenity) return { label: 'Landmark', color: '#cbd5e1' };
  return null;
}

/* ---------------------------------- Icons --------------------------------- */

function Icon({ children, size = 14, className = '' }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconPin = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
);
const IconCopy = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);
const IconCheck = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
);
const IconExternal = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </Icon>
);
const IconClock = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Icon>
);
const IconMaximize = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </Icon>
);
const IconMinimize = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
  </Icon>
);
const IconCrosshair = (p: { size?: number; className?: string }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="22" y1="12" x2="18" y2="12" />
    <line x1="6" y1="12" x2="2" y2="12" />
    <line x1="12" y1="6" x2="12" y2="2" />
    <line x1="12" y1="22" x2="12" y2="18" />
  </Icon>
);
const IconArrow = (p: { size?: number; className?: string; style?: React.CSSProperties }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={p.size ?? 12}
    height={p.size ?? 12}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={p.className}
    style={p.style}
    aria-hidden="true"
  >
    <polygon points="3 11 22 2 13 21 11 13 3 11" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export default function BackupMapTracker({
  tripId,
  currentLocation,
  isManagerView = false,
  driverName = 'Driver',
  startedAt = null,
  onSwitchBack,
}: BackupMapTrackerProps) {
  const initial = useMemo(() => parseLocation(currentLocation), []); // eslint-disable-line react-hooks/exhaustive-deps

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const vehicleMarkerRef = useRef<any>(null);
  const landmarkMarkersRef = useRef<Record<string, any>>({});
  const lastSentRef = useRef<number>(0);
  const lastGeocodeRef = useRef<LngLat | null>(null);
  const lastLandmarkRef = useRef<LngLat | null>(null);
  const followRef = useRef(true);
  const touchRef = useRef(false);
  const elapsedAnchorRef = useRef<{ seconds: number; perf: number } | null>(null);

  // States
  const [coords, setCoords] = useState<LngLat>(initial.coords);
  const [motion, setMotion] = useState<Motion>(initial.motion);
  const [hasFix, setHasFix] = useState(initial.hasFix);
  const [lastUpdateMs, setLastUpdateMs] = useState<number | null>(initial.updatedAt);
  const [isLibReady, setIsLibReady] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tripStart, setTripStart] = useState<string | null>(startedAt);

  // Addresses & Landmarks
  const [address, setAddress] = useState<AddressDetails | null>(null);
  const [rawLandmarks, setRawLandmarks] = useState<RawLandmark[]>([]);
  const [landmarkStatus, setLandmarkStatus] = useState<LoadStatus>('idle');
  const [activeStyle, setActiveStyle] = useState<'liberty' | 'bright'>('liberty');

  // The map is built inside an effect that must not re-run on every position change,
  // so it reads the latest values through refs.
  const coordsRef = useRef<LngLat>(coords);
  coordsRef.current = coords;
  const motionRef = useRef<Motion>(motion);
  motionRef.current = motion;
  const driverNameRef = useRef(driverName);
  driverNameRef.current = driverName;

  // Clock tick
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Elapsed trip time: server-measured when available, device clock as a fallback
  const elapsedSeconds = (() => {
    void now;
    const a = elapsedAnchorRef.current;
    if (a) return Math.max(0, Math.floor(a.seconds + (performance.now() - a.perf) / 1000));
    if (!tripStart) return null;
    const start = new Date(tripStart).getTime();
    if (isNaN(start)) return null;
    return Math.max(0, Math.floor((Date.now() - start) / 1000));
  })();

  const formatElapsed = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s` : `${pad(m)}m ${pad(sec)}s`;
  };

  /* ---------------------- Geocoding & Landmarks --------------------------- */

  const fetchAddress = useCallback(async ([lng, lat]: LngLat) => {
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();

      const street = data.locality || data.neighbourhood || 'Effurun';
      const city = data.city || data.localityInfo?.administrative?.[2]?.name || 'Effurun';
      const state = data.principalSubdivision || 'Delta';
      const country = data.countryName || 'Nigeria';
      const area = [city, state, country].filter(Boolean).join(', ');

      setAddress({
        placeName: data.locality || undefined,
        street,
        area,
        full: [street, area].filter(Boolean).join(', '),
        country,
        precision: data.locality ? 'exact' : 'area',
      });
    } catch {
      setAddress({
        street: 'Effurun',
        area: 'Effurun, Delta, Nigeria',
        full: 'Effurun, Effurun, Delta, Nigeria',
        precision: 'area',
      });
    }
  }, []);

  const fetchLandmarks = useCallback(async ([lng, lat]: LngLat) => {
    setLandmarkStatus('loading');
    const query = `[out:json][timeout:10];
(
  nwr(around:${LANDMARK_RADIUS_M},${lat},${lng})["name"]["amenity"];
  nwr(around:${LANDMARK_RADIUS_M},${lat},${lng})["name"]["shop"];
  nwr(around:${LANDMARK_RADIUS_M},${lat},${lng})["name"]["tourism"];
  nwr(around:${LANDMARK_RADIUS_M},${lat},${lng})["name"]["aeroway"];
  nwr(around:${LANDMARK_RADIUS_M},${lat},${lng})["name"]["healthcare"];
);
out center 40;`;

    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error();
      const json = await res.json();

      const seen = new Set<string>();
      const items: RawLandmark[] = [];

      for (const el of json.elements || []) {
        const tags = el.tags || {};
        const name = tags['name:en'] || tags.name;
        const eLat = el.lat ?? el.center?.lat;
        const eLng = el.lon ?? el.center?.lon;
        if (!name || eLat == null || eLng == null) continue;

        const cat = categorizeLandmark(tags);
        if (!cat) continue;

        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          id: `${el.type}-${el.id}`,
          name,
          lat: eLat,
          lng: eLng,
          category: cat.label,
          color: cat.color,
        });
      }

      setRawLandmarks(items);
      setLandmarkStatus('ready');
    } catch {
      setLandmarkStatus('error');
    }
  }, []);

  // Spatial calculations for nearby places
  const landmarks = useMemo<Landmark[]>(() => {
    return rawLandmarks
      .map((l) => {
        const dest: LngLat = [l.lng, l.lat];
        const dist = calcDistanceM(coords, dest);
        const bearing = calcBearingDeg(coords, dest);
        return { ...l, distance: dist, bearing, direction: compass(bearing) };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [rawLandmarks, coords]);

  /* ------------------------- MapLibre Setup ------------------------------- */

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ((window as any).maplibregl) {
      setIsLibReady(true);
      return;
    }

    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    let script = document.getElementById('maplibre-js') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'maplibre-js';
      script.src = 'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js';
      script.async = true;
      document.body.appendChild(script);
    }

    const onLoad = () => setIsLibReady(true);
    script.addEventListener('load', onLoad);
    return () => script?.removeEventListener('load', onLoad);
  }, []);

  // Build the map. Runs on library load and when the style changes, never on a position change.
  useEffect(() => {
    if (!isLibReady || !mapContainerRef.current) return;

    const maplibregl = (window as any).maplibregl;
    if (!maplibregl) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const styleUrl =
      activeStyle === 'liberty'
        ? 'https://tiles.openfreemap.org/styles/liberty'
        : 'https://tiles.openfreemap.org/styles/bright';

    const here = coordsRef.current;
    touchRef.current = Boolean(window.matchMedia?.('(pointer: coarse)').matches);

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: here,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      // Touch screens: one finger scrolls the page, two fingers move the map (until expanded)
      cooperativeGestures: touchRef.current,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    const el = document.createElement('div');
    el.className = 'vector-vehicle-marker';
    el.innerHTML = `
      <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:38px;height:38px;border-radius:50%;background:rgba(10,115,55,0.35);animation:vec-pulse 1.8s infinite;"></div>
        <div style="position:relative;width:20px;height:20px;border-radius:50%;background:#0a7337;border:3px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
          <div style="width:6px;height:6px;border-radius:50%;background:#4ade80;"></div>
        </div>
      </div>
    `;

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(here)
      .setPopup(
        new maplibregl.Popup({ offset: 15 }).setHTML(
          `<div style="color:#000;font-size:12px;font-weight:bold;">${escapeHtml(driverNameRef.current)}</div><div style="color:#666;font-size:11px;">TRP-${tripId}</div>`
        )
      )
      .addTo(map);

    map.on('dragstart', () => {
      followRef.current = false;
      setIsFollowing(false);
    });

    map.on('load', () => {
      const c = coordsRef.current;
      map.addSource('accuracy-area', {
        type: 'geojson',
        data: createGeoJSONCircle(c, motionRef.current.accuracy || 25),
      });

      map.addLayer({
        id: 'accuracy-fill',
        type: 'fill',
        source: 'accuracy-area',
        paint: { 'fill-color': '#0a7337', 'fill-opacity': 0.12 },
      });

      map.addLayer({
        id: 'accuracy-line',
        type: 'line',
        source: 'accuracy-area',
        paint: { 'line-color': '#0a7337', 'line-width': 1, 'line-opacity': 0.4 },
      });
    });

    mapRef.current = map;
    vehicleMarkerRef.current = marker;
    setIsMapReady(true);

    return () => {
      Object.values(landmarkMarkersRef.current).forEach((m: any) => m.remove());
      landmarkMarkersRef.current = {};
      map.remove();
      mapRef.current = null;
      vehicleMarkerRef.current = null;
      setIsMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLibReady, activeStyle]);

  // Move the vehicle marker and accuracy ring without touching the zoom
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !vehicleMarkerRef.current) return;

    vehicleMarkerRef.current.setLngLat(coords);

    if (followRef.current) {
      mapRef.current.easeTo({ center: coords, duration: 600 });
    }

    try {
      const source = mapRef.current.getSource('accuracy-area');
      if (source) source.setData(createGeoJSONCircle(coords, motion.accuracy || 25));
    } catch {
      /* style still loading */
    }

    if (!lastGeocodeRef.current || calcDistanceM(lastGeocodeRef.current, coords) > GEOCODE_MIN_MOVE_M) {
      lastGeocodeRef.current = coords;
      fetchAddress(coords);
    }
    if (!lastLandmarkRef.current || calcDistanceM(lastLandmarkRef.current, coords) > LANDMARK_MIN_MOVE_M) {
      lastLandmarkRef.current = coords;
      fetchLandmarks(coords);
    }
  }, [coords, motion.accuracy, isMapReady, fetchAddress, fetchLandmarks]);

  // Plot landmark pins (also re-plots them after the map style changes)
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = (window as any).maplibregl;
    if (!isMapReady || !map || !maplibregl) return;

    Object.values(landmarkMarkersRef.current).forEach((m: any) => m.remove());
    landmarkMarkersRef.current = {};

    rawLandmarks.forEach((l) => {
      const pinEl = document.createElement('div');
      pinEl.className = 'landmark-marker-pin';
      pinEl.style.cursor = 'pointer';
      pinEl.innerHTML = `
        <div style="background:${l.color};width:13px;height:13px;border-radius:50%;border:2px solid #ffffff;box-shadow:0 2px 5px rgba(0,0,0,0.4);transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.35)'" onmouseout="this.style.transform='scale(1)'"></div>
      `;

      const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(`
        <div style="color:#0f172a;font-family:sans-serif;padding:2px;">
          <div style="font-weight:bold;font-size:12px;">${escapeHtml(l.name)}</div>
          <div style="color:#64748b;font-size:10px;text-transform:uppercase;margin-top:2px;">${escapeHtml(l.category)}</div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: pinEl })
        .setLngLat([l.lng, l.lat])
        .setPopup(popup)
        .addTo(map);

      landmarkMarkersRef.current[l.id] = marker;
    });
  }, [rawLandmarks, isMapReady]);

  /* ---------------------------- Responsiveness ---------------------------- */

  // MapLibre only listens to window resizes. This also covers rotation, the sidebar, and Expand.
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!isMapReady || !el || typeof ResizeObserver === 'undefined') return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => mapRef.current?.resize());
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [isMapReady]);

  // Touch screens: two-finger gestures while collapsed, all gestures once expanded
  useEffect(() => {
    const map = mapRef.current;
    if (!isMapReady || !map || !touchRef.current) return;
    const cg = map.cooperativeGestures;
    if (!cg) return;
    try {
      if (isExpanded) cg.disable();
      else cg.enable();
    } catch {
      /* older MapLibre builds */
    }
  }, [isExpanded, isMapReady]);

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

  /* ------------------ Manager: follow the trip live ----------------------- */
  // Before, the manager's backup map never updated after it first loaded.

  useEffect(() => {
    let cancelled = false;

    const poll = async (force = false) => {
      if (document.hidden && !force) return;

      const sentAt = performance.now();
      let trip: any = null;
      try {
        const res = await fetch(`/api/trips/${tripId}/live`, { cache: 'no-store' });
        if (res.ok) trip = await res.json();
      } catch {
        /* network blip */
      }
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

      if (!isManagerView || !trip.live || !trip.current_location) return;

      const p = parseLocation(trip.current_location);
      if (!p.hasFix) return;

      setCoords((prev) => (prev[0] === p.coords[0] && prev[1] === p.coords[1] ? prev : p.coords));
      setMotion(p.motion);
      setHasFix(true);
      setLastUpdateMs(
        typeof trip.location_age_seconds === 'number'
          ? Date.now() - trip.location_age_seconds * 1000
          : p.updatedAt ?? Date.now()
      );
    };

    poll(true);
    const id = setInterval(() => poll(), 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tripId, isManagerView]);

  /* ----------------------- Driver GPS watcher ----------------------------- */

  useEffect(() => {
    if (isManagerView || typeof navigator === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next: LngLat = [pos.coords.longitude, pos.coords.latitude];
        const m: Motion = {
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          accuracy: pos.coords.accuracy,
        };

        setCoords(next);
        setMotion(m);
        setHasFix(true);
        setLastUpdateMs(Date.now());

        const nowMs = Date.now();
        if (nowMs - lastSentRef.current >= 3000) {
          lastSentRef.current = nowMs;
          const payload = JSON.stringify({
            lat: next[1],
            lng: next[0],
            speed: m.speed,
            heading: m.heading,
            accuracy: m.accuracy,
            updatedAt: new Date(nowMs).toISOString(),
          });
          updateTripLocation(tripId, payload);
        }
      },
      (err) => console.warn('GPS watcher error:', err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [tripId, isManagerView]);

  /* -------------------------------- Actions ------------------------------- */

  // Recenter always returns to the configured zoom
  const recenter = () => {
    followRef.current = true;
    setIsFollowing(true);
    mapRef.current?.easeTo({ center: coords, zoom: DEFAULT_ZOOM, duration: 600 });
  };

  // Fly to landmark with a balanced focus zoom
  const focusLandmark = (l: Landmark) => {
    followRef.current = false;
    setIsFollowing(false);
    mapRef.current?.flyTo({ center: [l.lng, l.lat], zoom: LANDMARK_FOCUS_ZOOM, duration: 800 });
    setTimeout(() => {
      landmarkMarkersRef.current[l.id]?.togglePopup();
    }, 850);
  };

  const copyAddress = async () => {
    const text = `${address?.full || ''}\nLat ${coords[1].toFixed(6)}, Lng ${coords[0].toFixed(6)}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  /* ------------------------------ Derived values -------------------------- */

  const speedKmh = motion.speed ? Math.round(motion.speed * 3.6) : 0;
  const isMoving = speedKmh > 3;
  const secondsSinceUpdate = lastUpdateMs ? Math.max(0, Math.floor((now - lastUpdateMs) / 1000)) : null;
  const isStale = secondsSinceUpdate !== null && secondsSinceUpdate > STALE_AFTER_SECONDS;

  const nearest = landmarks[0];
  const proximitySummary = nearest
    ? nearest.distance <= 40
      ? `Right beside ${nearest.name}`
      : `${nearest.name} is ${formatDistance(nearest.distance)} ${nearest.direction} of the vehicle`
    : null;

  const statusText = !hasFix
    ? 'Waiting for GPS'
    : isStale
    ? `Delayed (${formatAgo(secondsSinceUpdate ?? 0)} ago)`
    : 'Live High-Res Vector';

  /* ---------------------------------- UI ---------------------------------- */

  return (
    <div
      className={
        isExpanded
          ? 'map-dark-scope fixed inset-0 z-50 bg-[#0d1013] flex flex-col overflow-hidden text-white pb-[env(safe-area-inset-bottom)]'
          : 'map-dark-scope bg-[#14181c] rounded-2xl border border-slate-800 overflow-hidden text-white relative shadow-lg w-full max-w-full'
      }
    >
      <style>{`
        @keyframes vec-pulse { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(1.6); opacity: 0; } }
        .vector-vehicle-marker { background: transparent; }
        @media (max-width: 639px) {
          .maplibregl-ctrl-attrib { font-size: 9px; }
        }
      `}</style>

      {/* Header: two rows on phones, one row from sm up */}
      <div
        className={`px-3 sm:px-4 py-3 bg-[#0d1013] border-b border-slate-800 shrink-0 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
          isExpanded ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {hasFix && !isStale && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              )}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${!hasFix ? 'bg-slate-500' : isStale ? 'bg-amber-400' : 'bg-blue-500'}`} />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-100 truncate">
                  {isManagerView ? `${driverName}'s location` : 'Your location'}
                </span>
                <span className="hidden min-[420px]:inline text-[9px] bg-blue-900/50 text-blue-300 border border-blue-700/60 px-1.5 py-0.5 rounded font-semibold uppercase shrink-0">
                  MapLibre
                </span>
              </div>
              <p className={`text-[11px] leading-snug ${isStale ? 'text-amber-300' : 'text-slate-400'}`}>{statusText}</p>
            </div>
          </div>

          {elapsedSeconds !== null && (
            <span className="sm:hidden shrink-0 text-[11px] bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full text-emerald-400 font-mono flex items-center gap-1.5 whitespace-nowrap">
              <IconClock size={12} />
              {formatElapsed(elapsedSeconds)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {elapsedSeconds !== null && (
            <span className="hidden sm:flex shrink-0 text-[11px] bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-full text-emerald-400 font-mono items-center gap-1.5 whitespace-nowrap">
              <IconClock size={12} />
              {formatElapsed(elapsedSeconds)}
            </span>
          )}

          {/* Style selector */}
          <div className="flex flex-1 sm:flex-none items-center rounded-lg bg-slate-800 p-0.5 border border-slate-700 min-w-0">
            <button
              type="button"
              onClick={() => setActiveStyle('liberty')}
              className={`flex-1 sm:flex-none px-3 sm:px-2.5 py-2 sm:py-1 text-[11px] font-semibold rounded-md transition-all ${
                activeStyle === 'liberty' ? 'bg-[#0a7337] text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Liberty
            </button>
            <button
              type="button"
              onClick={() => setActiveStyle('bright')}
              className={`flex-1 sm:flex-none px-3 sm:px-2.5 py-2 sm:py-1 text-[11px] font-semibold rounded-md transition-all ${
                activeStyle === 'bright' ? 'bg-[#0a7337] text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Bright
            </button>
          </div>

          {onSwitchBack && (
            <button
              type="button"
              onClick={onSwitchBack}
              className="hidden min-[480px]:block shrink-0 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-all active:scale-95"
            >
              Primary
            </button>
          )}

          <button
            type="button"
            onClick={recenter}
            className={`shrink-0 text-[11px] font-semibold px-3 py-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-all flex items-center gap-1.5 active:scale-95 ${
              isFollowing ? 'bg-[#0a7337] text-white' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
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

      {/* Map surface */}
      <div
        className={`relative w-full bg-slate-900 ${
          isExpanded
            ? 'flex-1 min-h-[240px]'
            : 'h-[52dvh] min-h-[280px] max-h-[520px] sm:h-[380px] sm:max-h-none lg:h-[440px]'
        }`}
      >
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {!hasFix && (
          <div className="absolute inset-0 z-10 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center text-center px-4 pointer-events-none">
            <div className="space-y-2">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-300">
                {isManagerView ? 'Waiting for the driver to share a position...' : 'Searching for high-accuracy GPS coordinates...'}
              </p>
            </div>
          </div>
        )}

        {/* Floating metrics */}
        <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-2.5 py-1 rounded-lg text-[11px] sm:text-xs shadow flex items-center gap-2 pointer-events-none">
          <span className="text-slate-400">Speed:</span>
          <span className="font-bold text-white font-mono">{speedKmh} km/h</span>
          {motion.accuracy ? (
            <span className="text-[10px] text-slate-400 border-l border-slate-700 pl-2">±{Math.round(motion.accuracy)}m</span>
          ) : null}
        </div>

        <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3 py-2 rounded-xl text-xs max-w-[calc(100%-4.75rem)] shadow-lg pointer-events-none">
          <span className="block text-[10px] text-slate-400 uppercase tracking-wide">Vehicle Position</span>
          <p className="font-semibold text-slate-100 truncate text-[13px] sm:text-sm mt-0.5">
            {address?.street || 'Locating...'}
          </p>
        </div>
      </div>

      {/* Details & landmarks */}
      <div
        className={`bg-[#14181c] border-t border-slate-800 shrink-0 ${
          isExpanded ? 'max-h-[44dvh] sm:max-h-[48vh] overflow-y-auto overscroll-contain' : ''
        }`}
      >
        <div className="p-3 sm:p-4 space-y-3">
          {/* Address card */}
          <section className="rounded-xl border border-slate-700/70 bg-gradient-to-br from-[#17202a] to-[#14181c] p-3.5 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-300 whitespace-nowrap">
                    <IconPin size={13} />
                    Verified Vector Address
                  </span>
                  <span className="text-[10px] font-medium border border-blue-500/40 bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full">
                    {address?.precision === 'exact' ? 'Exact Match' : 'Area Match'}
                  </span>
                </div>

                <p className="text-base sm:text-lg font-semibold text-white leading-snug break-words">
                  {address?.street || 'Locating...'}
                </p>
                {address?.area && <p className="text-[13px] sm:text-sm text-slate-300 mt-0.5 break-words">{address.area}</p>}

                <p className="mt-2 pt-2 border-t border-slate-700/60 text-[10px] sm:text-[11px] font-mono text-slate-400 flex flex-wrap gap-x-4">
                  <span>Lat {coords[1].toFixed(6)}</span>
                  <span>Lng {coords[0].toFixed(6)}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2 sm:gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={copyAddress}
                  disabled={!hasFix}
                  className="text-xs sm:text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 border border-slate-600 px-3 py-2.5 sm:px-2.5 sm:py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  {copied ? <IconCheck size={13} className="text-green-400" /> : <IconCopy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${coords[1]},${coords[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-[11px] font-semibold bg-[#0a7337] hover:bg-[#085a2b] text-white px-3 py-2.5 sm:px-2.5 sm:py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 active:scale-95 whitespace-nowrap"
                >
                  <IconExternal size={13} />
                  Google App
                </a>
              </div>
            </div>
          </section>

          {/* Movement stats: two columns on phones, three from sm up */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800 min-w-0">
              <span className="block text-xs text-slate-400 mb-1">Transit Status</span>
              <div className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isMoving ? 'bg-green-500 animate-pulse' : 'bg-amber-400'} shrink-0`} />
                <span className="truncate">{isMoving ? `${speedKmh} km/h` : 'Stationary'}</span>
              </div>
            </div>

            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800 min-w-0">
              <span className="block text-xs text-slate-400 mb-1">Direction</span>
              <div className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                {motion.heading !== null && !isNaN(motion.heading) && isMoving ? (
                  <>
                    <IconArrow
                      size={11}
                      className="text-blue-400 shrink-0"
                      style={{ transform: `rotate(${motion.heading - 45}deg)` }}
                    />
                    {compass(motion.heading)}
                  </>
                ) : (
                  <span className="text-slate-400 font-medium">-</span>
                )}
              </div>
            </div>

            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800 min-w-0 col-span-2 sm:col-span-1">
              <span className="block text-xs text-slate-400 mb-1">Heartbeat</span>
              <div className="font-semibold text-slate-100 text-sm">
                {lastUpdateMs ? `${formatAgo(secondsSinceUpdate ?? 0)} ago` : 'Waiting for fix'}
              </div>
            </div>
          </div>

          {/* Landmarks */}
          <section className="rounded-xl border border-slate-800 bg-[#1a1f24] p-3.5 sm:p-4">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h4 className="text-sm font-semibold text-slate-100">Nearby Landmarks &amp; POIs</h4>
              <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">Within {LANDMARK_RADIUS_M} m</span>
            </div>

            {proximitySummary && (
              <p className="text-xs text-blue-300 mb-3 leading-relaxed break-words flex items-start gap-1.5">
                <IconPin size={12} className="mt-0.5 shrink-0" />
                <span>{proximitySummary}</span>
              </p>
            )}

            {landmarks.length > 0 ? (
              <ul className="divide-y divide-slate-800/80">
                {landmarks.map((l, i) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => focusLandmark(l)}
                      className="w-full flex items-center gap-3 py-3 sm:py-2.5 text-left hover:bg-slate-800/60 rounded-lg px-2 -mx-2 transition-colors group"
                      title="Fly to landmark on map"
                    >
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-100 group-hover:text-blue-300 truncate">
                          {l.name}
                          {i === 0 && (
                            <span className="ml-2 text-[10px] font-medium text-blue-300 bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.5 rounded-full align-middle">
                              Nearest
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-slate-400 truncate">{l.category}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold text-slate-100">{formatDistance(l.distance)}</span>
                        <span className="flex items-center justify-end gap-1 text-[11px] text-slate-400">
                          <IconArrow size={10} style={{ transform: `rotate(${l.bearing - 45}deg)` }} />
                          {l.direction}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : landmarkStatus === 'loading' ? (
              <div className="space-y-2 py-2 animate-pulse">
                <div className="h-4 bg-slate-700/50 rounded w-3/4" />
                <div className="h-4 bg-slate-700/50 rounded w-1/2" />
              </div>
            ) : landmarkStatus === 'error' ? (
              <p className="text-xs text-amber-300 py-2">Could not load nearby landmarks. Retrying shortly.</p>
            ) : (
              <p className="text-xs text-slate-400 py-2">
                No indexed landmarks found within {LANDMARK_RADIUS_M} m of this location.
              </p>
            )}
          </section>

          <p className="text-[10px] text-slate-500 text-center pb-1">
            Map data © OpenStreetMap contributors · OpenFreeMap
          </p>
        </div>
      </div>
    </div>
  );
}