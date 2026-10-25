// Browser-side wrapper for /api/call. Same function names and shapes the call screen used before.

type Sdp = { type: string; sdp: string };
type IceCandidate = Record<string, unknown>;

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    keepalive: true,
  });
  if (!res.ok) throw new Error(`Call request failed (${res.status})`);
  return (await res.json()) as T;
}

export function startCallAction(callerId: number, calleeId: number, offer: Sdp) {
  return post<{ ok: true; callId: number } | { ok: false; reason: 'busy' | 'error' }>({
    action: 'start',
    callerId,
    calleeId,
    offer,
  });
}

export function getIncomingCallAction(userId: number) {
  return post<{ id: number; callerId: number; callerName: string; offer: Sdp } | null>({ action: 'incoming', userId });
}

export function getCallStateAction(callId: number) {
  return post<{
    status: string;
    answer: Sdp | null;
    callerCandidates: IceCandidate[];
    calleeCandidates: IceCandidate[];
  } | null>({ action: 'state', callId });
}

export async function answerCallAction(callId: number, calleeId: number, answer: Sdp): Promise<boolean> {
  const res = await post<{ ok: boolean }>({ action: 'answer', callId, calleeId, answer });
  return res.ok === true;
}

export async function addCandidateAction(callId: number, role: 'caller' | 'callee', candidate: IceCandidate): Promise<void> {
  await post({ action: 'candidate', callId, role, candidate });
}

export async function endCallAction(
  callId: number,
  userId: number,
  reason: 'ended' | 'declined' | 'cancelled' | 'missed'
): Promise<void> {
  await post({ action: 'end', callId, userId, reason });
}
