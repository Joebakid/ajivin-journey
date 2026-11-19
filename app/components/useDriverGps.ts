// app/components/useDriverGps.ts
'use client';

import { useEffect, useRef, useState } from 'react';

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  /** metres per second, null when unknown */
  speedMs: number | null;
  heading: number | null;
  t: number;
}

const MAX_GOOD_ACCURACY_M = 100;
const MAX_PLAUSIBLE_SPEED_MS = 70; // ~250 km/h: anything faster is a GPS jump
const SEND_EVERY_MS = 2000;
const SILENT_AFTER_MS = 6000;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLng = toRad(bLng - aLng);
  const y = Math.sin(dLng) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Runs the driver's GPS for one trip and sends every good fix to /api/trips/:id/location
 * (position, speed in m/s and km/h, heading, accuracy).
 *
 * Fixes over earlier versions:
 *  - A poor first fix is accepted straight away and replaced as soon as a better one arrives,
 *    instead of being thrown away (that left the map stuck on "Waiting for a GPS fix").
 *  - Some browsers deliver one fix and then go quiet until the device moves. If the watcher is
 *    silent for a few seconds, the position is read directly so updates keep flowing.
 */
export function useDriverGps({ tripId, enabled }: { tripId: number | string; enabled: boolean }) {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastGoodRef = useRef<{ lat: number; lng: number; t: number; acc: number } | null>(null);
  const lastSentRef = useRef(0);
  const lastCallbackRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location is not available on this device.');
      return;
    }

    let stopped = false;

    const handle = (pos: GeolocationPosition) => {
      if (stopped) return;
      lastCallbackRef.current = Date.now();
      setError(null);

      const acc = pos.coords.accuracy;
      const t = pos.timestamp || Date.now();
      const prev = lastGoodRef.current;

      // Ignore stale or out-of-order fixes
      if (prev && t <= prev.t) return;

      // Once we have a good fix, ignore clearly worse ones
      if (prev && acc > MAX_GOOD_ACCURACY_M && (prev.acc <= MAX_GOOD_ACCURACY_M || acc > prev.acc * 1.5)) {
        return;
      }

      let lat = pos.coords.latitude;
      let lng = pos.coords.longitude;
      let speedMs: number | null = Number.isFinite(pos.coords.speed as number) ? (pos.coords.speed as number) : null;
      let heading: number | null = Number.isFinite(pos.coords.heading as number) ? (pos.coords.heading as number) : null;

      if (prev) {
        const dt = (t - prev.t) / 1000;
        const moved = distanceM(prev.lat, prev.lng, lat, lng);
        const derived = dt > 0 ? moved / dt : null;

        // Ignore impossible jumps (only when the previous fix was good)
        if (
          derived !== null &&
          derived > MAX_PLAUSIBLE_SPEED_MS &&
          dt < 30 &&
          prev.acc <= MAX_GOOD_ACCURACY_M
        ) {
          return;
        }

        // The device did not report speed: work it out from distance and time
        if (speedMs === null && derived !== null && acc <= MAX_GOOD_ACCURACY_M) speedMs = derived;

        // Hold the position while standing still so GPS drift does not look like movement
        const reported = speedMs ?? derived ?? 0;
        if (reported < 0.8 && moved < Math.max(acc, 5) * 0.5) {
          lat = prev.lat;
          lng = prev.lng;
        } else if (heading === null && moved > 5) {
          heading = bearingDeg(prev.lat, prev.lng, lat, lng);
        }
      }

      if (speedMs !== null && speedMs < 0.5) speedMs = 0; // sensor noise while stopped

      lastGoodRef.current = { lat, lng, t, acc };

      const next: GpsFix = { lat, lng, accuracy: acc, speedMs, heading, t };
      setFix(next);

      const now = Date.now();
      if (now - lastSentRef.current >= SEND_EVERY_MS) {
        lastSentRef.current = now;
        const speedKmh = speedMs === null ? null : Math.round(speedMs * 3.6 * 10) / 10;
        fetch(`/api/trips/${tripId}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: JSON.stringify({
              lat,
              lng,
              speed: speedMs, // m/s, same field the older maps use
              speedKmh,
              heading,
              accuracy: acc,
              updatedAt: new Date(t).toISOString(),
            }),
          }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    const onError = (err: GeolocationPositionError) => {
      if (stopped) return;
      if (err.code === 1) setError('Location permission denied. Allow location access for this site.');
      else if (err.code === 2) setError('Position unavailable. Move to an open area.');
      // code 3 (timeout) is retried by the watcher
    };

    const watchId = navigator.geolocation.watchPosition(handle, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });

    const silentPoll = setInterval(() => {
      if (Date.now() - lastCallbackRef.current > SILENT_AFTER_MS) {
        navigator.geolocation.getCurrentPosition(handle, () => {}, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        });
      }
    }, 4000);

    // Keep the screen on so the phone keeps delivering GPS
    let lock: any = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) lock = await (navigator as any).wakeLock.request('screen');
      } catch {
        /* not allowed right now */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
      clearInterval(silentPoll);
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.().catch?.(() => {});
    };
  }, [tripId, enabled]);

  return { fix, error, hasFix: fix !== null };
}