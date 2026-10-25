'use client';

import { useState } from 'react';

export default function CallDriverButton({ driverName, phoneNumber }: { driverName: string, phoneNumber: string }) {
  const [callState, setCallState] = useState<'idle' | 'dialing' | 'connected'>('idle');

  const initiateCall = async () => {
    setCallState('dialing');

    // Example API call to your VoIP provider (e.g., Twilio)
    // const response = await fetch('/api/call/token', { method: 'POST', body: JSON.stringify({ to: phoneNumber }) });

    // Simulate connection delay
    setTimeout(() => {
      setCallState('connected');
    }, 2000);
  };

  const endCall = () => {
    setCallState('idle');
    // Logic to terminate the VoIP connection
  };

  if (callState === 'connected') {
    return (
      <button
        onClick={endCall}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-sm transition-colors flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
        End Call with {driverName}
      </button>
    );
  }

  return (
    <button
      onClick={initiateCall}
      disabled={callState === 'dialing'}
      className="px-6 py-2 bg-ajivin-green hover:bg-green-800 text-white font-medium rounded-sm transition-all disabled:opacity-70 flex items-center gap-2"
    >
      {callState === 'dialing' ? 'Dialing...' : `Call ${driverName}`}
    </button>
  );
}
