import { NextResponse } from 'next/server';
import { sql } from '@/src/lib/db';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET /api/presence?ids=1,2,3  ->  { online: { "1": true, "2": false, ... } }
// A user counts as online only if their heartbeat arrived within the last 25 seconds.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('ids') ?? '';
  const ids = Array.from(
    new Set(
      raw
        .split(',')
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  ).slice(0, 100);

  if (ids.length === 0) return NextResponse.json({ online: {} });

  try {
    const rows = await sql`
      SELECT id,
             (is_online = true AND last_seen IS NOT NULL AND last_seen > NOW() - INTERVAL '25 seconds') AS online
      FROM users
      WHERE id = ANY(${ids}::int[])
    `;
    const online: Record<string, boolean> = {};
    for (const id of ids) online[String(id)] = false;
    for (const r of rows as any[]) online[String(r.id)] = r.online === true;
    return NextResponse.json({ online }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Presence lookup error:', error);
    return NextResponse.json({ online: {} }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let body: any = {};
    const text = await req.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }

    const userId = body.userId ? parseInt(body.userId, 10) : null;
    const status = body.status; // 'online' | 'away' | 'offline'

    if (!userId || isNaN(userId)) {
      return NextResponse.json({ error: 'Missing or invalid userId' }, { status: 400 });
    }

    // Tab or browser closed: mark offline right away, but keep the login session
    if (status === 'away') {
      await sql`
        UPDATE users 
        SET is_online = false, last_seen = NOW() 
        WHERE id = ${userId}
      `;

      return NextResponse.json({ success: true, status: 'away' });
    }

    if (status === 'offline') {
      // 1. Immediately mark offline in database
      await sql`
        UPDATE users 
        SET is_online = false, last_seen = NOW() 
        WHERE id = ${userId}
      `;

      // 2. Clear authentication session cookies (explicit logout)
      try {
        const cookieStore = await cookies();
        cookieStore.delete('userId');
        cookieStore.delete('userRole');
      } catch {}

      return NextResponse.json({ success: true, status: 'offline' });
    } else {
      // 1. Heartbeat ping: mark user online and refresh last_seen
      await sql`
        UPDATE users 
        SET is_online = true, last_seen = NOW() 
        WHERE id = ${userId}
      `;

      // 2. Sweep: Automatically mark ghost users offline if last_seen > 25 seconds ago
      await sql`
        UPDATE users 
        SET is_online = false 
        WHERE is_online = true AND last_seen < NOW() - INTERVAL '25 seconds'
      `;

      return NextResponse.json({ success: true, status: 'online' });
    }
  } catch (error) {
    console.error('Presence API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
