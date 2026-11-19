// app/api/trips/[id]/live/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

// Adds the columns this route needs. Runs once per server process.
let columnsEnsured = false;
async function ensureColumns() {
  if (columnsEnsured) return;
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ`;
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`;
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS speed_limit_kmh INTEGER DEFAULT 100`;
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS max_speed_kmh NUMERIC`;
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS speeding BOOLEAN DEFAULT false`;
    columnsEnsured = true;
  } catch {
    /* try again on the next request */
  }
}

// GET /api/trips/:id/live
// One lightweight call that tells the map everything it needs: is the trip still live,
// when did it start, how long it has run (measured by the database clock), where the
// vehicle is, how old that position is (also measured by the database clock), and speed stats.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (!tripId) return NextResponse.json({ error: 'Invalid trip id' }, { status: 400 });

  try {
    await ensureColumns();

    let rows: any[];
    try {
      rows = await sql`
        SELECT
          status, is_started, ended_at, current_location, started_at,
          speed_limit_kmh, max_speed_kmh, speeding,
          CASE WHEN started_at IS NULL THEN NULL
               ELSE EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))::float8 END AS elapsed_seconds,
          CASE WHEN location_updated_at IS NULL THEN NULL
               ELSE EXTRACT(EPOCH FROM (NOW() - location_updated_at))::float8 END AS location_age_seconds
        FROM trips WHERE id = ${tripId} LIMIT 1
      `;
    } catch {
      try {
        rows = await sql`
          SELECT status, is_started, ended_at, current_location, started_at,
                 100 AS speed_limit_kmh, NULL AS max_speed_kmh, false AS speeding,
                 NULL AS elapsed_seconds, NULL AS location_age_seconds
          FROM trips WHERE id = ${tripId} LIMIT 1
        `;
      } catch {
        // Older database without started_at / ended_at columns
        rows = await sql`
          SELECT status, is_started, current_location, NULL AS ended_at, NULL AS started_at,
                 100 AS speed_limit_kmh, NULL AS max_speed_kmh, false AS speeding,
                 NULL AS elapsed_seconds, NULL AS location_age_seconds
          FROM trips WHERE id = ${tripId} LIMIT 1
        `;
      }
    }

    const trip = rows[0];
    if (!trip) {
      return NextResponse.json({
        live: false,
        status: null,
        started_at: null,
        current_location: null,
        elapsed_seconds: null,
        location_age_seconds: null,
        speed_limit_kmh: 100,
        max_speed_kmh: null,
        speeding: false,
      });
    }

    const live = !trip.ended_at && (trip.status === 'En Route' || (trip.status === 'Active' && !!trip.is_started));

    const toNum = (v: unknown) => (v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

    return NextResponse.json(
      {
        live,
        status: trip.status,
        started_at: trip.started_at ?? null,
        current_location: trip.current_location ?? null,
        elapsed_seconds: toNum(trip.elapsed_seconds),
        location_age_seconds: toNum(trip.location_age_seconds),
        speed_limit_kmh: toNum(trip.speed_limit_kmh) ?? 100,
        max_speed_kmh: toNum(trip.max_speed_kmh),
        speeding: Boolean(trip.speeding),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Failed to load trip live status:', error);
    return NextResponse.json({ error: 'Failed to load trip' }, { status: 500 });
  }
}