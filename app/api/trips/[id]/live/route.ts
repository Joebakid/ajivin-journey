import { NextResponse } from 'next/server';
import { sql } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/trips/:id/live
// One lightweight call that tells the map everything it needs: is the trip still live,
// when did it start, and where is the vehicle. A trip is live only while it has been started
// and the driver has not ended it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (!tripId) return NextResponse.json({ error: 'Invalid trip id' }, { status: 400 });

  try {
    let rows: any[];
    try {
      rows = await sql`
        SELECT status, is_started, ended_at, current_location, started_at
        FROM trips WHERE id = ${tripId} LIMIT 1
      `;
    } catch {
      // Older database without started_at / ended_at columns
      rows = await sql`
        SELECT status, is_started, current_location, NULL AS ended_at, NULL AS started_at
        FROM trips WHERE id = ${tripId} LIMIT 1
      `;
    }

    const trip = rows[0];
    if (!trip) {
      return NextResponse.json({ live: false, status: null, started_at: null, current_location: null });
    }

    const live = !trip.ended_at && (trip.status === 'En Route' || (trip.status === 'Active' && !!trip.is_started));

    return NextResponse.json(
      {
        live,
        status: trip.status,
        started_at: trip.started_at ?? null,
        current_location: trip.current_location ?? null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Failed to load trip live status:', error);
    return NextResponse.json({ error: 'Failed to load trip' }, { status: 500 });
  }
}
