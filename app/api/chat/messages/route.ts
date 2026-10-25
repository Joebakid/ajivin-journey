import { NextResponse } from 'next/server';
import { listMessages } from '@/src/lib/messagesDb';

export const dynamic = 'force-dynamic';

// GET /api/chat/messages?userId=1&peerId=2&afterId=0   (peerId 0 = fleet broadcast)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = parseInt(searchParams.get('userId') ?? '', 10);
  const peerId = parseInt(searchParams.get('peerId') ?? '0', 10) || 0;
  const afterId = parseInt(searchParams.get('afterId') ?? '0', 10) || 0;

  if (!userId) return NextResponse.json({ messages: [], error: 'Missing userId' }, { status: 400 });

  try {
    const messages = await listMessages(userId, peerId, afterId);
    return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to list messages:', error);
    return NextResponse.json({ messages: [], error: 'Failed to load messages' }, { status: 500 });
  }
}
