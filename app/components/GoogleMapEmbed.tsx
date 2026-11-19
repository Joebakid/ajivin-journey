// app/components/GoogleMapEmbed.tsx
'use client';

import { useMemo, useState } from 'react';

export type GoogleMapType = 'roadmap' | 'satellite';

export interface GoogleMapEmbedProps {
  /** Pin by coordinates (preferred, most accurate) */
  lat?: number | null;
  lng?: number | null;
  /** Fallback when there are no coordinates: an address or place name */
  query?: string | null;
  zoom?: number;
  /** Pixels (number) or any CSS length (string) */
  height?: number | string;
  mapType?: GoogleMapType;
  /** Show the Road / Satellite switch */
  allowTypeSwitch?: boolean;
  /** Show "Open in Google Maps" and "Directions" links under the map */
  showLinks?: boolean;
  /** Accessible title for the iframe */
  title?: string;
  /** Small caption shown over the map, e.g. "Last position before resolved" */
  caption?: string;
  className?: string;
  emptyMessage?: string;
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Backup map built on Google Maps. Works with no setup (keyless embed).
 * If NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, it uses the official Maps Embed API instead.
 *
 * Usage:
 *   <GoogleMapEmbed lat={5.5731} lng={5.841} />
 *   <GoogleMapEmbed query="Apapa Port Complex, Lagos" height={220} allowTypeSwitch={false} />
 */
export default function GoogleMapEmbed({
  lat,
  lng,
  query,
  zoom = 16,
  height = 256,
  mapType = 'roadmap',
  allowTypeSwitch = true,
  showLinks = true,
  title = 'Google map',
  caption,
  className = '',
  emptyMessage = 'No location available to show on the map.',
}: GoogleMapEmbedProps) {
  const [type, setType] = useState<GoogleMapType>(mapType);
  const [loaded, setLoaded] = useState(false);

  const hasCoords = isNum(lat) && isNum(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const place = hasCoords ? `${lat},${lng}` : query?.trim() || '';

  const src = useMemo(() => {
    if (!place) return null;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      return (
        `https://www.google.com/maps/embed/v1/place?key=${apiKey}` +
        `&q=${encodeURIComponent(place)}&zoom=${zoom}&maptype=${type}`
      );
    }
    return (
      `https://maps.google.com/maps?q=${encodeURIComponent(place)}` +
      `&z=${zoom}&t=${type === 'satellite' ? 'k' : 'm'}&output=embed`
    );
  }, [place, zoom, type]);

  const openUrl = place
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
    : null;
  const directionsUrl = place
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`
    : null;

  const heightStyle = { height: typeof height === 'number' ? `${height}px` : height };

  if (!src) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-center px-6 text-sm font-medium text-gray-400 ${className}`}
        style={heightStyle}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl overflow-hidden border border-gray-100 bg-white ${className}`}>
      <div className="relative bg-gray-100" style={heightStyle}>
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="h-7 w-7 rounded-full border-2 border-gray-300 border-t-[#0a7337] animate-spin" />
          </div>
        )}

        <iframe
          key={src}
          title={title}
          src={src}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          onLoad={() => setLoaded(true)}
          className="relative w-full h-full border-0"
        />

        {caption && (
          <span className="absolute top-2.5 left-2.5 bg-slate-900/85 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full pointer-events-none">
            {caption}
          </span>
        )}

        {allowTypeSwitch && (
          <div className="absolute top-2.5 right-2.5 flex items-center rounded-lg bg-slate-900/85 p-0.5 border border-slate-700">
            {(['roadmap', 'satellite'] as GoogleMapType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setLoaded(false);
                  setType(t);
                }}
                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${
                  type === t ? 'bg-[#0a7337] text-white shadow' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t === 'roadmap' ? 'Road' : 'Satellite'}
              </button>
            ))}
          </div>
        )}
      </div>

      {showLinks && openUrl && directionsUrl && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 bg-white">
          <span className="text-[11px] font-mono text-gray-500 truncate">
            {hasCoords ? `${lat!.toFixed(6)}, ${lng!.toFixed(6)}` : place}
          </span>
          <span className="flex items-center gap-3 shrink-0">
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-[#0a7337] hover:underline"
            >
              Open in Google Maps
            </a>
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-[#0a7337] hover:underline"
            >
              Directions
            </a>
          </span>
        </div>
      )}
    </div>
  );
}