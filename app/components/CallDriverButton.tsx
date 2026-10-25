'use client';

import { useState, useEffect, useRef } from 'react';

interface CallModalProps {
  isOpen: boolean;
  recipientName: string;
  phoneNumber?: string | null;
  onClose: () => void;
}

export function InAppCallModal({ isOpen, recipientName, phoneNumber, onClose }: CallModalProps) {
  const [callState, setCallState] = useState<'ringing' | 'connected'>('ringing');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const ringToneRef = useRef<{ stop: () => void } | null>(null);

  // Play web audio ringback tone
  useEffect(() => {
    if (!isOpen) return;

    setCallState('ringing');
    setCallDuration(0);

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.value = 440;
        osc2.frequency.value = 480;
        gain.gain.value = 0.04;

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();

        ringToneRef.current = {
          stop: () => {
            try {
              osc1.stop();
              osc2.stop();
              ctx.close();
            } catch {}
          },
        };
      }
    } catch {}

    // Transition from Ringing to Connected after 2.5 seconds
    const timer = setTimeout(() => {
      if (ringToneRef.current) ringToneRef.current.stop();
      setCallState('connected');
    }, 2500);

    return () => {
      clearTimeout(timer);
      if (ringToneRef.current) ringToneRef.current.stop();
    };
  }, [isOpen]);

  // Track active call duration
  useEffect(() => {
    if (callState !== 'connected') return;

    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [callState]);

  if (!isOpen) return null;

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  const handleEndCall = () => {
    if (ringToneRef.current) ringToneRef.current.stop();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#1a1f24] border border-slate-800 text-white rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center relative animate-in fade-in zoom-in-95 duration-200">
        {/* Recipient Avatar */}
        <div className="relative my-4">
          <div className="w-24 h-24 rounded-full bg-[#0a7337] flex items-center justify-center text-3xl font-extrabold uppercase border-4 border-slate-800 shadow-xl">
            {recipientName.charAt(0)}
          </div>
          {callState === 'ringing' && (
            <span className="absolute inset-0 rounded-full border-2 border-green-400 animate-ping opacity-60"></span>
          )}
        </div>

        {/* Call Info */}
        <h3 className="text-xl font-bold text-slate-100">{recipientName}</h3>
        <p className="text-xs text-slate-400 font-mono mt-1">
          {phoneNumber ? phoneNumber : 'AJMS Dispatch VoIP'}
        </p>

        {/* Status / Live Duration */}
        <div className="my-5">
          {callState === 'ringing' ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
              Ringing...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-950/80 border border-green-800 text-green-300 text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              {formatTimer(callDuration)}
            </span>
          )}
        </div>

        {/* In-Call Controls */}
        <div className="grid grid-cols-2 gap-4 w-full mb-6">
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border ${
              isMuted
                ? 'bg-amber-600 border-amber-500 text-white'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isMuted ? 'Unmute Mic' : 'Mute Mic'}
          </button>

          <button
            type="button"
            onClick={() => setIsSpeaker(!isSpeaker)}
            className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border ${
              isSpeaker
                ? 'bg-[#0a7337] border-green-600 text-white'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isSpeaker ? 'Speaker On' : 'Speaker Off'}
          </button>
        </div>

        {/* End Call Button */}
        <button
          type="button"
          onClick={handleEndCall}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-2xl text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
          </svg>
          End Call
        </button>

        {/* Fallback to Cellular Call */}
        {phoneNumber && (
          <a
            href={`tel:${phoneNumber}`}
            className="mt-4 text-[11px] text-slate-400 hover:text-green-400 underline transition-colors"
          >
            Dial directly via Cellular Phone ({phoneNumber})
          </a>
        )}
      </div>
    </div>
  );
}

export default function CallDriverButton({
  driverName,
  phoneNumber,
}: {
  driverName: string;
  phoneNumber: string;
}) {
  const [showCallModal, setShowCallModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowCallModal(true)}
        className="px-5 py-2.5 bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
        Call {driverName}
      </button>

      <InAppCallModal
        isOpen={showCallModal}
        recipientName={driverName}
        phoneNumber={phoneNumber}
        onClose={() => setShowCallModal(false)}
      />
    </>
  );
}