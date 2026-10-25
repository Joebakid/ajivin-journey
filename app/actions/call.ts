// Call signalling logic. Called only from app/api/call/route.ts (not directly from the browser).

import { sql } from '@/src/lib/db';

type Sdp = { type: string; sdp: string };
type IceCandidate = Record<string, unknown>;

// Creates the table the first time it is needed, so no manual migration is required.
let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS calls (
          id SERIAL PRIMARY KEY,
          caller_id INTEGER NOT NULL,
          callee_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'ringing',
          offer JSONB,
          answer JSONB,
          caller_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
          callee_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          answered_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ,
          last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

/** Caller places a call. Returns the new call id, or busy if the other person is already on a call. */
export async function startCallAction(
  callerId: number,
  calleeId: number,
  offer: Sdp
): Promise<{ ok: true; callId: number } | { ok: false; reason: 'busy' | 'error' }> {
  try {
    await ensureTables();

    // Drop any stale ringing call this caller left behind
    await sql`
      UPDATE calls SET status = 'cancelled', ended_at = NOW()
      WHERE caller_id = ${callerId} AND status = 'ringing' AND ended_at IS NULL
    `;

    const busy = await sql`
      SELECT id FROM calls
      WHERE (callee_id = ${calleeId} OR caller_id = ${calleeId})
        AND ended_at IS NULL
        AND (
          (status = 'ringing' AND created_at > NOW() - INTERVAL '45 seconds')
          OR (status = 'accepted' AND last_seen > NOW() - INTERVAL '15 seconds')
        )
      LIMIT 1
    `;
    if (busy.length > 0) return { ok: false, reason: 'busy' };

    const rows = await sql`
      INSERT INTO calls (caller_id, callee_id, offer)
      VALUES (${callerId}, ${calleeId}, ${JSON.stringify(offer)}::jsonb)
      RETURNING id
    `;
    return { ok: true, callId: rows[0].id as number };
  } catch (error) {
    console.error('startCallAction failed:', error);
    return { ok: false, reason: 'error' };
  }
}

/** Callee polls for a call that is currently ringing for them. */
export async function getIncomingCallAction(
  userId: number
): Promise<{ id: number; callerId: number; callerName: string; offer: Sdp } | null> {
  try {
    await ensureTables();
    const rows = await sql`
      SELECT c.id, c.caller_id, u.name AS caller_name, c.offer
      FROM calls c
      JOIN users u ON u.id = c.caller_id
      WHERE c.callee_id = ${userId}
        AND c.status = 'ringing'
        AND c.ended_at IS NULL
        AND c.created_at > NOW() - INTERVAL '45 seconds'
      ORDER BY c.created_at DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, callerId: r.caller_id, callerName: r.caller_name || 'Unknown caller', offer: r.offer };
  } catch (error) {
    console.error('getIncomingCallAction failed:', error);
    return null;
  }
}

/** Both sides poll this while a call is in progress. It also marks the call as alive. */
export async function getCallStateAction(callId: number): Promise<{
  status: string;
  answer: Sdp | null;
  callerCandidates: IceCandidate[];
  calleeCandidates: IceCandidate[];
} | null> {
  try {
    const rows = await sql`
      UPDATE calls SET last_seen = NOW()
      WHERE id = ${callId}
      RETURNING status, answer, caller_candidates, callee_candidates
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      status: r.status,
      answer: r.answer ?? null,
      callerCandidates: r.caller_candidates ?? [],
      calleeCandidates: r.callee_candidates ?? [],
    };
  } catch (error) {
    console.error('getCallStateAction failed:', error);
    return null;
  }
}

/** Callee accepts: stores the answer so the caller can finish connecting. */
export async function answerCallAction(callId: number, calleeId: number, answer: Sdp): Promise<boolean> {
  try {
    const rows = await sql`
      UPDATE calls
      SET status = 'accepted', answer = ${JSON.stringify(answer)}::jsonb, answered_at = NOW(), last_seen = NOW()
      WHERE id = ${callId} AND callee_id = ${calleeId} AND status = 'ringing' AND ended_at IS NULL
      RETURNING id
    `;
    return rows.length > 0;
  } catch (error) {
    console.error('answerCallAction failed:', error);
    return false;
  }
}

/** Each side shares its network candidates so the two devices can find a path to each other. */
export async function addCandidateAction(
  callId: number,
  role: 'caller' | 'callee',
  candidate: IceCandidate
): Promise<void> {
  try {
    const payload = JSON.stringify([candidate]);
    if (role === 'caller') {
      await sql`UPDATE calls SET caller_candidates = caller_candidates || ${payload}::jsonb WHERE id = ${callId}`;
    } else {
      await sql`UPDATE calls SET callee_candidates = callee_candidates || ${payload}::jsonb WHERE id = ${callId}`;
    }
  } catch (error) {
    console.error('addCandidateAction failed:', error);
  }
}

/** Either side ends, declines, cancels or times out the call. */
export async function endCallAction(
  callId: number,
  userId: number,
  reason: 'ended' | 'declined' | 'cancelled' | 'missed'
): Promise<void> {
  try {
    await sql`
      UPDATE calls
      SET status = CASE WHEN status = 'accepted' THEN 'ended' ELSE ${reason} END,
          ended_at = NOW()
      WHERE id = ${callId}
        AND (caller_id = ${userId} OR callee_id = ${userId})
        AND ended_at IS NULL
    `;
  } catch (error) {
    console.error('endCallAction failed:', error);
  }
}
