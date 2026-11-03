import { NextResponse } from 'next/server';
import { sql } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

let columnEnsured = false;
async function ensureColumn() {
  if (columnEnsured) return;
  try {
    await sql`ALTER TABLE trips ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ`;
    columnEnsured = true;
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
    const location = typeof body?.location === 'string' ? body.location : JSON.stringify(body?.location ?? '');
    if (!location) return NextResponse.json({ ok: false, error: 'Missing location' }, { status: 400 });

    await ensureColumn();

    let rows: any[];
    try {
      rows = await sql`
        UPDATE trips
        SET current_location = ${location}, location_updated_at = NOW()
        WHERE id = ${tripId}
          AND ended_at IS NULL
          AND status IN ('Active', 'En Route')
        RETURNING id
      `;
    } catch {
      // Column not available yet: still save the position
      rows = await sql`
        UPDATE trips
        SET current_location = ${location}
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