import { NextResponse } from 'next/server';
import { sql } from '@/src/lib/db';
import { ensureMessagesTable } from '@/src/lib/messagesDb';

export const dynamic = 'force-dynamic';

// POST { userId, peerId }: everything peerId sent to userId is now read
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = parseInt(String(body?.userId ?? ''), 10);
    const peerId = parseInt(String(body?.peerId ?? ''), 10);
    if (!userId || !peerId) return NextResponse.json({ ok: false }, { status: 400 });

    await ensureMessagesTable();
    await sql`
      UPDATE messages SET read_at = NOW()
      WHERE receiver_id = ${userId} AND sender_id = ${peerId} AND read_at IS NULL
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to mark messages read:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
