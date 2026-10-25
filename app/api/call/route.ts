import { NextResponse } from 'next/server';
import {
  startCallAction,
  getIncomingCallAction,
  getCallStateAction,
  answerCallAction,
  addCandidateAction,
  endCallAction,
} from '@/app/actions/call';

export const dynamic = 'force-dynamic';

// Call signalling over a normal API route, so the 1-second call polling no longer queues
// behind (or blocks) other Server Actions.
export async function POST(request: Request) {
  try {
    const body = await request.json();

    switch (body?.action) {
      case 'start':
        return NextResponse.json(await startCallAction(Number(body.callerId), Number(body.calleeId), body.offer));
      case 'incoming':
        return NextResponse.json(await getIncomingCallAction(Number(body.userId)));
      case 'state':
        return NextResponse.json(await getCallStateAction(Number(body.callId)));
      case 'answer':
        return NextResponse.json({ ok: await answerCallAction(Number(body.callId), Number(body.calleeId), body.answer) });
      case 'candidate':
        await addCandidateAction(Number(body.callId), body.role === 'callee' ? 'callee' : 'caller', body.candidate);
        return NextResponse.json({ ok: true });
      case 'end':
        await endCallAction(Number(body.callId), Number(body.userId), body.reason);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Call API error:', error);
    return NextResponse.json({ error: 'Call request failed' }, { status: 500 });
  }
}
