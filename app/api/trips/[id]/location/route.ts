// app/api/trips/[id]/location/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

let columnsEnsured = false;
async function ensureColumns() {
  if (columnsEnsured) return;
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ`;
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS speed_limit_kmh INTEGER DEFAULT 100`;
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS max_speed_kmh NUMERIC`;
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS speeding BOOLEAN DEFAULT false`;
    columnsEnsured = true;
  } catch {
    /* try again on the next request */
  }
}

// POST /api/trips/:id/location  { location: "<json string>" }
// Stamps the time on the server, so "last update" does not depend on the driver's phone clock.
// Ignored once the trip has ended, so a late GPS reading cannot overwrite a finished trip.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tripId = parseInt(id, 10);
  if (!tripId) return NextResponse.json({ ok: false, error: 'Invalid trip id' }, { status: 400 });

  try {
    const body = await request.json().catch(() => ({}));
    const locationStr = typeof body?.location === 'string' ? body.location : JSON.stringify(body?.location ?? '');
    if (!locationStr || locationStr === '""') return NextResponse.json({ ok: false, error: 'Missing location' }, { status: 400 });

    await ensureColumns();

    // Try to extract speed to update trip speeding stats
    let currentSpeedKmh = 0;
    try {
      const parsed = JSON.parse(locationStr);
      if (parsed.speedKmh != null && !isNaN(Number(parsed.speedKmh))) {
        currentSpeedKmh = Number(parsed.speedKmh);
      } else if (parsed.speed != null && !isNaN(Number(parsed.speed))) {
        currentSpeedKmh = Number(parsed.speed) * 3.6; // convert m/s to km/h
      }
    } catch {
      // Ignore parse errors, just use 0
    }

    let rows: any[];
    try {
      rows = await sql`
        UPDATE trips
        SET 
          current_location = ${locationStr}, 
          location_updated_at = NOW(),
          max_speed_kmh = GREATEST(COALESCE(max_speed_kmh, 0), ${currentSpeedKmh}),
          speeding = CASE WHEN ${currentSpeedKmh} > COALESCE(speed_limit_kmh, 100) THEN true ELSE speeding END
        WHERE id = ${tripId}
          AND ended_at IS NULL
          AND status IN ('Active', 'En Route')
        RETURNING id
      `;
    } catch {
      // Column not available yet: still save the position
      rows = await sql`
        UPDATE trips
        SET current_location = ${locationStr}
        WHERE id = ${tripId}
          AND ended_at IS NULL
          AND status IN ('Active', 'En Route')
        RETURNING id
      `;
    }
    return NextResponse.json({ ok: rows.length > 0 });
  } catch (error) {
    console.error('Failed to update trip location:', error);
    return NextResponse.json({ ok: false, error: 'Failed to update location' }, { status: 500 });
  }
}