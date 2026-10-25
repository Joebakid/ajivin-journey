'use server';

import { sql } from '@/src/lib/db';

export interface TripLiveStatus {
  live: boolean;
  status: string | null;
  startedAt?: string | null;
}

// A trip is "live" only while it is in transit and has not been ended or cancelled
export async function getTripLiveStatusAction(
  tripId: number | string
): Promise<TripLiveStatus | null> {
  const parsedId = typeof tripId === 'string' ? parseInt(tripId, 10) : tripId;
  if (!parsedId || isNaN(parsedId)) return { live: false, status: null };

  try {
    let rows: any[];

    // Attempt to query with ended_at and started_at
    try {
      rows = await sql`
        SELECT status, is_started, ended_at, started_at
        FROM trips
        WHERE id = ${parsedId}
        LIMIT 1
      `;
    } catch {
      // Fallback query if 'ended_at' or 'started_at' columns are missing in DB
      rows = await sql`
        SELECT status, is_started
        FROM trips
        WHERE id = ${parsedId}
        LIMIT 1
      `;
    }

    const trip = rows[0];
    if (!trip) return { live: false, status: null };

    // Trip is considered finished if Completed, Cancelled, or Declined
    const isTerminated = ['Completed', 'Cancelled', 'Declined'].includes(trip.status);
    const hasEndedTimestamp = Boolean(trip.ended_at);

    const live =
      !isTerminated &&
      !hasEndedTimestamp &&
      (trip.status === 'En Route' || (trip.status === 'Active' && Boolean(trip.is_started)));

    return {
      live,
      status: trip.status,
      startedAt: trip.started_at ? new Date(trip.started_at).toISOString() : null,
    };
  } catch (error) {
    console.error('Failed to check trip status:', error);
    return null;
  }
}
