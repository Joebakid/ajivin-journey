'use client';

import { useState, useEffect, useRef } from 'react';
import TripActionModal from '@/app/components/TripActionModal';
import { approveTripAction, declineTripAction } from '@/app/actions/trip';

interface TripRequest {
  id: number;
  destination: string;
  driver_name: string;
  phone: string | null;
  created_at: string;
}

export default function PendingApprovals({ initialTrips }: { initialTrips: TripRequest[] }) {
  const [trips, setTrips] = useState<TripRequest[]>(initialTrips);

  const [selectedTrip, setSelectedTrip] = useState<TripRequest | null>(null);
  const [modalType, setModalType] = useState<'approve' | 'decline' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Trips the manager has just approved or declined. A list that was already on its way from
  // the server (and still contains them) must never bring them back on screen.
  const resolvedRef = useRef<Set<number>>(new Set());
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showList = (list: TripRequest[]) => setTrips(list.filter((t) => !resolvedRef.current.has(t.id)));

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
  };

  // List handed down by the page
  useEffect(() => {
    showList(initialTrips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTrips]);

  // Light check for new requests. This replaces refreshing the whole manager page every 3 seconds.
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/trips/pending', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.trips)) showList(data.trips);
      } catch {
        /* try again on the next tick */
      }
    };

    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenModal = (trip: TripRequest, type: 'approve' | 'decline') => {
    if (isSubmitting) return;
    setSelectedTrip(trip);
    setModalType(type);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setSelectedTrip(null);
    setModalType(null);
  };

  const handleConfirmAction = async (argTripId?: unknown, argType?: unknown) => {
    if (isSubmitting) return;

    const targetTripId = typeof argTripId === 'number' && !isNaN(argTripId) ? argTripId : selectedTrip?.id;
    const targetType = argType === 'approve' || argType === 'decline' ? argType : modalType;
    if (!targetTripId || !targetType) return;

    const trip = trips.find((t) => t.id === targetTripId) || selectedTrip;

    // Remove it from the list straight away so it cannot be clicked twice
    setIsSubmitting(true);
    resolvedRef.current.add(targetTripId);
    setTrips((prev) => prev.filter((t) => t.id !== targetTripId));

    try {
      const result: any =
        targetType === 'approve' ? await approveTripAction(targetTripId) : await declineTripAction(targetTripId);

      if (result?.error) {
        if (result.alreadyHandled) {
          showNotice('That request was already handled, so nothing was changed.');
        } else {
          // Really failed: put it back so it can be tried again
          resolvedRef.current.delete(targetTripId);
          if (trip) setTrips((prev) => (prev.some((t) => t.id === trip.id) ? prev : [trip, ...prev]));
          showNotice(result.error);
        }
      }
    } catch (err) {
      console.error('Failed to execute action:', err);
      resolvedRef.current.delete(targetTripId);
      if (trip) setTrips((prev) => (prev.some((t) => t.id === trip.id) ? prev : [trip, ...prev]));
      showNotice('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
      setSelectedTrip(null);
      setModalType(null);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-900">Pending Journey Approvals</h2>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
          </div>
          <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {trips.length} Requests
          </span>
        </div>

        {notice && (
          <div role="status" className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex justify-between items-center">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="font-bold text-base leading-none">&times;</button>
          </div>
        )}

        <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto">
          {trips.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No pending driver journey requests.
            </div>
          ) : (
            trips.map((trip) => (
              <div 
                key={trip.id} 
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
              >
                <div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1">{trip.destination}</h3>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                    <span>Driver: <span className="font-semibold text-slate-700">{trip.driver_name}</span></span>
                    <span>Trip ID: TRP-{trip.id}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenModal(trip, 'decline')}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold py-2 px-3 rounded-lg transition-all active:scale-95 shadow-sm disabled:opacity-50"
                  >
                    Decline
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenModal(trip, 'approve')}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold py-2 px-4 rounded-lg transition-all active:scale-95 shadow-sm disabled:opacity-50"
                  >
                    Approve Request
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <TripActionModal
        isOpen={!!selectedTrip && !!modalType}
        type={modalType}
        trip={selectedTrip}
        onClose={handleCloseModal}
        onConfirm={handleConfirmAction}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
