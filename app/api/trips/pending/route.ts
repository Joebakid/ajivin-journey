import { NextResponse } from 'next/server';
import { sql } from '@/src/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/trips/pending -> { trips: [...] }
// Keeps the approvals card current without erasing staff-booked trips
export async function GET() {
  try {
    const trips = await sql`
      SELECT 
        t.id, 
        t.destination, 
        t.created_at, 
        t.driver_id,
        t.requester_id,
        t.scheduled_time,
        u.name AS driver_name, 
        u.phone AS driver_phone,
        req.name AS requester_name,
        req.phone AS requester_phone
      FROM trips t
      LEFT JOIN users u ON t.driver_id = u.id
      LEFT JOIN users req ON t.requester_id = req.id
      WHERE t.status = 'Pending'
      ORDER BY t.created_at DESC
    `;

    return NextResponse.json(
      { trips },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Failed to list pending trips:', error);
    return NextResponse.json(
      { trips: [], error: 'Failed to load requests' },
      { status: 500 }
    );
  }
}