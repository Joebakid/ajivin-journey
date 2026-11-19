// app/components/SosAlertCard.tsx
// Server component: renders one panic alert with trip, vehicle and live location details.
import { resolveSosAction } from '@/app/actions/panic';
import MapSwitcher from '@/app/components/MapSwitcher';
import GoogleMapEmbed from '@/app/components/GoogleMapEmbed';

function fmt(d: unknown): string {
  if (!d) return '—';
  const date = new Date(d as string);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2.5">
      <span className="text-xs font-medium text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-gray-900 text-right break-words min-w-0">
        {children}
      </span>
    </div>
  );
}

export default function SosAlertCard({ alert }: { alert: any }) {
  const active = !alert.is_resolved;

  const lat = alert.latitude != null ? Number(alert.latitude) : null;
  const lng = alert.longitude != null ? Number(alert.longitude) : null;
  const hasCoords = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

  // Plain-text location (never the tracker's JSON blob)
  const liveText =
    typeof alert.live_location === 'string' && !alert.live_location.trim().startsWith('{')
      ? alert.live_location
      : null;
  const locationText: string | null = alert.location_text || liveText || null;

  const mapsUrl = hasCoords
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : locationText
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText)}`
    : null;

  // If the driver is on a started trip, the existing live tracker shows and follows them.
  // Otherwise fall back to a map pinned to the position captured with the alert.
  const tripIsLive =
    !!alert.trip_id &&
    (alert.trip_status === 'En Route' ||
      (alert.trip_status === 'Active' && Boolean(alert.trip_is_started)));
  const showTracker = active && tripIsLive;
  // Google map backup: used whenever the live tracker is not showing (no live trip, or resolved)
  const showBackupMap = !showTracker && (hasCoords || !!locationText);

  const startedAtIso = alert.trip_started_at
    ? new Date(alert.trip_started_at).toISOString()
    : null;

  return (
    <div
      className={`rounded-3xl border-2 overflow-hidden ${
        active ? 'bg-red-50 border-red-200 shadow-sm' : 'bg-white border-gray-100'
      }`}
    >
      {/* Header */}
      <div className="p-5 flex justify-between items-start gap-4">
        <div className="min-w-0">
          <span
            className={`inline-block text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full ${
              active ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {active ? 'Active emergency' : 'Resolved'}
          </span>
          <h4 className="text-lg font-bold text-gray-900 mt-2 truncate">
            {alert.driver_name || `Driver #${alert.driver_id}`}
          </h4>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Triggered {fmt(alert.created_at)}
          </p>
        </div>

        {alert.driver_phone && (
          <a
            href={`tel:${alert.driver_phone}`}
            className="shrink-0 bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95"
          >
            Call driver
          </a>
        )}
      </div>

      {/* Live location */}
      <div className="px-5 pb-5 space-y-3">
        {showTracker && (
          <div className="rounded-2xl overflow-hidden border border-gray-100">
            <MapSwitcher
              tripId={alert.trip_id}
              currentLocation={typeof alert.live_location === 'string' ? alert.live_location : null}
              isManagerView={true}
              driverName={alert.driver_name || 'Driver'}
              startedAt={startedAtIso}
            />
          </div>
        )}

        {showTracker && hasCoords && (
          <details className="group rounded-2xl border border-gray-100 bg-white">
            <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-bold text-gray-600">
              Not seeing the driver? Open the Google Maps backup
            </summary>
            <div className="p-2">
              <GoogleMapEmbed
                lat={lat}
                lng={lng}
                title={`Location of ${alert.driver_name || 'driver'}`}
                caption="Position when alert was raised"
              />
            </div>
          </details>
        )}

        {showBackupMap && (
          <GoogleMapEmbed
            lat={hasCoords ? lat : null}
            lng={hasCoords ? lng : null}
            query={hasCoords ? null : locationText}
            title={`Location of ${alert.driver_name || 'driver'}`}
            caption={active ? 'Last position received' : 'Last position before resolved'}
            height={288}
          />
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {active ? 'Last position received' : 'Last position before resolved'}
            </p>
            <p className="text-sm font-semibold text-gray-900 break-words">
              {locationText || 'Location unavailable. Call the driver now.'}
              {hasCoords && alert.accuracy_m != null && (
                <span className="text-xs font-normal text-gray-500">
                  {' '}
                  (accurate to about {Math.round(Number(alert.accuracy_m))} m)
                </span>
              )}
            </p>
            {hasCoords && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                Updated {fmt(alert.location_updated_at || alert.created_at)}
              </p>
            )}
          </div>
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-center text-xs font-bold bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 px-4 py-2.5 rounded-xl transition-all active:scale-95"
            >
              Open in Google Maps
            </a>
          )}
        </div>
      </div>

      {/* Trip, passenger, vehicle */}
      <div className="px-5 pb-5">
        <div className="bg-white rounded-2xl border border-gray-100 px-4 divide-y divide-gray-100">
          <Row label="Trip">{alert.trip_id ? `TRP-${alert.trip_id}` : 'Not on an active trip'}</Row>
          {alert.destination && <Row label="Destination">{alert.destination}</Row>}
          <Row label="Passenger / Staff">
            {alert.passenger_name ? (
              <>
                {alert.passenger_name}
                {alert.passenger_phone && (
                  <>
                    <br />
                    <a
                      href={`tel:${alert.passenger_phone}`}
                      className="text-xs font-normal text-[#0a7337] hover:underline"
                    >
                      {alert.passenger_phone}
                    </a>
                  </>
                )}
              </>
            ) : (
              '—'
            )}
          </Row>
          <Row label="Trip started">{alert.trip_id ? fmt(alert.trip_started_at) : '—'}</Row>
          <Row label="Vehicle plate">{alert.plate_number || '—'}</Row>
          <Row label="Vehicle model">{alert.vehicle_model || '—'}</Row>
          <Row label="Driver phone">{alert.driver_phone || '—'}</Row>
        </div>
      </div>

      {/* Footer */}
      {active ? (
        <div className="px-5 pb-5 flex justify-end">
          <form action={resolveSosAction}>
            <input type="hidden" name="alert_id" value={alert.id} />
            <button
              type="submit"
              className="text-sm font-bold bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl transition-all active:scale-95"
            >
              Mark as resolved
            </button>
          </form>
        </div>
      ) : (
        <div className="px-5 pb-4 text-[11px] font-medium text-gray-400">
          Resolved {fmt(alert.resolved_at)}
        </div>
      )}
    </div>
  );
}