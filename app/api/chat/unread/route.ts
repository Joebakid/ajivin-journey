import { NextResponse } from 'next/server';
import { sql } from '@/src/lib/db';
import { ensureMessagesTable } from '@/src/lib/messagesDb';

export const dynamic = 'force-dynamic';

// GET /api/chat/unread?userId=1  ->  { total, byPeer: { "2": 3, "5": 1 } }
// Only direct messages are counted (fleet broadcasts have no per-person read state).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = parseInt(searchParams.get('userId') ?? '', 10);
  if (!userId) return NextResponse.json({ total: 0, byPeer: {} }, { status: 400 });

  try {
    await ensureMessagesTable();
    const rows = await sql`
      SELECT sender_id, COUNT(*)::int AS count
      FROM messages
      WHERE receiver_id = ${userId} AND read_at IS NULL
      GROUP BY sender_id
    `;
    const byPeer: Record<string, number> = {};
    let total = 0;
    for (const r of rows as any[]) {
      byPeer[String(r.sender_id)] = r.count;
      total += r.count;
    }
    return NextResponse.json({ total, byPeer }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to count unread messages:', error);
    return NextResponse.json({ total: 0, byPeer: {} }, { status: 500 });
  }
}
