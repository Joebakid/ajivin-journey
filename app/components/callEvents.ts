// Shared helpers so any button (chat header, "Call driver", etc.) can start a call
// through the single <CallManager /> mounted on the page.

export const START_CALL_EVENT = 'ajms:start-call';

export interface StartCallDetail {
  userId: number;
  name: string;
}

export function requestCall(detail: StartCallDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<StartCallDetail>(START_CALL_EVENT, { detail }));
}

/* ------------------------------ Call log text ----------------------------- */

// New call logs use a plain-text marker so they never depend on file encoding.
export const CALL_LOG_PREFIX = '[call] ';

// Older logs were saved with a phone emoji (or its garbled form), so keep recognising them.
const LEGACY_EMOJI = '\u{1F4DE}';
const LEGACY_GARBLED = '\u00F0\u0178\u201C\u017E';

export function isCallLogText(text?: string | null): boolean {
  if (!text) return false;
  return text.startsWith(CALL_LOG_PREFIX) || text.startsWith(LEGACY_EMOJI) || text.startsWith(LEGACY_GARBLED);
}

export function stripCallPrefix(text: string): string {
  for (const prefix of [CALL_LOG_PREFIX, LEGACY_EMOJI, LEGACY_GARBLED]) {
    if (text.startsWith(prefix)) return text.slice(prefix.length).trim();
  }
  return text;
}