// app/components/PanicButton.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  triggerPanicAction,
  updatePanicLocationAction,
  type PanicCoords,
} from '@/app/actions/panic';

// Props are kept so the existing driver page doesn't need to change.
// The server identifies the driver and trip itself.
interface PanicButtonProps {
  driverId?: number;
  driverName?: string;
  tripId?: number;
  currentLocation?: string | null;
}

type Phase = 'idle' | 'locating' | 'sending' | 'sent';

function getPosition(): Promise<PanicCoords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      () => resolve(null),
      // Short timeout: in an emergency the alert must go out even without GPS.
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 10000 }
    );
  });
}

export default function PanicButton(_props: PanicButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [alertId, setAlertId] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePanic = async () => {
    const confirmed = window.confirm(
      'URGENT: Trigger the PANIC alert? Management will be notified immediately with your location and trip details.'
    );
    if (!confirmed) return;

    setError(null);
    setPhase('locating');
    const coords = await getPosition();

    setPhase('sending');
    const res = await triggerPanicAction(coords);

    if (res && 'success' in res && res.success) {
      setPhase('sent');
      setAlertId(res.alertId ?? null);
      setNote(
        res.hasLocation
          ? 'Your live location is being shared with management. Keep this page open.'
          : 'Location unavailable so far. Allow location access for this site. We will share it as soon as it is found.'
      );
    } else {
      setPhase('idle');
      setError('Failed to send the alert. Please call management directly.');
    }
  };

  // After the alert is sent, keep the alert's position fresh. Drivers on a tracked trip are
  // also broadcast by LiveLocationTracker; this covers drivers who are not on a trip.
  useEffect(() => {
    if (!alertId || typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

    let last = 0;
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now();
        if (now - last < 5000) return;
        last = now;
        updatePanicLocationAction(alertId, {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [alertId]);

  const busy = phase === 'locating' || phase === 'sending';
  const label =
    phase === 'locating'
      ? 'Getting your location...'
      : phase === 'sending'
      ? 'Sending SOS...'
      : phase === 'sent'
      ? 'SOS sent to management'
      : '🚨 Trigger Panic Button';

  return (
    <div className="space-y-3">
      <button
        onClick={handlePanic}
        disabled={busy || phase === 'sent'}
        className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 text-sm ${
          phase === 'sent'
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/30 animate-pulse'
        }`}
      >
        {label}
      </button>

      {note && (
        <p className="text-xs font-semibold text-green-700 text-center" role="status">
          {note}
        </p>
      )}
      {error && (
        <p className="text-xs font-semibold text-red-700 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}