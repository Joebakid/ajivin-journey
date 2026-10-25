'use server';

import { sql } from '@/src/lib/db';
import { revalidatePath } from 'next/cache';
import { ensureNotificationsTable } from './notification';

const ALREADY_HANDLED = 'This request was already handled.';

// Helper to safely parse trip IDs whether passed as string or number
function parseId(id: number | string): number | null {
  const parsed = typeof id === 'string' ? parseInt(id, 10) : id;
  return isNaN(parsed) || !parsed ? null : parsed;
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

  try {
    const locStr = typeof location === 'object' ? JSON.stringify(location) : String(location);

    await sql`
      UPDATE trips
      SET current_location = ${locStr}
      WHERE id = ${id}
    `;

    return { success: true };
  } catch (error) {
    console.error('Failed to update location:', error);
    return { error: 'Failed to update location' };
  }
}

// Alias to prevent import errors across tracker components
export const updateTripLocation = updateLocationAction;

/* ------------------------------- Trip Lifecycle --------------------------- */

export async function approveTripAction(tripId: number | string) {
  const id = parseId(tripId);
  if (!id) return { error: 'Invalid trip ID' };

  const fastTrackCode = 'FT-' + Math.random().toString(36).substring(2, 6).toUpperCase();

  try {
    await ensureNotificationsTable();

    const updated = await sql`
      UPDATE trips
      SET status = 'Active', fasttrack_code = ${fastTrackCode}
      WHERE id = ${id} AND status = 'Pending'
      RETURNING driver_id, destination
    `;
    if (updated.length === 0) return { error: ALREADY_HANDLED, alreadyHandled: true };

    const driverId = updated[0].driver_id;
    const place = updated[0].destination ? String(updated[0].destination).split(' (')[0] : 'destination';

    await sql`
      INSERT INTO notifications (title, message, target_user_id, target_role)
      VALUES (
        'Journey Approved',
        ${`Trip TRP-${id} to ${place} approved with FastTrack code: ${fastTrackCode}`},
        ${driverId || null},
        'driver'
      )
    `;

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
    return { success: true };
  } catch (error) {
    console.error('Approval failed:', error);
    return { error: 'Failed to approve trip' };
  }
}

export async function declineTripAction(tripId: number | string) {
  const id = parseId(tripId);
  if (!id) return { error: 'Invalid trip ID' };

  try {
    await ensureNotificationsTable();

    const updated = await sql`
      UPDATE trips
      SET status = 'Declined'
      WHERE id = ${id} AND status = 'Pending'
      RETURNING driver_id, destination
    `;
    if (updated.length === 0) return { error: ALREADY_HANDLED, alreadyHandled: true };

    const driverId = updated[0].driver_id;
    const place = updated[0].destination ? String(updated[0].destination).split(' (')[0] : 'destination';

    await sql`
      INSERT INTO notifications (title, message, target_user_id, target_role)
      VALUES (
        'Journey Declined',
        ${`Trip TRP-${id} to ${place} request was declined.`},
        ${driverId || null},
        'driver'
      )
    `;

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/driver');
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
      RETURNING destination, driver_id
    `;
    if (updated.length === 0) return { error: ALREADY_HANDLED, alreadyHandled: true };

    const nameRows = await sql`SELECT name FROM users WHERE id = ${updated[0].driver_id} LIMIT 1`;
    const driverName = nameRows[0]?.name || 'Driver';
    const place = updated[0].destination ? String(updated[0].destination).split(' (')[0] : 'destination';

    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES ('Journey Cancelled', ${`Trip TRP-${id} to ${place} by ${driverName} was cancelled.`}, 'all')
    `;

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
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
    await ensureNotificationsTable();

    let updated: any[];
    try {
      updated = await sql`
        UPDATE trips
        SET status = 'En Route', is_started = true, started_at = COALESCE(started_at, NOW())
        WHERE id = ${id} AND status = 'Active'
        RETURNING driver_id, destination
      `;
    } catch {
      updated = await sql`
        UPDATE trips
        SET status = 'En Route', is_started = true
        WHERE id = ${id} AND status = 'Active'
        RETURNING driver_id, destination
      `;
    }
    if (updated.length === 0) return { error: ALREADY_HANDLED, alreadyHandled: true };

    const nameRows = await sql`SELECT name FROM users WHERE id = ${updated[0].driver_id} LIMIT 1`;
    const driverName = nameRows[0]?.name || 'Driver';
    const place = updated[0].destination ? String(updated[0].destination).split(' (')[0] : 'destination';

    await sql`
      INSERT INTO notifications (title, message, target_role)
      VALUES ('Journey Started', ${`${driverName} started the journey to ${place} (TRP-${id}).`}, 'manager')
    `;

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
    return { success: true };
  } catch (error) {
    console.error('Start trip failed:', error);
    return { error: 'Failed to start trip' };
  }
}

// End Trip Action (supports both direct invocations and form actions)
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
    await ensureNotificationsTable();

    let updated: any[];
    try {
      if (driverId) {
        updated = await sql`
          UPDATE trips
          SET status = 'Completed', ended_at = NOW()
          WHERE id = ${tripId} AND driver_id = ${driverId} AND status IN ('Active', 'En Route')
          RETURNING id, destination, driver_id
        `;
      } else {
        updated = await sql`
          UPDATE trips
          SET status = 'Completed', ended_at = NOW()
          WHERE id = ${tripId} AND status IN ('Active', 'En Route')
          RETURNING id, destination, driver_id
        `;
      }
    } catch {
      // Fallback if 'ended_at' column does not exist
      if (driverId) {
        updated = await sql`
          UPDATE trips
          SET status = 'Completed'
          WHERE id = ${tripId} AND driver_id = ${driverId} AND status IN ('Active', 'En Route')
          RETURNING id, destination, driver_id
        `;
      } else {
        updated = await sql`
          UPDATE trips
          SET status = 'Completed'
          WHERE id = ${tripId} AND status IN ('Active', 'En Route')
          RETURNING id, destination, driver_id
        `;
      }
    }

    if (updated.length > 0) {
      const resolvedDriverId = updated[0].driver_id;
      const driverRows = await sql`SELECT name FROM users WHERE id = ${resolvedDriverId} LIMIT 1`;
      const driverName = driverRows[0]?.name || 'Driver';
      const place = updated[0].destination ? String(updated[0].destination).split(' (')[0] : 'destination';

      await sql`
        INSERT INTO notifications (title, message, target_role)
        VALUES (
          'Trip Completed',
          ${`${driverName} has ended the trip to ${place} (TRP-${tripId}).`},
          'manager'
        )
      `;
    }

    revalidatePath('/dashboard/driver');
    revalidatePath('/dashboard/manager');
    return { success: true };
  } catch (error) {
    console.error('Failed to end trip:', error);
    return { error: 'Failed to end trip' };
  }
}
