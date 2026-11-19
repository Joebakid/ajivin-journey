// app/actions/panic.ts
'use server';

import { sql } from '@/src/lib/db';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createNotificationAction } from './notification';
import { insertMessage } from '@/src/lib/messagesDb';

export type PanicCoords = {
  lat: number;
  lng: number;
  accuracy?: number | null;
};

let ready: Promise<void> | null = null;
export async function ensurePanicTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS panic_alerts (
          id SERIAL PRIMARY KEY,
          driver_id INTEGER NOT NULL,
          trip_id INTEGER,
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          accuracy_m DOUBLE PRECISION,
          location_text TEXT,
          location_updated_at TIMESTAMPTZ DEFAULT NOW(),
          plate_number TEXT,
          vehicle_model TEXT,
          destination TEXT,
          passenger_name TEXT,
          passenger_phone TEXT,
          trip_started_at TIMESTAMPTZ,
          is_resolved BOOLEAN NOT NULL DEFAULT false,
          resolved_by INTEGER,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      // For databases where the table was already created by the first version
      await sql`ALTER TABLE panic_alerts ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ DEFAULT NOW()`;
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  await ready;
}

async function getSessionUserId(): Promise<number | null> {
  const jar = await cookies();
  const raw = jar.get('userId')?.value || jar.get('ajivin_session_id')?.value;
  const id = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

function validCoords(c?: PanicCoords | null): c is PanicCoords {
  return (
    !!c &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lng) <= 180
  );
}

function formatLagos(d: unknown): string | null {
  if (!d) return null;
  const date = new Date(d as string);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * The driver is identified from the session cookie, never from client input,
 * so nobody can raise an alert in another driver's name.
 */
export async function triggerPanicAction(coords?: PanicCoords | null) {
  try {
    const driverId = await getSessionUserId();
    if (!driverId) return { error: 'Not signed in' };

    await ensurePanicTable();

    const users = await sql`SELECT id, name, phone FROM users WHERE id = ${driverId} LIMIT 1`;
    const driver = users[0];
    if (!driver) return { error: 'Driver not found' };

    const hasCoords = validCoords(coords);

    // Trip + vehicle lookups must never block the alert, so each is guarded.
    let trip: any = null;
    try {
      const rows = await sql`
        SELECT t.id, t.destination, t.status, t.started_at, t.current_location,
               req.name AS requester_name, req.phone AS requester_phone
        FROM trips t
        LEFT JOIN users req ON t.requester_id = req.id
        WHERE t.driver_id = ${driverId} AND t.status IN ('Active', 'En Route')
        ORDER BY t.created_at DESC
        LIMIT 1
      `;
      trip = rows[0] || null;
    } catch (e) {
      console.error('Panic: trip lookup failed', e);
    }

    let vehicle: any = null;
    try {
      const rows = await sql`
        SELECT plate_number, model
        FROM vehicles
        WHERE driver_id = ${driverId}
        ORDER BY is_active DESC, created_at DESC
        LIMIT 1
      `;
      vehicle = rows[0] || null;
    } catch (e) {
      console.error('Panic: vehicle lookup failed', e);
    }

    // Fall back to the last position the trip tracker stored, if it has one
    let tripLat: number | null = null;
    let tripLng: number | null = null;
    if (!hasCoords && trip?.current_location) {
      try {
        const p = JSON.parse(trip.current_location);
        const la = parseFloat(p.lat);
        const ln = parseFloat(p.lng);
        if (Number.isFinite(la) && Number.isFinite(ln)) {
          tripLat = la;
          tripLng = ln;
        }
      } catch {
        // plain text location, nothing to parse
      }
    }

    const lat = hasCoords ? coords!.lat : tripLat;
    const lng = hasCoords ? coords!.lng : tripLng;
    const hasPoint = lat !== null && lng !== null;

    const locationText = hasPoint
      ? `${lat!.toFixed(5)}, ${lng!.toFixed(5)}`
      : typeof trip?.current_location === 'string' && !trip.current_location.trim().startsWith('{')
      ? trip.current_location
      : null;

    const inserted = await sql`
      INSERT INTO panic_alerts (
        driver_id, trip_id, latitude, longitude, accuracy_m, location_text,
        plate_number, vehicle_model, destination,
        passenger_name, passenger_phone, trip_started_at
      )
      VALUES (
        ${driverId},
        ${trip?.id ?? null},
        ${lat},
        ${lng},
        ${hasCoords && coords!.accuracy != null ? coords!.accuracy : null},
        ${locationText},
        ${vehicle?.plate_number ?? null},
        ${vehicle?.model ?? null},
        ${trip?.destination ? String(trip.destination).split(' (')[0] : null},
        ${trip?.requester_name ?? null},
        ${trip?.requester_phone ?? null},
        ${trip?.started_at ?? null}
      )
      RETURNING id
    `;

    // Notification + chat message (best effort)
    const mapsLink = hasPoint ? `https://www.google.com/maps?q=${lat},${lng}` : null;

    const alertMessage = [
      `URGENT: Driver ${driver.name} triggered the PANIC BUTTON!`,
      trip ? `Trip TRP-${trip.id} to ${String(trip.destination).split(' (')[0]}` : 'Not on an active trip',
      vehicle?.plate_number ? `Vehicle ${vehicle.plate_number}${vehicle.model ? ` (${vehicle.model})` : ''}` : null,
      trip?.requester_name ? `Passenger ${trip.requester_name}${trip.requester_phone ? ` ${trip.requester_phone}` : ''}` : null,
      formatLagos(trip?.started_at) ? `Trip started ${formatLagos(trip.started_at)}` : null,
      locationText ? `Location ${locationText}` : 'Location unavailable',
      mapsLink,
    ]
      .filter(Boolean)
      .join(' | ');

    try {
      await createNotificationAction('🚨 EMERGENCY PANIC ALERT', alertMessage, null, 'manager');
    } catch (e) {
      console.error('Panic: notification failed', e);
    }

    try {
      const managers = await sql`SELECT id FROM users WHERE role = 'manager' ORDER BY id ASC LIMIT 1`;
      await insertMessage({
        senderId: driverId,
        receiverId: managers.length > 0 ? managers[0].id : 0,
        text: `🚨 ${alertMessage}`,
        parentId: null,
        parentText: null,
        media: null,
      });
    } catch (e) {
      console.error('Panic: chat message failed', e);
    }

    revalidatePath('/dashboard/manager');

    return { success: true, alertId: inserted[0]?.id as number, hasLocation: hasPoint };
  } catch (error) {
    console.error('Panic trigger failed:', error);
    return { error: 'Failed to trigger panic alert' };
  }
}

/**
 * Keeps an open alert's position fresh. Used by the panic button after it fires,
 * mainly for drivers who are not on a tracked trip. Only the alert's own driver
 * can update it, and only while it is unresolved.
 */
export async function updatePanicLocationAction(alertId: number, coords: PanicCoords) {
  try {
    const driverId = await getSessionUserId();
    if (!driverId || !alertId || !validCoords(coords)) return { error: 'Invalid request' };

    await sql`
      UPDATE panic_alerts
      SET latitude = ${coords.lat},
          longitude = ${coords.lng},
          accuracy_m = ${coords.accuracy ?? null},
          location_text = ${`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`},
          location_updated_at = NOW()
      WHERE id = ${alertId} AND driver_id = ${driverId} AND is_resolved = FALSE
    `;
    return { success: true };
  } catch (error) {
    console.error('Panic location update failed:', error);
    return { error: 'Failed to update location' };
  }
}

export async function resolveSosAction(formData: FormData): Promise<void> {
  const managerId = await getSessionUserId();
  if (!managerId) return;

  const rows = await sql`SELECT role FROM users WHERE id = ${managerId} LIMIT 1`;
  if ((rows[0]?.role || '').toLowerCase() !== 'manager') return;

  const alertId = parseInt(String(formData.get('alert_id')), 10);
  if (!alertId || isNaN(alertId)) return;

  await ensurePanicTable();
  await sql`
    UPDATE panic_alerts
    SET is_resolved = TRUE, resolved_by = ${managerId}, resolved_at = NOW()
    WHERE id = ${alertId}
  `;

  revalidatePath('/dashboard/manager');
}