'use client';

import { useState, useEffect, useRef } from 'react';
import { approveTripAction, declineTripAction } from '@/app/actions/trip';
import { getLivePresenceAction } from '@/app/actions/presence';

export interface TripRequest {
  id: number;
  destination: string;
  driver_id?: number | null;
  requester_id?: number | null;
  scheduled_time?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  requester_name?: string | null;
  requester_phone?: string | null;
  created_at: string;
}

export interface DriverOption {
  id: number;
  name: string;
  phone?: string | null;
  plate_number?: string | null;
  is_busy?: boolean;
  active_trip_id?: number | null;
}

interface PendingApprovalsProps {
  initialTrips: TripRequest[];
  drivers?: DriverOption[];
}

export default function PendingApprovals({ initialTrips, drivers = [] }: PendingApprovalsProps) {
  const [trips, setTrips] = useState<TripRequest[]>(initialTrips);
  const [driverList, setDriverList] = useState<DriverOption[]>(drivers);
  const [selectedDrivers, setSelectedDrivers] = useState<Record<number, string>>({});
  const [isSubmittingId, setIsSubmittingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const resolvedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    setTrips(initialTrips.filter((t) => !resolvedRef.current.has(t.id)));
  }, [initialTrips]);

  useEffect(() => {
    if (drivers && drivers.length > 0) {
      setDriverList(drivers);
    } else {
      getLivePresenceAction().then((res: any) => {
        if (Array.isArray(res)) {
          setDriverList(
            res
              .filter((u: any) => (u.role || '').toLowerCase() === 'driver')
              .map((d: any) => ({
                id: d.id,
                name: d.name,
                phone: d.phone,
                plate_number: d.plate_number,
                is_busy: Boolean(d.is_busy),
                active_trip_id: d.active_trip_id || null,
              }))
          );
        }
      });
    }
  }, [drivers]);

  // Polling for fresh requests
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/trips/pending', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.trips)) {
          setTrips(data.trips.filter((t: TripRequest) => !resolvedRef.current.has(t.id)));
        }
      } catch {}
    };

    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleDriverChange = (tripId: number, driverId: string) => {
    setSelectedDrivers((prev) => ({ ...prev, [tripId]: driverId }));
  };

  const handleApprove = async (trip: TripRequest) => {
    setNotice(null);

    const assignedDriverId = selectedDrivers[trip.id] || (trip.driver_id ? String(trip.driver_id) : '');

    if (!assignedDriverId || assignedDriverId === 'unassigned') {
      setNotice({
        type: 'error',
        text: `Please select an available driver for trip TRP-${trip.id}.`,
      });
      return;
    }

    // Client-side guard for busy drivers
    const chosenDriver = driverList.find((d) => String(d.id) === assignedDriverId);
    if (chosenDriver?.is_busy) {
      setNotice({
        type: 'error',
        text: `${chosenDriver.name} is currently on an active trip (TRP-${chosenDriver.active_trip_id}). They must end their journey before taking a new assignment.`,
      });
      return;
    }

    setIsSubmittingId(trip.id);
    resolvedRef.current.add(trip.id);
    setTrips((prev) => prev.filter((t) => t.id !== trip.id));

    try {
      const res = await approveTripAction(trip.id, parseInt(assignedDriverId, 10));

      if (res?.error) {
        resolvedRef.current.delete(trip.id);
        setTrips((prev) => [trip, ...prev]);
        setNotice({ type: 'error', text: res.error });
      } else {
        setNotice({
          type: 'success',
          text: `Trip TRP-${trip.id} approved and assigned to driver ${chosenDriver?.name || 'Driver'}. FastTrack clearance issued!`,
        });
      }
    } catch (err) {
      console.error('Failed to approve trip:', err);
      resolvedRef.current.delete(trip.id);
      setTrips((prev) => [trip, ...prev]);
      setNotice({ type: 'error', text: 'Failed to approve trip. Please try again.' });
    } finally {
      setIsSubmittingId(null);
    }
  };

  const handleDecline = async (trip: TripRequest) => {
    setNotice(null);
    setIsSubmittingId(trip.id);
    resolvedRef.current.add(trip.id);
    setTrips((prev) => prev.filter((t) => t.id !== trip.id));

    try {
      const res = await declineTripAction(trip.id);
      if (res?.error) {
        resolvedRef.current.delete(trip.id);
        setTrips((prev) => [trip, ...prev]);
        setNotice({ type: 'error', text: res.error });
      } else {
        setNotice({ type: 'success', text: `Trip TRP-${trip.id} request was declined.` });
      }
    } catch (err) {
      console.error('Failed to decline trip:', err);
      resolvedRef.current.delete(trip.id);
      setTrips((prev) => [trip, ...prev]);
      setNotice({ type: 'error', text: 'Failed to decline trip.' });
    } finally {
      setIsSubmittingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
          </span>
          <h2 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Pending Journey Approvals
          </h2>
        </div>
        <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-orange-200">
          {trips.length} {trips.length === 1 ? 'Request' : 'Requests'}
        </span>
      </div>

      {notice && (
        <div
          className={`px-5 py-2.5 text-xs flex justify-between items-center border-b ${
            notice.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          <span className="break-words font-medium">{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            className="font-bold text-base leading-none ml-2 text-slate-400 hover:text-slate-700"
          >
            &times;
          </button>
        </div>
      )}

      <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto overflow-x-hidden">
        {trips.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic">
            No pending journey requests from drivers or staff.
          </div>
        ) : (
          trips.map((trip) => {
            const staffMatch = trip.destination.match(/\(Staff:\s*([^,]+)/i);
            const passengerName = trip.requester_name || (staffMatch ? staffMatch[1] : null);

            const timeMatch = trip.destination.match(/\[Time:\s*([^\]]+)\]/i);
            const scheduledTime = trip.scheduled_time || (timeMatch ? timeMatch[1] : 'Immediate');

            const isStaffBooking = Boolean(passengerName) || Boolean(trip.requester_id);
            const currentSelectedDriver = selectedDrivers[trip.id] || (trip.driver_id ? String(trip.driver_id) : '');

            return (
              <div
                key={trip.id}
                className="p-4 sm:p-5 flex flex-col gap-3.5 hover:bg-slate-50/80 transition-colors text-xs min-w-0"
              >
                {/* Trip Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 min-w-0">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300">
                        TRP-{trip.id}
                      </span>
                      {isStaffBooking ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase">
                          Staff Booking
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 uppercase">
                          Driver Self-Request
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm break-words leading-snug">
                      {trip.destination.split(' (')[0]}
                    </h3>
                    <p className="text-slate-500 text-[11px] break-words leading-relaxed">
                      {trip.destination}
                    </p>
                  </div>

                  <span className="text-[10px] text-slate-400 shrink-0 self-start sm:self-auto font-mono">
                    {new Date(trip.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Requester & Scheduled Time Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px]">
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">
                      {isStaffBooking ? 'Staff Passenger' : 'Requesting Driver'}
                    </span>
                    <span className="font-bold text-slate-800 block truncate">
                      {passengerName || trip.driver_name || 'Staff Member'}
                    </span>
                    {(trip.requester_phone || trip.driver_phone) && (
                      <span className="text-slate-500 block text-[10px] truncate mt-0.5">
                        📞 {trip.requester_phone || trip.driver_phone}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">
                      Requested Travel Time
                    </span>
                    <span className="font-bold text-[#0a7337] block truncate">
                      ⏰ {scheduledTime}
                    </span>
                  </div>
                </div>

                {/* Driver Picker: Disables any driver currently on a trip */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100 min-w-0">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <label className="text-[10px] font-bold uppercase text-slate-500 shrink-0 whitespace-nowrap">
                      Assign Driver:
                    </label>
                    <select
                      value={currentSelectedDriver}
                      onChange={(e) => handleDriverChange(trip.id, e.target.value)}
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white font-medium truncate"
                    >
                      <option value="unassigned">-- Choose Available Driver --</option>
                      {driverList.map((d) => (
                        <option
                          key={d.id}
                          value={d.id}
                          disabled={Boolean(d.is_busy)}
                          className={d.is_busy ? 'text-slate-400 bg-slate-100 italic' : 'text-slate-900 font-bold'}
                        >
                          {d.name} {d.plate_number ? `[${d.plate_number}]` : ''}{' '}
                          {d.is_busy ? `(BUSY - On TRP-${d.active_trip_id})` : '• Available'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    <button
                      type="button"
                      onClick={() => handleDecline(trip)}
                      disabled={isSubmittingId === trip.id}
                      className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 text-center"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(trip)}
                      disabled={isSubmittingId === trip.id}
                      className="flex-1 sm:flex-none px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[#0a7337] hover:bg-[#085a2b] text-white shadow-sm transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-1.5"
                    >
                      {isSubmittingId === trip.id ? (
                        <>
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Approving...</span>
                        </>
                      ) : (
                        'Approve & Assign'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}