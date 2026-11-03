'use server';

import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';
import { ensureNotificationsTable } from './notification';

const ALREADY_HANDLED = 'This request was already handled.';

function parseId(id: number | string | undefined | null): number | null {
  if (!id) return null;
  const parsed = typeof id === 'string' ? parseInt(id, 10) : id;
  return isNaN(parsed) || !parsed ? null : parsed;
}

function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(Number(totalSeconds))) return null;
  const s = Math.max(0, Math.floor(Number(totalSeconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export async function ensureTripsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requester_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      destination TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Pending',
      fasttrack_code VARCHAR(100),
      current_location TEXT,
      location_updated_at TIMESTAMPTZ,
      scheduled_time TEXT,
      is_started BOOLEAN DEFAULT FALSE,
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      duration_seconds INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS requester_id INTEGER REFERENCES users(id) ON DELETE SET NULL`;
  } catch (_) {}
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS scheduled_time TEXT`;
  } catch (_) {}
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS is_started BOOLEAN DEFAULT FALSE`;
  } catch (_) {}
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`;
  } catch (_) {}
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`;
  } catch (_) {}
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS fasttrack_code VARCHAR(100)`;
  } catch (_) {}
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS current_location TEXT`;
  } catch (_) {}
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ`;
  } catch (_) {}
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`;
  } catch (_) {}
}

/* ----------------------------- Location Queries ---------------------------- */

export async function getTripLocationAction(tripId: number | string) {
  const id = parseId(tripId);
  if (!id) return null;

  try {
    const result = await sql`
      SELECT id, current_location, status, is_started, created_at,
             COALESCE(started_at, created_at) as started_at
      FROM trips
      WHERE id = ${id}
      LIMIT 1
    `;
    if (result.length === 0) return null;
    return {
      ...result[0],
      live: ['Active', 'En Route'].includes(result[0].status),
    };
  } catch {
    try {
      const fallback = await sql`
        SELECT id, current_location, status, is_started, created_at, created_at as started_at
        FROM trips
        WHERE id = ${id}
        LIMIT 1
      `;
      if (fallback.length === 0) return null;
      return {
        ...fallback[0],
        live: ['Active', 'En Route'].includes(fallback[0].status),
      };
    } catch (e) {
      console.error('Failed to fetch trip location:', e);
      return null;
    }
  }
}

export async function updateLocationAction(tripId: number | string, location: string | object) {
  const id = parseId(tripId);
  if (!id) return { error: 'Invalid trip ID' };

  const locStr = typeof location === 'object' ? JSON.stringify(location) : String(location);

  try {
    try {
      await sql`
        UPDATE trips
        SET current_location = ${locStr}, location_updated_at = NOW()
        WHERE id = ${id}
      `;
    } catch {
      // location_updated_at column not added yet
      await sql`
        UPDATE trips
        SET current_location = ${locStr}
        WHERE id = ${id}
      `;
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to update location:', error);
    return { error: 'Failed to update location' };
  }
}

export const updateTripLocation = updateLocationAction;

/* ------------------------------- Trip Lifecycle --------------------------- */

// Manager approves trip and assigns the selected driver
export async function approveTripAction(tripIdOrForm: number | string | FormData, driverIdArg?: number | string) {
  await ensureTripsTable();
  await ensureNotificationsTable();

  let id: number | null = null;
  let assignedDriverId: number | null = null;

  if (tripIdOrForm instanceof FormData) {
    id = parseId(tripIdOrForm.get('trip_id') as string);
    assignedDriverId = parseId(tripIdOrForm.get('driver_id') as string);
  } else {
    id = parseId(tripIdOrForm);
    assignedDriverId = parseId(driverIdArg);
  }

  if (!id) return { error: 'Invalid trip ID' };
  if (!assignedDriverId) return { error: 'Please choose an available driver to assign.' };

  // 1. Check if the driver is currently on another active or en route trip
  const activeTrips = await sql`
    SELECT id, destination, status FROM trips
    WHERE driver_id = ${assignedDriverId}
      AND status IN ('Active', 'En Route')
      AND id != ${id}
    LIMIT 1
  `;

  if (activeTrips.length > 0) {
    const driverRows = await sql`SELECT name FROM users WHERE id = ${assignedDriverId}`;
    const driverName = driverRows[0]?.name || 'This driver';
    const activeDest = String(activeTrips[0].destination).split(' (')[0];

    return {
      error: `${driverName} is currently on an active trip (TRP-${activeTrips[0].id} to ${activeDest}). They must end that trip before taking another one.`,
    };
  }

  const fastTrackCode = 'FT-' + Math.floor(100000 + Math.random() * 900000);

  try {
    const updated = await sql`
      UPDATE trips
      SET status = 'Active',
          fasttrack_code = ${fastTrackCode},
          driver_id = ${assignedDriverId}
      WHERE id = ${id} AND status = 'Pending'
      RETURNING id, driver_id, destination, requester_id, scheduled_time
    `;
    if (updated.length === 0) return { error: ALREADY_HANDLED, alreadyHandled: true };

    const trip = updated[0];
    const finalDriverId = trip.driver_id;
    const place = trip.destination ? String(trip.destination).split(' (')[0] : 'destination';
    const schedInfo = trip.scheduled_time ? ` (Time: ${trip.scheduled_time})` : '';

    // Notify assigned driver
    await sql`
      INSERT INTO notifications (title, message, target_user_id, target_role)
      VALUES (
        'New Trip Assigned',
        ${`You have been assigned to trip TRP-${id} to ${place}${schedInfo}. FastTrack Code: ${fastTrackCode}`},
        ${finalDriverId},
        'driver'
      )
    `;

    // Notify requesting staff passenger
    if (trip.requester_id) {
      let driverName = 'Assigned Driver';
      const dRows = await sql`SELECT name, phone FROM users WHERE id = ${finalDriverId}`;
      if (dRows.length > 0) {
        driverName = `${dRows[0].name}${dRows[0].phone ? ` (Tel: ${dRows[0].phone})` : ''}`;
      }

      await sql`
        INSERT INTO notifications (title, message, target_user_id, target_role)
        VALUES (
          'Trip Approved & Driver Assigned',
          ${`Your trip to ${place} has been approved! Driver: ${driverName}. FastTrack: ${fastTrackCode}`},
          ${trip.requester_id},
          'staff'
        )
      `;
    }

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/staff');
    return { success: true };
  } catch (error) {
    console.error('Approval failed:', error);
    return { error: 'Failed to approve trip' };
  }
}

export async function declineTripAction(tripIdOrForm: number | string | FormData) {
  await ensureTripsTable();
  await ensureNotificationsTable();

  const id = tripIdOrForm instanceof FormData
    ? parseId(tripIdOrForm.get('trip_id') as string)
    : parseId(tripIdOrForm);

  if (!id) return { error: 'Invalid trip ID' };

  try {
    const updated = await sql`
      UPDATE trips
      SET status = 'Declined'
      WHERE id = ${id} AND status = 'Pending'
      RETURNING driver_id, requester_id, destination
    `;
    if (updated.length === 0) return { error: ALREADY_HANDLED, alreadyHandled: true };

    const trip = updated[0];
    const place = trip.destination ? String(trip.destination).split(' (')[0] : 'destination';

    if (trip.requester_id) {
      await sql`
        INSERT INTO notifications (title, message, target_user_id, target_role)
        VALUES (
          'Trip Request Declined',
          ${`Your trip request to ${place} was declined by dispatch management.`},
          ${trip.requester_id},
          'staff'
        )
      `;
    }

    if (trip.driver_id) {
      await sql`
        INSERT INTO notifications (title, message, target_user_id, target_role)
        VALUES (
          'Journey Declined',
          ${`Trip TRP-${id} to ${place} request was declined.`},
          ${trip.driver_id},
          'driver'
        )
      `;
    }

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/staff');
    return { success: true };
  } catch (error) {
    console.error('Decline failed:', error);
    return { error: 'Failed to decline trip' };
  }
}

export async function cancelTripAction(tripId: number | string) {
  const id = parseId(tripId);
  if (!id) return { error: 'Invalid trip ID' };

  try {
    await ensureNotificationsTable();

    const updated = await sql`
      UPDATE trips
      SET status = 'Cancelled'
      WHERE id = ${id} AND status IN ('Pending', 'Active', 'En Route')
      RETURNING destination, driver_id, requester_id
    `;
    if (updated.length === 0) return { error: ALREADY_HANDLED, alreadyHandled: true };

    const place = updated[0].destination ? String(updated[0].destination).split(' (')[0] : 'destination';

    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES ('Journey Cancelled', ${`Trip TRP-${id} to ${place} was cancelled.`}, 'all')
    `;

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/staff');
    return { success: true };
  } catch (error) {
    console.error('Cancel failed:', error);
    return { error: 'Failed to cancel trip' };
  }
}

export async function startTripAction(tripId: number | string) {
  const id = parseId(tripId);
  if (!id) return { error: 'Invalid trip ID' };

  try {
    await ensureTripsTable();
    await ensureNotificationsTable();

    // started_at comes from the database clock. The old position is cleared so the map
    // never shows a leftover location from before the trip began.
    const updated = await sql`
      UPDATE trips
      SET status = 'En Route',
          is_started = true,
          started_at = COALESCE(started_at, NOW()),
          current_location = NULL,
          location_updated_at = NULL
      WHERE id = ${id} AND status = 'Active'
      RETURNING driver_id, requester_id, destination
    `;
    if (updated.length === 0) return { error: ALREADY_HANDLED, alreadyHandled: true };

    const trip = updated[0];
    const nameRows = await sql`SELECT name FROM users WHERE id = ${trip.driver_id} LIMIT 1`;
    const driverName = nameRows[0]?.name || 'Driver';
    const place = trip.destination ? String(trip.destination).split(' (')[0] : 'destination';

    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES ('Journey Started', ${`${driverName} started the journey to ${place} (TRP-${id}). GPS tracking active.`}, 'manager')
    `;

    if (trip.requester_id) {
      await sql`
        INSERT INTO notifications (title, message, target_user_id, target_role)
        VALUES (
          'Driver En Route',
          ${`${driverName} has started the trip to ${place}.`},
          ${trip.requester_id},
          'staff'
        )
      `;
    }

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/staff');
    return { success: true };
  } catch (error) {
    console.error('Start trip failed:', error);
    return { error: 'Failed to start trip' };
  }
}

export async function endTripAction(formDataOrTripId: FormData | number | string, driverIdArg?: number | string) {
  let tripId: number | null = null;
  let driverId: number | null = null;

  if (formDataOrTripId instanceof FormData) {
    tripId = parseId(formDataOrTripId.get('trip_id') as string);
    driverId = parseId(formDataOrTripId.get('driver_id') as string);
  } else {
    tripId = parseId(formDataOrTripId);
    driverId = driverIdArg ? parseId(driverIdArg) : null;
  }

  if (!tripId) return { error: 'Invalid trip ID' };

  try {
    await ensureTripsTable();
    await ensureNotificationsTable();

    // ended_at and the exact duration both come from the same NOW() in the database
    const updated = await sql`
      UPDATE trips
      SET status = 'Completed',
          ended_at = NOW(),
          duration_seconds = CASE
            WHEN started_at IS NULL THEN NULL
            ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)))::int
          END
      WHERE id = ${tripId} AND status IN ('Active', 'En Route')
      RETURNING id, destination, driver_id, requester_id, duration_seconds
    `;

    if (updated.length > 0) {
      const trip = updated[0];
      const driverRows = await sql`SELECT name FROM users WHERE id = ${trip.driver_id} LIMIT 1`;
      const driverName = driverRows[0]?.name || 'Driver';
      const place = trip.destination ? String(trip.destination).split(' (')[0] : 'destination';
      const duration = formatDuration(trip.duration_seconds);
      const durationText = duration ? ` Journey time: ${duration}.` : '';

      await sql`
        INSERT INTO notifications (title, message, target_role)
        VALUES (
          'Trip Completed',
          ${`${driverName} has ended the trip to ${place} (TRP-${tripId}).${durationText}`},
          'manager'
        )
      `;

      if (trip.requester_id) {
        await sql`
          INSERT INTO notifications (title, message, target_user_id, target_role)
          VALUES (
            'Trip Completed',
            ${`Your trip to ${place} has been marked completed by the driver.${durationText} You can now leave a review on your dashboard.`},
            ${trip.requester_id},
            'staff'
          )
        `;
      }
    }

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/staff');
    return { success: true };
  } catch (error) {
    console.error('Failed to end trip:', error);
    return { error: 'Failed to end trip' };
  }
}