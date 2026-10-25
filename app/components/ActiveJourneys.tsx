'use client';

import { useState } from 'react';
import Link from 'next/link';
import MapSwitcher from '@/app/components/MapSwitcher';

export interface ActiveTrip {
  id: number;
  destination: string;
  status: string;
  fasttrack_code: string | null;
  current_location: string | null;
  is_started: boolean | null;
  started_at: string | null;
  driver_id: number;
  driver_name: string;
}

interface ActiveJourneysProps {
  trips: ActiveTrip[];
  initialTripId: number | null; // the trip to show first (null = the first one in the list)
}

// A trip is on the road once the driver has started it
const isLive = (t: ActiveTrip) => t.status === 'En Route' || (t.status === 'Active' && !!t.is_started);

export default function ActiveJourneys({ trips, initialTripId }: ActiveJourneysProps) {
  // Which trip the map shows is plain client state. Choosing another driver changes it on the spot:
  // no page navigation and no waiting for the server.
  const [selectedId, setSelectedId] = useState<number | null>(initialTripId);
  const selected = trips.find((t) => t.id === selectedId) ?? trips[0] ?? null;

  return (
    <>
      {/* The map: one trip at a time */}
      {selected && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Live Dispatch Map
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {selected.driver_name} &bull; {String(selected.destination).split(' (')[0]}
              </h3>
            </div>
            <span className="bg-green-100 text-[#0a7337] text-xs font-bold px-2.5 py-1 rounded-full self-start sm:self-center">
              TRP-{selected.id} &bull; {selected.status}
            </span>
          </div>

          {isLive(selected) ? (
            <MapSwitcher
              tripId={selected.id}
              currentLocation={selected.current_location}
              driverName={selected.driver_name}
              startedAt={selected.started_at}
              isManagerView={true}
            />
          ) : (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-6 text-center">
              {selected.driver_name} has not started this trip yet. The map appears as soon as they do.
            </p>
          )}
        </div>
      )}

      {/* Active & approved journeys list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-900">Active & In-Progress Journeys</h2>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          </div>
          <span className="bg-green-100 text-[#0a7337] text-xs font-bold px-2.5 py-0.5 rounded-full">
            {trips.length} Active
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {trips.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No active or in-progress journeys at this time.
            </div>
          ) : (
            trips.map((trip) => {
              const isSelected = selected?.id === trip.id;

              return (
                <div
                  key={trip.id}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    isSelected ? 'bg-green-50/50' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 text-sm">{trip.destination}</h3>
                      <span className="bg-green-100 text-[#0a7337] text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {trip.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                      <span>Driver: <strong className="text-slate-700">{trip.driver_name}</strong></span>
                      <span>FastTrack: <strong className="text-[#0a7337]">{trip.fasttrack_code || 'Pending'}</strong></span>
                      <span>Trip ID: TRP-{trip.id}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(trip.id)}
                      aria-pressed={isSelected}
                      className={`text-xs font-bold py-2 px-3 rounded-lg transition-all text-center ${
                        isSelected
                          ? 'bg-[#0a7337] text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {isSelected ? 'Viewing on Map' : 'Track on Map'}
                    </button>

                    <Link
                      href={`?userId=${trip.driver_id}`}
                      className="bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold py-2 px-3 rounded-lg transition-colors text-center"
                    >
                      Activity
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}