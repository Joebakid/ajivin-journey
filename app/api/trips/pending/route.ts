import { NextResponse } from 'next/server';
import { sql } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/trips/pending  ->  { trips: [...] }
// Lets the approvals card stay current without re-rendering the whole manager page.
export async function GET() {
  try {
    const trips = await sql`
      SELECT t.id, t.destination, t.created_at, u.name AS driver_name, u.phone
      FROM trips t
      JOIN users u ON t.driver_id = u.id
      WHERE t.status = 'Pending'
      ORDER BY t.created_at DESC
    `;
    return NextResponse.json({ trips }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to list pending trips:', error);
    return NextResponse.json({ trips: [], error: 'Failed to load requests' }, { status: 500 });
  }
}
