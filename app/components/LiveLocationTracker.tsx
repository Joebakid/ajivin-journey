'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*  Server calls                                                              */
/* -------------------------------------------------------------------------- */

interface TripLive {
  live: boolean;
  status: string | null;
  started_at: string | null;
  current_location: string | null;
}

async function fetchTripLive(tripId: number | string): Promise<TripLive | null> {
  try {
    const res = await fetch(`/api/trips/${tripId}/live`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as TripLive;
  } catch {
    return null;
  }
}

function pushLocation(tripId: number | string, payload: string) {
  fetch(`/api/trips/${tripId}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: payload }),
    keepalive: true,
  }).catch(() => {});
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type LatLng = [number, number];

interface LiveLocationTrackerProps {
  tripId: number | string;
  currentLocation?: string | null;
  isManagerView?: boolean;
  driverName?: string;
  startedAt?: string | null;
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
type MapProviderType = 'osm' | 'satellite' | 'carto';

declare global {
  interface Window {
    L: any;
  }
}

/* -------------------------------------------------------------------------- */
/*  Constants & helpers                                                       */
/* -------------------------------------------------------------------------- */

// Regional zoom level to keep town and district names clearly visible
const DEFAULT_ZOOM = 13;
const LANDMARK_FOCUS_ZOOM = 14.5;

const DEFAULT_COORDS: LatLng = [5.5544, 5.7932];
const LANDMARK_RADIUS_M = 1500;
const GEOCODE_MIN_MOVE_M = 25;
const LANDMARK_MIN_MOVE_M = 120;
const STALE_AFTER_SECONDS = 30;

const REGION_COORDS: Record<string, LatLng> = {
  effurun: [5.5544, 5.7932],
  warri: [5.5174, 5.75],
  lagos: [6.5244, 3.3792],
  apapa: [6.4474, 3.3582],
  ikeja: [6.6018, 3.3515],
  abuja: [9.0765, 7.3986],
  portharcourt: [4.8156, 7.0498],
  ibadan: [7.3775, 3.947],
  benin: [6.335, 5.6037],
};

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg: number) => DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg(a: LatLng, b: LatLng): number {
  const dLng = toRad(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(toRad(b[0]));
  const x =
    Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) -
    Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const formatDistance = (m: number) =>
  m < 1000 ? `${Math.max(1, Math.round(m / 5) * 5)} m` : `${(m / 1000).toFixed(1)} km`;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const uniq = (items: (string | undefined | null)[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    if (!i) continue;
    const k = i.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(i.trim());
  }
  return out;
};

/* ----------------------------- Stored location ---------------------------- */

function parseRawLocation(rawLocation?: string | null): {
  coords: LatLng;
  label: string;
  hasFix: boolean;
  motion: Motion;
  updatedAt: number | null;
} {
  const empty: Motion = { speed: null, heading: null, accuracy: null };

  if (!rawLocation) {
    return { coords: DEFAULT_COORDS, label: 'Waiting for GPS signal', hasFix: false, motion: empty, updatedAt: null };
  }

  try {
    const parsed = JSON.parse(rawLocation);
    if (parsed.lat && parsed.lng) {
      const lat = parseFloat(parsed.lat);
      const lng = parseFloat(parsed.lng);
      const ts = parsed.updatedAt ? new Date(parsed.updatedAt).getTime() : NaN;
      return {
        coords: [lat, lng],
        label: parsed.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        hasFix: true,
        motion: {
          speed: parsed.speed ?? null,
          heading: parsed.heading ?? null,
          accuracy: parsed.accuracy ?? null,
        },
        updatedAt: isNaN(ts) ? null : ts,
      };
    }
  } catch {
    // plain text fallback
  }

  const clean = rawLocation.toLowerCase().replace(/\s+/g, '');
  for (const [key, coords] of Object.entries(REGION_COORDS)) {
    if (clean.includes(key)) {
      return { coords, label: rawLocation, hasFix: false, motion: empty, updatedAt: null };
    }
  }
  return { coords: DEFAULT_COORDS, label: rawLocation, hasFix: false, motion: empty, updatedAt: null };
}

/* ------------------------------- Geocoding -------------------------------- */

function buildAddress(data: any): AddressDetails | null {
  if (!data || !data.address) return null;
  const a = data.address;

  const houseNumber: string | undefined = a.house_number;
  const road: string | undefined = a.road || a.pedestrian || a.footway || a.path || a.residential;
  const rawName: string | undefined = data.namedetails?.['name:en'] || data.namedetails?.name || data.name || undefined;
  const placeName = rawName && rawName !== road ? rawName : undefined;

  const city = a.city || a.town || a.village || a.municipality;
  const lga = a.county || a.state_district;

  const streetLine = [houseNumber, road].filter(Boolean).join(' ');
  const areaParts = uniq([a.neighbourhood, a.suburb, a.quarter, a.city_district, city, lga, a.state]);

  const full =
    uniq([placeName, streetLine, ...areaParts, a.postcode, a.country]).join(', ') || data.display_name || '';

  return {
    placeName,
    street: streetLine || placeName || 'Effurun',
    area: areaParts.join(', '),
    postcode: a.postcode,
    country: a.country,
    full,
    precision: houseNumber ? 'exact' : road ? 'street' : 'area',
  };
}

/* -------------------------------- Landmarks ------------------------------- */

const JUNK_AMENITY = new Set([
  'parking', 'parking_space', 'parking_entrance', 'bench', 'shelter', 'toilets', 'waste_basket',
  'bicycle_parking', 'vending_machine', 'post_box', 'drinking_water', 'waste_disposal', 'recycling',
  'motorcycle_parking', 'taxi', 'telephone', 'lounger',
]);

function categorize(t: Record<string, string>): { label: string; color: string } | null {
  const amenity = t.amenity;
  if (amenity && JUNK_AMENITY.has(amenity)) return null;

  if (amenity === 'place_of_worship') return { label: 'Place of worship', color: '#a78bfa' };
  if (['school', 'university', 'college', 'kindergarten'].includes(amenity)) return { label: 'School', color: '#60a5fa' };
  if (['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy'].includes(amenity) || t.healthcare)
    return { label: 'Health', color: '#f87171' };
  if (['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'food_court'].includes(amenity))
    return { label: 'Food and drink', color: '#fb923c' };
  if (['bank', 'atm', 'bureau_de_change'].includes(amenity)) return { label: 'Bank / ATM', color: '#facc15' };
  if (amenity === 'fuel') return { label: 'Fuel station', color: '#f472b6' };
  if (amenity === 'marketplace' || t.shop) return { label: 'Shop / market', color: '#34d399' };
  if (t.tourism || t.aeroway) return { label: 'Hotel / Airport', color: '#22d3ee' };
  if (['police', 'townhall', 'courthouse', 'post_office', 'fire_station', 'community_centre'].includes(amenity))
    return { label: 'Public service', color: '#94a3b8' };
  if (['bus_station', 'ferry_terminal'].includes(amenity) || t.public_transport)
    return { label: 'Transport', color: '#818cf8' };
  if (t.office) return { label: 'Office', color: '#94a3b8' };
  if (t.leisure) return { label: 'Leisure', color: '#4ade80' };
  if (t.historic) return { label: 'Historic site', color: '#d6a56b' };
  if (amenity) return { label: 'Landmark', color: '#cbd5e1' };
  return null;
}

function buildOverpassQuery(lat: number, lng: number) {
  const around = `(around:${LANDMARK_RADIUS_M},${lat},${lng})`;
  return `[out:json][timeout:12];
(
  nwr${around}["name"]["amenity"];
  nwr${around}["name"]["shop"];
  nwr${around}["name"]["tourism"];
  nwr${around}["name"]["aeroway"];
  nwr${around}["name"]["historic"];
  nwr${around}["name"]["leisure"];
  nwr${around}["name"]["healthcare"];
);
out center 60;`;
}

function parseLandmarks(elements: any[]): RawLandmark[] {
  const seen = new Set<string>();
  const out: RawLandmark[] = [];
  for (const el of elements || []) {
    const tags = el.tags || {};
    const name: string | undefined = tags['name:en'] || tags.name;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || lat == null || lng == null) continue;
    const cat = categorize(tags);
    if (!cat) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `${el.type}-${el.id}`, name, lat, lng, category: cat.label, color: cat.color });
  }
  return out;
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
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function LiveLocationTracker({
  tripId,
  currentLocation,
  isManagerView = false,
  driverName = 'Driver',
  startedAt = null,
}: LiveLocationTrackerProps) {
  const initial = useMemo(() => parseRawLocation(currentLocation), [currentLocation]);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null);
  const landmarkLayerRef = useRef<any>(null);
  const landmarkMarkersRef = useRef<Record<string, any>>({});
  const activeTileLayerRef = useRef<any>(null);

  // Data-fetching refs
  const followRef = useRef(true);
  const coordsRef = useRef<LatLng>(initial.coords);
  const lastGeocodeRef = useRef<LatLng | null>(null);
  const lastLandmarkFetchRef = useRef<LatLng | null>(null);
  const addressAbortRef = useRef<AbortController | null>(null);
  const landmarkAbortRef = useRef<AbortController | null>(null);
  const lastSentRef = useRef(0);

  // State
  const [coords, setCoords] = useState<LatLng>(initial.coords);
  const [hasFix, setHasFix] = useState(initial.hasFix);
  const [motion, setMotion] = useState<Motion>(initial.motion);
  const [lastUpdateMs, setLastUpdateMs] = useState<number | null>(initial.updatedAt ?? (initial.hasFix ? Date.now() : null));

  const [address, setAddress] = useState<AddressDetails | null>(null);
  const [addressStatus, setAddressStatus] = useState<LoadStatus>('idle');
  const [rawLandmarks, setRawLandmarks] = useState<RawLandmark[]>([]);
  const [landmarkStatus, setLandmarkStatus] = useState<LoadStatus>('idle');

  const [isLeafletReady, setIsLeafletReady] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [copied, setCopied] = useState(false);
  const [mapProvider, setMapProvider] = useState<MapProviderType>('osm');

  const [tripStartTime, setTripStartTime] = useState<string | null>(startedAt);
  const [now, setNow] = useState(() => Date.now());

  const [tripLive, setTripLive] = useState<boolean | null>(isManagerView ? null : true);
  const hidden = isManagerView && tripLive !== true;

  /* ------------------------------ Clock tick ------------------------------ */

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  const elapsedSeconds = useMemo(() => {
    if (!tripStartTime) return null;
    const start = new Date(tripStartTime).getTime();
    if (isNaN(start)) return null;
    return Math.max(0, Math.floor((now - start) / 1000));
  }, [tripStartTime, now]);

  const formatElapsed = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s` : `${pad(m)}m ${pad(sec)}s`;
  };

  /* ----------------------------- Apply new fix ---------------------------- */

  const applyFix = useCallback((next: LatLng, m: Motion, updatedAt?: number | null) => {
    setCoords((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next));
    setMotion(m);
    setHasFix(true);
    setLastUpdateMs(updatedAt ?? Date.now());
  }, []);

  /* ----------------------------- Reverse geocode -------------------------- */

  const fetchAddress = useCallback(async (pos: LatLng) => {
    addressAbortRef.current?.abort();
    const ctrl = new AbortController();
    addressAbortRef.current = ctrl;
    setAddressStatus((s) => (s === 'ready' ? s : 'loading'));

    try {
      const url =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&namedetails=1` +
        `&zoom=18&accept-language=en&lat=${pos[0]}&lon=${pos[1]}`;
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('primary geocode failed');
      const parsed = buildAddress(await res.json());
      if (!parsed) throw new Error('no address');
      setAddress(parsed);
      setAddressStatus('ready');
    } catch (e: any) {
      if (e?.name === 'AbortError') return;

      // Reliable fallback: BigDataCloud
      try {
        const fallbackRes = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos[0]}&longitude=${pos[1]}&localityLanguage=en`,
          { signal: ctrl.signal }
        );
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          const street = data.locality || data.neighbourhood || 'Effurun';
          const area = [data.city, data.principalSubdivision, data.countryName].filter(Boolean).join(', ');
          setAddress({
            street,
            area,
            full: [street, area].filter(Boolean).join(', '),
            precision: 'area',
          });
          setAddressStatus('ready');
          return;
        }
      } catch {
        // fallback failed
      }

      lastGeocodeRef.current = null;
      setAddressStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, []);

  /* ------------------------------ Nearby places --------------------------- */

  const fetchLandmarks = useCallback(async (pos: LatLng) => {
    landmarkAbortRef.current?.abort();
    const ctrl = new AbortController();
    landmarkAbortRef.current = ctrl;
    setLandmarkStatus((s) => (s === 'ready' ? s : 'loading'));
    const timeout = setTimeout(() => ctrl.abort(), 14000);

    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(buildOverpassQuery(pos[0], pos[1]))}`,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('overpass failed');
      const json = await res.json();
      setRawLandmarks(parseLandmarks(json.elements));
      setLandmarkStatus('ready');
    } catch {
      setLandmarkStatus((s) => (s === 'ready' ? s : 'error'));
      setTimeout(() => {
        lastLandmarkFetchRef.current = null;
      }, 15000);
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (!hasFix || hidden) return;

    const tick = () => {
      const here = coordsRef.current;
      if (!lastGeocodeRef.current || distanceM(lastGeocodeRef.current, here) > GEOCODE_MIN_MOVE_M) {
        lastGeocodeRef.current = here;
        fetchAddress(here);
      }
      if (!lastLandmarkFetchRef.current || distanceM(lastLandmarkFetchRef.current, here) > LANDMARK_MIN_MOVE_M) {
        lastLandmarkFetchRef.current = here;
        fetchLandmarks(here);
      }
    };

    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [hasFix, hidden, fetchAddress, fetchLandmarks]);

  useEffect(
    () => () => {
      addressAbortRef.current?.abort();
      landmarkAbortRef.current?.abort();
    },
    []
  );

  const landmarks = useMemo<Landmark[]>(() => {
    return rawLandmarks
      .map((l) => {
        const to: LatLng = [l.lat, l.lng];
        const bearing = bearingDeg(coords, to);
        return { ...l, distance: distanceM(coords, to), bearing, direction: compass(bearing) };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [rawLandmarks, coords]);

  /* ------------------------------ Leaflet setup --------------------------- */

  useEffect(() => {
    if (window.L) {
      setIsLeafletReady(true);
      return;
    }

    let script = document.querySelector<HTMLScriptElement>('script[data-leaflet]');
    if (!script) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);

      script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.dataset.leaflet = '1';
      document.body.appendChild(script);
    }
    const onLoad = () => setIsLeafletReady(true);
    script.addEventListener('load', onLoad);
    return () => script?.removeEventListener('load', onLoad);
  }, []);

  const setTileLayer = useCallback((provider: MapProviderType) => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    if (activeTileLayerRef.current) {
      map.removeLayer(activeTileLayerRef.current);
    }

    let layer: any;
    if (provider === 'satellite') {
      layer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
      );
    } else if (provider === 'carto') {
      const apiKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
      layer = L.tileLayer(
        `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${apiKey ? `?key=${apiKey}` : ''}`,
        { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19, subdomains: 'abcd' }
      );
    } else {
      layer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      });
    }

    layer.addTo(map);
    activeTileLayerRef.current = layer;
    setMapProvider(provider);
  }, []);

  useEffect(() => {
    if (hidden || !isLeafletReady || !mapContainerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
    if (mapContainerRef.current) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    const L = window.L;
    if (!L) return;

    // Initialized at DEFAULT_ZOOM (13) to display regional city/place labels
    const map = L.map(mapContainerRef.current, {
      center: coordsRef.current,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });

    mapRef.current = map;
    setTileLayer(mapProvider);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const vehicleIcon = L.divIcon({
      className: 'custom-vehicle-marker',
      html: `
        <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
          <div class="lj-pulse" style="position:absolute;width:38px;height:38px;border-radius:50%;background:rgba(10,115,55,.35);"></div>
          <div style="position:relative;width:20px;height:20px;border-radius:50%;background:#0a7337;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;">
            <div style="width:6px;height:6px;border-radius:50%;background:#4ade80;"></div>
          </div>
        </div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    const marker = L.marker(coordsRef.current, { icon: vehicleIcon, zIndexOffset: 1000 }).addTo(map);
    marker.bindPopup(`<b>${escapeHtml(driverName)}</b><br/>TRP-${tripId}`);

    accuracyCircleRef.current = L.circle(coordsRef.current, {
      radius: 0,
      color: '#0a7337',
      weight: 1,
      fillColor: '#0a7337',
      fillOpacity: 0.12,
    }).addTo(map);

    landmarkLayerRef.current = L.layerGroup().addTo(map);

    map.on('dragstart', () => {
      followRef.current = false;
      setIsFollowing(false);
    });

    markerRef.current = marker;
    setIsMapReady(true);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      if (mapContainerRef.current) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
      markerRef.current = null;
      accuracyCircleRef.current = null;
      landmarkLayerRef.current = null;
      landmarkMarkersRef.current = {};
      activeTileLayerRef.current = null;
      setIsMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeafletReady, hidden]);

  useEffect(() => {
    if (!isMapReady || !markerRef.current || !mapRef.current) return;
    markerRef.current.setLatLng(coords);
    accuracyCircleRef.current?.setLatLng(coords);
    accuracyCircleRef.current?.setRadius(hasFix && motion.accuracy ? Math.min(motion.accuracy, 200) : 0);
    if (followRef.current) mapRef.current.panTo(coords, { animate: true });
  }, [coords, motion.accuracy, hasFix, isMapReady]);

  useEffect(() => {
    const L = window.L;
    if (!isMapReady || !landmarkLayerRef.current || !L) return;

    landmarkLayerRef.current.clearLayers();
    landmarkMarkersRef.current = {};

    rawLandmarks.forEach((l) => {
      const m = L.circleMarker([l.lat, l.lng], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: l.color,
        fillOpacity: 1,
      });
      m.bindTooltip(`${escapeHtml(l.name)}<br/><small>${escapeHtml(l.category)}</small>`, {
        direction: 'top',
        offset: [0, -6],
      });
      m.addTo(landmarkLayerRef.current);
      landmarkMarkersRef.current[l.id] = m;
    });
  }, [rawLandmarks, isMapReady]);

  useEffect(() => {
    if (!mapRef.current) return;
    const t = setTimeout(() => {
      mapRef.current?.invalidateSize();
      if (followRef.current) mapRef.current?.panTo(coordsRef.current);
    }, 250);
    return () => clearTimeout(t);
  }, [isExpanded]);

  /* ------------------------ Driver: broadcast live GPS -------------------- */

  useEffect(() => {
    if (isManagerView || typeof navigator === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next: LatLng = [pos.coords.latitude, pos.coords.longitude];
        const m: Motion = {
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          accuracy: pos.coords.accuracy,
        };
        applyFix(next, m, Date.now());

        const t = Date.now();
        if (t - lastSentRef.current >= 2000) {
          lastSentRef.current = t;
          const payload = JSON.stringify({
            lat: next[0],
            lng: next[1],
            speed: m.speed,
            heading: m.heading,
            accuracy: m.accuracy,
            updatedAt: new Date(t).toISOString(),
          });
          pushLocation(tripId, payload);
        }
      },
      (err) => console.warn('Geolocation error:', err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [tripId, isManagerView, applyFix]);

  /* ------ Poll the trip: is it still live, when it started, where it is ------ */

  useEffect(() => {
    let cancelled = false;

    const poll = async (force = false) => {
      if (document.hidden && !force) return;

      const trip = await fetchTripLive(tripId);
      if (cancelled) return;

      if (!trip) {
        if (isManagerView) setTripLive((prev) => prev ?? true);
        return;
      }

      if (trip.started_at) setTripStartTime((prev) => prev ?? trip.started_at);

      if (!isManagerView) return;

      setTripLive(trip.live);
      if (!trip.live || !trip.current_location) return;

      const parsed = parseRawLocation(trip.current_location);
      if (parsed.hasFix) applyFix(parsed.coords, parsed.motion, parsed.updatedAt);
    };

    poll(true);
    const id = setInterval(() => poll(), 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tripId, isManagerView, applyFix]);

  /* -------------------------------- Actions ------------------------------- */

  const recenterMap = () => {
    followRef.current = true;
    setIsFollowing(true);
    mapRef.current?.flyTo(coords, DEFAULT_ZOOM, { animate: true, duration: 0.8 });
  };

  const focusLandmark = (l: Landmark) => {
    followRef.current = false;
    setIsFollowing(false);
    mapRef.current?.flyTo([l.lat, l.lng], LANDMARK_FOCUS_ZOOM, { animate: true, duration: 0.8 });
    setTimeout(() => landmarkMarkersRef.current[l.id]?.openTooltip(), 850);
  };

  const copyAddress = async () => {
    const text = `${address?.full || ''}\n${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  /* ------------------------------ Derived values -------------------------- */

  const secondsSinceUpdate = lastUpdateMs ? Math.max(0, Math.floor((now - lastUpdateMs) / 1000)) : null;
  const signal: 'live' | 'stale' | 'waiting' = !hasFix
    ? 'waiting'
    : secondsSinceUpdate !== null && secondsSinceUpdate > STALE_AFTER_SECONDS
    ? 'stale'
    : 'live';

  const dotClass = signal === 'live' ? 'bg-green-500' : signal === 'stale' ? 'bg-amber-400' : 'bg-slate-500';
  const pingClass = signal === 'live' ? 'bg-green-400' : 'bg-amber-300';
  const statusText =
    signal === 'live'
      ? 'Live GPS'
      : signal === 'stale'
      ? `No update for ${secondsSinceUpdate}s. Signal may be lost`
      : 'Waiting for GPS signal';

  const title = isManagerView ? `${driverName}'s live location` : 'Your live location';

  const speedKmh =
    motion.speed !== null && motion.speed !== undefined && !isNaN(motion.speed) ? Math.round(motion.speed * 3.6) : null;
  const isMoving = speedKmh !== null && speedKmh > 3;
  const hasHeading = motion.heading !== null && motion.heading !== undefined && !isNaN(motion.heading) && isMoving;

  const accuracyM = motion.accuracy !== null && motion.accuracy !== undefined ? Math.round(motion.accuracy) : null;
  const accuracyLabel =
    accuracyM === null ? 'Unknown' : accuracyM <= 15 ? 'High' : accuracyM <= 50 ? 'Good' : 'Low';
  const accuracyColor =
    accuracyM === null ? 'text-slate-300' : accuracyM <= 15 ? 'text-green-400' : accuracyM <= 50 ? 'text-amber-300' : 'text-red-400';

  const nearest = landmarks[0];
  const alsoNear = landmarks.slice(1, 3).filter((l) => l.distance <= 500);
  const proximitySentence = nearest
    ? nearest.distance <= 40
      ? `Right next to ${nearest.name}`
      : `${nearest.name} is ${formatDistance(nearest.distance)} ${nearest.direction} of the vehicle`
    : null;

  const precisionBadge =
    address?.precision === 'exact'
      ? { text: 'Exact building address', cls: 'bg-green-500/15 text-green-300 border-green-500/40' }
      : address?.precision === 'street'
      ? { text: 'Street level match', cls: 'bg-amber-400/15 text-amber-200 border-amber-400/40' }
      : address
      ? { text: 'Approximate area', cls: 'bg-slate-500/20 text-slate-300 border-slate-500/40' }
      : null;

  const mapsUrl = `https://www.google.com/maps?q=${coords[0]},${coords[1]}`;
  const overlayLabel = address ? [address.street, address.area.split(', ')[0]].filter(Boolean).join(', ') : initial.label;

  /* ---------------------------------- UI ---------------------------------- */

  if (hidden) return null;

  return (
    <div
      className={
        isExpanded
          ? 'fixed inset-0 z-50 bg-[#0d1013] flex flex-col overflow-hidden text-white'
          : 'bg-[#14181c] rounded-2xl border border-slate-800 overflow-hidden text-white relative shadow-lg'
      }
    >
      <style>{`
        @keyframes lj-ping { 0% { transform: scale(.55); opacity: .9; } 100% { transform: scale(1.7); opacity: 0; } }
        .lj-pulse { animation: lj-ping 1.8s cubic-bezier(0,0,.2,1) infinite; }
        .custom-vehicle-marker { background: transparent; border: 0; }
        @media (prefers-reduced-motion: reduce) { .lj-pulse { animation: none; opacity: .5; } }
      `}</style>

      {/* Header */}
      <div className="px-4 py-3 bg-[#0d1013] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {signal !== 'waiting' && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pingClass}`} />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{title}</p>
            <p className={`text-[11px] ${signal === 'stale' ? 'text-amber-300' : 'text-slate-400'}`}>{statusText}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {elapsedSeconds !== null && (
            <span
              className="bg-[#0a7337]/25 border border-[#0a7337] text-green-300 font-mono text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5"
              title="Time since the trip started"
            >
              <IconClock size={12} />
              {formatElapsed(elapsedSeconds)}
            </span>
          )}

          {/* Map Provider Switcher Button */}
          <div className="flex items-center rounded-lg bg-slate-800 p-0.5 border border-slate-700">
            <button
              type="button"
              onClick={() => setTileLayer('osm')}
              className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${
                mapProvider === 'osm' ? 'bg-[#0a7337] text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Road
            </button>
            <button
              type="button"
              onClick={() => setTileLayer('satellite')}
              className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${
                mapProvider === 'satellite' ? 'bg-[#0a7337] text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Satellite
            </button>
          </div>

          <button
            type="button"
            onClick={recenterMap}
            className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 ${
              isFollowing
                ? 'bg-[#0a7337] hover:bg-[#085a2b] text-white'
                : 'bg-amber-500/20 border border-amber-400/60 text-amber-200 hover:bg-amber-500/30'
            }`}
            title="Centre the map on the vehicle and keep following it"
          >
            <IconCrosshair size={12} />
            {isFollowing ? 'Following' : 'Recenter'}
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
            title={isExpanded ? 'Minimise map' : 'Expand map'}
          >
            {isExpanded ? <IconMinimize size={12} /> : <IconMaximize size={12} />}
            <span className="hidden sm:inline">{isExpanded ? 'Minimise' : 'Expand'}</span>
          </button>
        </div>
      </div>

      {/* Map */}
      <div className={`relative w-full bg-slate-900 ${isExpanded ? 'flex-1 min-h-[280px]' : 'h-[320px]'}`}>
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {!hasFix && (
          <div className="absolute inset-0 z-[500] bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center text-center px-6">
            <div>
              <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-slate-600 border-t-green-400 animate-spin" />
              <p className="text-sm font-semibold text-slate-100">Waiting for a GPS fix</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                {isManagerView
                  ? 'The driver has not shared a position yet. The map will update as soon as they do.'
                  : 'Allow location access in your browser and step outside if you are indoors.'}
              </p>
            </div>
          </div>
        )}

        {hasFix && accuracyM !== null && (
          <div className="absolute top-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5 shadow">
            <span className={`font-semibold ${accuracyColor}`}>{accuracyLabel} accuracy</span>
            <span className="text-slate-400 font-mono">±{accuracyM} m</span>
          </div>
        )}

        <div className="absolute bottom-3 left-3 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3.5 py-2 rounded-xl text-xs max-w-[calc(100%-4.5rem)] shadow-lg">
          <span className="block text-[11px] text-slate-400">Vehicle is at</span>
          <p className="font-semibold text-slate-100 truncate text-sm mt-0.5">{overlayLabel}</p>
        </div>
      </div>

      {/* Details */}
      <div className={`bg-[#14181c] border-t border-slate-800 shrink-0 ${isExpanded ? 'max-h-[48vh] overflow-y-auto' : ''}`}>
        <div className="p-4 space-y-3">
          {/* Exact address */}
          <section className="rounded-xl border border-slate-700/70 bg-gradient-to-br from-[#1b2a22] to-[#1a1f24] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-green-300">
                    <IconPin size={13} />
                    Full exact address
                  </span>
                  {precisionBadge && (
                    <span className={`text-[10px] font-medium border px-2 py-0.5 rounded-full ${precisionBadge.cls}`}>
                      {precisionBadge.text}
                    </span>
                  )}
                </div>

                {!hasFix ? (
                  <p className="text-sm text-slate-400">The address will appear once the GPS signal is found.</p>
                ) : address ? (
                  <>
                    {address.placeName && (
                      <p className="text-xs font-medium text-green-300 mb-0.5">{address.placeName}</p>
                    )}
                    <p className="text-lg sm:text-xl font-semibold text-white leading-snug break-words">{address.street}</p>
                    {address.area && <p className="text-sm text-slate-300 mt-0.5 break-words">{address.area}</p>}
                    {(address.postcode || address.country) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {[address.postcode, address.country].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </>
                ) : addressStatus === 'error' ? (
                  <p className="text-sm text-amber-300">Could not look up the address. Retrying shortly.</p>
                ) : (
                  <div className="space-y-2 animate-pulse" aria-label="Looking up address">
                    <div className="h-5 w-3/4 rounded bg-slate-700/70" />
                    <div className="h-3.5 w-1/2 rounded bg-slate-700/50" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={copyAddress}
                  disabled={!hasFix}
                  className="text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 border border-slate-600 px-2.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                >
                  {copied ? <IconCheck size={12} className="text-green-400" /> : <IconCopy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold bg-[#0a7337] hover:bg-[#085a2b] text-white px-2.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
                >
                  <IconExternal size={12} />
                  Open map
                </a>
              </div>
            </div>

            {hasFix && address?.full && (
              <p className="mt-3 pt-3 border-t border-slate-700/60 text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-200">Complete address: </span>
                <span className="italic">{address.full}</span>
              </p>
            )}

            {hasFix && (
              <p className="mt-2 text-[11px] font-mono text-slate-400 flex flex-wrap gap-x-4">
                <span>Lat {coords[0].toFixed(6)}</span>
                <span>Lng {coords[1].toFixed(6)}</span>
              </p>
            )}
          </section>

          {/* Movement stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Movement</span>
              <div className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                {isMoving ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                    {speedKmh} km/h, moving
                  </>
                ) : (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                    Stationary
                  </>
                )}
              </div>
            </div>

            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Heading</span>
              <div className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                {hasHeading ? (
                  <>
                    <IconArrow
                      size={13}
                      className="text-green-400"
                      style={{ transform: `rotate(${(motion.heading as number) - 45}deg)` }}
                    />
                    {compass(motion.heading as number)} · {Math.round(motion.heading as number)}°
                  </>
                ) : (
                  <span className="text-slate-400 font-medium">Not moving</span>
                )}
              </div>
            </div>

            <div className="bg-[#1a1f24] p-3 rounded-xl border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Last update</span>
              <div className="font-semibold text-slate-100 text-sm">
                {lastUpdateMs ? (
                  <>
                    {new Date(lastUpdateMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    <span className="text-slate-400 font-normal text-xs ml-1.5">
                      ({secondsSinceUpdate}s ago)
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 font-medium">No data yet</span>
                )}
              </div>
            </div>
          </div>

          {/* Landmarks */}
          <section className="rounded-xl border border-slate-800 bg-[#1a1f24] p-4">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h4 className="text-sm font-semibold text-slate-100">Nearby landmarks</h4>
              <span className="text-[11px] text-slate-400">Within {LANDMARK_RADIUS_M} m</span>
            </div>

            {proximitySentence && (
              <p className="text-xs text-green-300 mb-3 leading-relaxed">
                {proximitySentence}
                {alsoNear.length > 0 && (
                  <span className="text-slate-400">
                    {' '}
                    · also close to {alsoNear.map((l) => `${l.name} (${formatDistance(l.distance)} ${l.direction})`).join(', ')}
                  </span>
                )}
              </p>
            )}

            {!hasFix ? (
              <p className="text-xs text-slate-400">Landmarks will show once the vehicle's position is known.</p>
            ) : landmarks.length > 0 ? (
              <ul className="divide-y divide-slate-800/80">
                {landmarks.map((l, i) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => focusLandmark(l)}
                      className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-slate-800/50 rounded-lg px-2 -mx-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                      title="Show on map"
                    >
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-100 truncate">
                          {l.name}
                          {i === 0 && (
                            <span className="ml-2 text-[10px] font-medium text-green-300 bg-green-500/15 border border-green-500/30 px-1.5 py-0.5 rounded-full align-middle">
                              Closest
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-slate-400">{l.category}</span>
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
            ) : landmarkStatus === 'error' ? (
              <p className="text-xs text-amber-300">Could not load nearby landmarks. Retrying shortly.</p>
            ) : landmarkStatus === 'ready' ? (
              <p className="text-xs text-slate-400">
                No named landmarks are mapped within {LANDMARK_RADIUS_M} m. The area may be sparsely mapped.
              </p>
            ) : (
              <div className="space-y-3 animate-pulse" aria-label="Finding landmarks">
                {[0, 1, 2].map((n) => (
                  <div key={n} className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                    <div className="h-3.5 flex-1 rounded bg-slate-700/60" />
                    <div className="h-3.5 w-12 rounded bg-slate-700/60" />
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-[10px] text-slate-500 text-center">
            Address and landmark data © OpenStreetMap contributors
          </p>
        </div>
      </div>
    </div>
  );
}
