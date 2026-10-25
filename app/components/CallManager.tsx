'use client';

import { useEffect, useRef, useState } from 'react';
import {
  startCallAction,
  getIncomingCallAction,
  getCallStateAction,
  answerCallAction,
  addCandidateAction,
  endCallAction,
} from './callApi';
import { START_CALL_EVENT, CALL_LOG_PREFIX, type StartCallDetail } from './callEvents';

type Phase = 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected';
type Role = 'caller' | 'callee';
type Peer = { id: number; name: string };

const RING_TIMEOUT_MS = 40000;
const END_STATUSES = ['ended', 'declined', 'cancelled', 'missed'];

// STUN alone works on many networks, but mobile data in particular often needs a TURN relay.
// Add NEXT_PUBLIC_TURN_URL / _USERNAME / _CREDENTIAL to .env.local to enable one.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ...(process.env.NEXT_PUBLIC_TURN_URL
    ? [
        {
          urls: process.env.NEXT_PUBLIC_TURN_URL,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
        } as RTCIceServer,
      ]
    : []),
];

const MIC_ERROR =
  'Could not access the microphone. Allow microphone access in your browser (the site must use HTTPS or localhost).';

const formatTimer = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

async function getMic(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch {
    return null;
  }
}

export default function CallManager({ userId }: { userId: number }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [peer, setPeer] = useState<Peer | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // Mirrors of state that the timers and WebRTC callbacks need to read
  const phaseRef = useRef<Phase>('idle');
  const peerRef = useRef<Peer | null>(null);
  const roleRef = useRef<Role>('caller');
  const callIdRef = useRef<number | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollBusyRef = useRef(false);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toneRef = useRef<{ stop: () => void } | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  const remoteDescSetRef = useRef(false);
  const appliedCandidatesRef = useRef(0);
  const queuedCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const connectedAtRef = useRef<number | null>(null);

  // Latest versions of the handlers, so intervals and listeners never use stale closures
  const fnsRef = useRef<{
    placeCall: (d: StartCallDetail) => Promise<void>;
    pollState: () => Promise<void>;
  } | null>(null);

  /* ------------------------------- Helpers -------------------------------- */

  const go = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
  };

  const stopTone = () => {
    toneRef.current?.stop();
    toneRef.current = null;
  };

  // Ringing sound made with the Web Audio API, so no audio files are needed
  const startTone = (freqs: [number, number], onMs: number, offMs: number) => {
    stopTone();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx: AudioContext = new AudioCtx();
      const gain = ctx.createGain();
      const volume = 0.06;
      gain.gain.value = volume;

      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.frequency.value = freqs[0];
      o2.frequency.value = freqs[1];
      o1.connect(gain);
      o2.connect(gain);
      gain.connect(ctx.destination);
      o1.start();
      o2.start();
      ctx.resume?.().catch(() => {});

      let on = true;
      let timer: ReturnType<typeof setTimeout>;
      const tick = () => {
        on = !on;
        gain.gain.value = on ? volume : 0;
        timer = setTimeout(tick, on ? onMs : offMs);
      };
      timer = setTimeout(tick, onMs);

      toneRef.current = {
        stop: () => {
          clearTimeout(timer);
          try {
            o1.stop();
            o2.stop();
            ctx.close();
          } catch {}
        },
      };
    } catch {}
  };

  const teardown = () => {
    stopTone();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = null;

    const pc = pcRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {}
    }
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    callIdRef.current = null;
    remoteDescSetRef.current = false;
    appliedCandidatesRef.current = 0;
    queuedCandidatesRef.current = [];
    pendingOfferRef.current = null;
    connectedAtRef.current = null;
    pollBusyRef.current = false;

    if (originalTitleRef.current !== null) {
      document.title = originalTitleRef.current;
      originalTitleRef.current = null;
    }
    setMuted(false);
    setSeconds(0);
  };

  const logCall = async (receiverId: number, text: string) => {
    const fd = new FormData();
    fd.append('senderId', String(userId));
    fd.append('receiverId', String(receiverId));
    fd.append('text', CALL_LOG_PREFIX + text);
    try {
      await fetch('/api/chat/send', { method: 'POST', body: fd });
    } catch {}
  };

  // Only the caller writes the call record into the chat, so each call is logged once
  const callLogText = (): string | null => {
    if (roleRef.current !== 'caller') return null;
    const at = connectedAtRef.current;
    return at
      ? `Voice Call ended (${formatTimer(Math.round((Date.now() - at) / 1000))})`
      : 'Missed Call (Not picked)';
  };

  const endLocally = (message: string | null, logText: string | null) => {
    if (phaseRef.current === 'idle') return;
    const peerNow = peerRef.current;
    teardown();
    go('idle');
    peerRef.current = null;
    setPeer(null);
    if (message) showNotice(message);
    if (logText && peerNow) logCall(peerNow.id, logText);
  };

  const failCall = (message: string) => {
    const id = callIdRef.current;
    if (id) endCallAction(id, userId, 'ended').catch(() => {});
    endLocally(message, callLogText());
  };

  const handleRemoteEnd = (status: string) => {
    const wasIncoming = phaseRef.current === 'incoming';
    if (roleRef.current === 'callee') {
      endLocally(wasIncoming ? `Missed call from ${peerRef.current?.name ?? 'caller'}` : 'Call ended', null);
      return;
    }
    if (status === 'declined') {
      endLocally('Call declined', 'Call declined');
      return;
    }
    endLocally('Call ended', callLogText());
  };

  const createPeerConnection = (role: Role) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const init = e.candidate.toJSON();
      const id = callIdRef.current;
      if (id) addCandidateAction(id, role, init as Record<string, unknown>).catch(() => {});
      else queuedCandidatesRef.current.push(init); // call row not created yet
    };

    pc.ontrack = (e) => {
      const audio = remoteAudioRef.current;
      if (!audio) return;
      audio.srcObject = e.streams[0];
      audio.play().catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        stopTone();
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        if (!connectedAtRef.current) connectedAtRef.current = Date.now();
        go('connected');
      } else if (state === 'failed') {
        failCall('The call could not connect. Check your internet connection and try again.');
      } else if (state === 'disconnected') {
        // Brief drops often recover on their own, so wait before giving up
        setTimeout(() => {
          if (pcRef.current === pc && pc.connectionState !== 'connected') {
            failCall('Call lost. The connection dropped.');
          }
        }, 8000);
      }
    };

    return pc;
  };

  /* ------------------------------ Caller flow ----------------------------- */

  const placeCall = async (detail: StartCallDetail) => {
    if (phaseRef.current !== 'idle') {
      showNotice('You are already on a call');
      return;
    }
    if (detail.userId === userId || !detail.userId) return;

    roleRef.current = 'caller';
    peerRef.current = { id: detail.userId, name: detail.name };
    setPeer(peerRef.current);
    go('calling');

    const stream = await getMic();
    if (!stream) {
      endLocally(MIC_ERROR, null);
      return;
    }
    if (phaseRef.current !== 'calling') {
      stream.getTracks().forEach((t) => t.stop()); // caller hung up while the browser asked for the mic
      return;
    }
    localStreamRef.current = stream;

    const pc = createPeerConnection('caller');
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await startCallAction(userId, detail.userId, { type: offer.type, sdp: offer.sdp ?? '' });

      if (phaseRef.current !== 'calling') {
        if (res.ok) endCallAction(res.callId, userId, 'cancelled').catch(() => {});
        return;
      }
      if (!res.ok) {
        endLocally(
          res.reason === 'busy' ? `${detail.name} is on another call` : 'Could not place the call. Try again.',
          null
        );
        return;
      }

      callIdRef.current = res.callId;
      queuedCandidatesRef.current.forEach((c) =>
        addCandidateAction(res.callId, 'caller', c as Record<string, unknown>).catch(() => {})
      );
      queuedCandidatesRef.current = [];

      startTone([440, 480], 2000, 4000); // ringback the caller hears
      pollRef.current = setInterval(() => fnsRef.current?.pollState(), 1000);
      ringTimeoutRef.current = setTimeout(() => {
        if (phaseRef.current === 'calling' && callIdRef.current) {
          endCallAction(callIdRef.current, userId, 'missed').catch(() => {});
          endLocally('No answer', 'Missed Call (Not picked)');
        }
      }, RING_TIMEOUT_MS);
    } catch (error) {
      console.error('Failed to place call:', error);
      endLocally('Could not place the call. Try again.', null);
    }
  };

  /* ------------------------------ Callee flow ----------------------------- */

  const acceptCall = async () => {
    if (phaseRef.current !== 'incoming') return;
    const callId = callIdRef.current;
    const offer = pendingOfferRef.current;
    if (!callId || !offer) return;

    stopTone();
    if (originalTitleRef.current !== null) {
      document.title = originalTitleRef.current;
      originalTitleRef.current = null;
    }
    go('connecting');

    const stream = await getMic();
    if (!stream) {
      endCallAction(callId, userId, 'declined').catch(() => {});
      endLocally(MIC_ERROR, null);
      return;
    }
    if (phaseRef.current !== 'connecting') {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    localStreamRef.current = stream;

    const pc = createPeerConnection('callee');
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    try {
      await pc.setRemoteDescription(offer);
      remoteDescSetRef.current = true;
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const ok = await answerCallAction(callId, userId, { type: answer.type, sdp: answer.sdp ?? '' });
      if (!ok) endLocally('This call is no longer available', null);
    } catch (error) {
      console.error('Failed to accept call:', error);
      endCallAction(callId, userId, 'ended').catch(() => {});
      endLocally('Could not connect the call', null);
    }
  };

  const declineCall = () => {
    const id = callIdRef.current;
    if (id) endCallAction(id, userId, 'declined').catch(() => {});
    endLocally(null, null);
  };

  /* ------------------------------- Shared --------------------------------- */

  const hangUp = () => {
    const p = phaseRef.current;
    if (p === 'idle') return;
    if (p === 'incoming') {
      declineCall();
      return;
    }
    const id = callIdRef.current;
    if (id) {
      const reason = connectedAtRef.current || p === 'connecting' ? 'ended' : 'cancelled';
      endCallAction(id, userId, reason).catch(() => {});
    }
    endLocally(null, callLogText());
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
  };

  // Polls the call row: picks up the answer, remote network candidates, and the other side hanging up
  const pollState = async () => {
    if (pollBusyRef.current) return;
    const callId = callIdRef.current;
    if (!callId) return;
    pollBusyRef.current = true;

    try {
      const s = await getCallStateAction(callId);
      if (!s || callIdRef.current !== callId) return;

      if (END_STATUSES.includes(s.status)) {
        handleRemoteEnd(s.status);
        return;
      }

      // Another tab or device of this user answered while this one was still ringing
      if (roleRef.current === 'callee' && phaseRef.current === 'incoming' && s.status !== 'ringing') {
        endLocally(null, null);
        return;
      }

      const pc = pcRef.current;

      if (roleRef.current === 'caller' && s.status === 'accepted' && s.answer && pc && !remoteDescSetRef.current) {
        await pc.setRemoteDescription(s.answer as RTCSessionDescriptionInit);
        remoteDescSetRef.current = true;
        stopTone();
        if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
        if (phaseRef.current === 'calling') go('connecting');
      }

      if (pc && remoteDescSetRef.current) {
        const remote = roleRef.current === 'caller' ? s.calleeCandidates : s.callerCandidates;
        while (appliedCandidatesRef.current < remote.length) {
          const candidate = remote[appliedCandidatesRef.current++];
          try {
            await pc.addIceCandidate(candidate as RTCIceCandidateInit);
          } catch {}
        }
      }
    } catch {
      /* network blip: the next poll will try again */
    } finally {
      pollBusyRef.current = false;
    }
  };

  fnsRef.current = { placeCall, pollState };

  /* -------------------------------- Effects ------------------------------- */

  // Any button on the page can start a call by dispatching START_CALL_EVENT
  useEffect(() => {
    const handler = (e: Event) => {
      fnsRef.current?.placeCall((e as CustomEvent<StartCallDetail>).detail);
    };
    window.addEventListener(START_CALL_EVENT, handler);
    return () => window.removeEventListener(START_CALL_EVENT, handler);
  }, []);

  // While idle, keep checking whether someone is calling this user
  useEffect(() => {
    if (phase !== 'idle') return;
    let cancelled = false;

    const check = async () => {
      if (phaseRef.current !== 'idle') return;
      try {
        const incoming = await getIncomingCallAction(userId);
        if (cancelled || !incoming || phaseRef.current !== 'idle') return;

        roleRef.current = 'callee';
        callIdRef.current = incoming.id;
        peerRef.current = { id: incoming.callerId, name: incoming.callerName };
        setPeer(peerRef.current);
        pendingOfferRef.current = incoming.offer as RTCSessionDescriptionInit;
        appliedCandidatesRef.current = 0;
        remoteDescSetRef.current = false;
        go('incoming');

        startTone([480, 620], 1000, 2000);
        if (originalTitleRef.current === null) originalTitleRef.current = document.title;
        document.title = `Incoming call from ${incoming.callerName}`;
        try {
          navigator.vibrate?.([400, 200, 400]);
        } catch {}

        pollRef.current = setInterval(() => fnsRef.current?.pollState(), 1000);
      } catch {
        /* try again on the next tick */
      }
    };

    check();
    const id = setInterval(check, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, userId]);

  // Call timer
  useEffect(() => {
    if (phase !== 'connected') return;
    const id = setInterval(() => {
      if (connectedAtRef.current) setSeconds(Math.floor((Date.now() - connectedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Leaving the page mid-call hangs up
  useEffect(
    () => () => {
      const id = callIdRef.current;
      if (id) endCallAction(id, userId, 'ended').catch(() => {});
      teardown();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /* ---------------------------------- UI ---------------------------------- */

  const statusLabel =
    phase === 'calling'
      ? 'Calling...'
      : phase === 'incoming'
      ? 'Incoming voice call'
      : phase === 'connecting'
      ? 'Connecting...'
      : formatTimer(seconds);

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {notice && phase === 'idle' && (
        <div
          role="status"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] max-w-[90vw] bg-[#1a1f24] text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl border border-slate-700"
        >
          {notice}
        </div>
      )}

      {phase !== 'idle' && peer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Voice call"
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="bg-[#1a1f24] border border-slate-800 text-white rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="relative my-4">
              <div className="w-24 h-24 rounded-full bg-[#0a7337] flex items-center justify-center text-3xl font-extrabold uppercase border-4 border-slate-800 shadow-xl">
                {peer.name.charAt(0)}
              </div>
              {(phase === 'calling' || phase === 'incoming') && (
                <span className="absolute inset-0 rounded-full border-2 border-green-400 animate-ping opacity-60" />
              )}
            </div>

            <h3 className="text-xl font-bold text-slate-100 break-words max-w-full">{peer.name}</h3>
            <p className="text-xs text-slate-400 mt-1">AJMS voice call</p>

            <div className="my-5" aria-live="polite">
              {phase === 'connected' ? (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-950/80 border border-green-800 text-green-300 text-xs font-mono font-bold">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  {statusLabel}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  {statusLabel}
                </span>
              )}
            </div>

            {phase === 'incoming' ? (
              <div className="grid grid-cols-2 gap-4 w-full">
                <button
                  type="button"
                  onClick={declineCall}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-2xl text-sm transition-all shadow-lg active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={acceptCall}
                  className="bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3.5 rounded-2xl text-sm transition-all shadow-lg active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
                >
                  Accept
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 w-full mb-4">
                  <button
                    type="button"
                    onClick={toggleMute}
                    disabled={phase !== 'connected'}
                    className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border disabled:opacity-40 ${
                      muted
                        ? 'bg-amber-600 border-amber-500 text-white'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {muted ? 'Unmute microphone' : 'Mute microphone'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={hangUp}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-2xl text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                  </svg>
                  {phase === 'calling' ? 'Cancel call' : 'End call'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
