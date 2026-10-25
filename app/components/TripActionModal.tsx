'use client';

interface TripRequest {
  id: number;
  destination: string;
  driver_name: string;
  phone: string | null;
  created_at: string;
}

interface TripActionModalProps {
  isOpen: boolean;
  type: 'approve' | 'decline' | null;
  trip: TripRequest | null;
  onClose: () => void;
  onConfirm: (tripId: number, type: 'approve' | 'decline') => Promise<void>;
  isSubmitting: boolean;
}

export default function TripActionModal({
  isOpen,
  type,
  trip,
  onClose,
  onConfirm,
  isSubmitting,
}: TripActionModalProps) {
  if (!isOpen || !trip || !type) return null;

  const isApprove = type === 'approve';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isApprove ? 'Confirm trip approval' : 'Confirm trip rejection'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden transform transition-all">
        {/* Header */}
        <div className={`p-5 flex items-center justify-between border-b ${
          isApprove ? 'bg-green-50 border-green-100 text-[#0a7337]' : 'bg-red-50 border-red-100 text-red-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
              isApprove ? 'bg-green-100 text-[#0a7337]' : 'bg-red-100 text-red-700'
            }`}>
              {isApprove ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                {isApprove ? 'Confirm Trip Approval' : 'Confirm Trip Rejection'}
              </h3>
              <p className="text-xs opacity-80">Trip Request #TRP-{trip.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 p-1 disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to {isApprove ? <strong className="text-[#0a7337]">approve</strong> : <strong className="text-red-600">decline</strong>} this journey request?
          </p>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500 shrink-0">Destination & Vehicle:</span>
              <span className="font-bold text-slate-900 text-right max-w-[200px] truncate">{trip.destination}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Driver:</span>
              <span className="font-semibold text-slate-800">{trip.driver_name}</span>
            </div>
            {trip.phone && (
              <div className="flex justify-between">
                <span className="text-slate-500">Driver Contact:</span>
                <span className="font-mono text-slate-700">{trip.phone}</span>
              </div>
            )}
          </div>

          {isApprove && (
            <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-lg">
              Approving will generate a FastTrack Clearance Code and enable driver GPS location tracking.
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => onConfirm(trip.id, type)}
            disabled={isSubmitting}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 flex items-center gap-2 ${
              isApprove 
                ? 'bg-[#0a7337] hover:bg-[#085a2b]' 
                : 'bg-red-600 hover:bg-red-700'
            } disabled:opacity-50`}
          >
            {isSubmitting ? (
              <span>Processing...</span>
            ) : (
              <span>{isApprove ? 'Yes, Approve Trip' : 'Yes, Decline Trip'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
