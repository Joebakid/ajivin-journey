'use client';

import { useState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import ConfirmationModal from '@/app/components/ConfirmationModal';

export default function EndTripButton() {
  const { pending } = useFormStatus();
  const [showModal, setShowModal] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = () => {
    setShowModal(false);
    const form = buttonRef.current?.form || buttonRef.current?.closest('form');
    form?.requestSubmit();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        onClick={() => setShowModal(true)}
        className="w-full bg-[#1a1f24] hover:bg-black disabled:opacity-60 text-white font-bold py-3.5 rounded-xl text-sm transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
      >
        {pending ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <span>Ending trip...</span>
          </>
        ) : (
          'End Trip'
        )}
      </button>

      <ConfirmationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleConfirm}
        title="End Current Trip"
        message="Are you sure you want to end this trip? Your manager will be notified that the journey is complete and live GPS updates will stop."
        confirmText="Yes, End Trip"
        cancelText="Keep Going"
        variant="danger"
        isLoading={pending}
      />
    </>
  );
}
