'use client';

import { useState, useRef, useEffect } from 'react';

interface VoiceNoteRecorderProps {
  onAudioReady: (file: File) => void;
  onCancel: () => void;
}

export default function VoiceNoteRecorder({ onAudioReady, onCancel }: VoiceNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    startRecording();
    return () => stopTimer();
  }, []);

  const startTimer = () => {
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `vn-${Date.now()}.webm`, { type: 'audio/webm' });
        onAudioReady(audioFile);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      startTimer();
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      alert('Could not access microphone.');
      onCancel();
    }
  };

  const handleStopAndSend = () => {
    stopTimer();
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex items-center gap-3 w-full bg-red-50 border border-red-200 px-4 py-2 rounded-full animate-pulse">
      <div className="flex items-center gap-2 flex-1">
        <span className="w-3 h-3 bg-red-600 rounded-full animate-ping"></span>
        <span className="text-xs font-bold text-red-700">Recording VN... ({formatTime(recordingTime)})</span>
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-slate-500 hover:text-slate-700 font-semibold px-2 py-1"
      >
        Cancel
      </button>

      <button
        type="button"
        onClick={handleStopAndSend}
        className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-xs transition-colors"
        title="Done / Add Voice Note"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>
    </div>
  );
}