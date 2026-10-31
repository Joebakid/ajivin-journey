'use client';

import { useState } from 'react';
import { addOrUpdateVehicleAction, switchActiveVehicleAction } from '@/app/actions/vehicle';

export interface VehicleRecord {
  id: number;
  driver_id: number;
  plate_number: string;
  model: string;
  is_active: boolean;
  created_at: string;
}

interface VehicleProps {
  driverId: number;
  vehicles: VehicleRecord[];
}

export default function Vehicle({ driverId, vehicles }: VehicleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const activeVehicle = vehicles.find((v) => v.is_active) || vehicles[0] || null;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-green-50 text-[#0a7337]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Assigned Vehicle</h3>
            <p className="text-[11px] text-slate-500">Tracked by plate number</p>
          </div>
        </div>

        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs font-bold text-[#0a7337] hover:underline"
        >
          {isEditing ? 'Close' : 'Change Car'}
        </button>
      </div>

      {/* Active Vehicle Card */}
      {activeVehicle ? (
        <div className="p-4 bg-green-50/40 rounded-xl border border-green-200/60 flex justify-between items-center">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Active Plate Number
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-black text-slate-900 px-2.5 py-0.5 bg-white border border-slate-300 rounded-md shadow-sm">
                {activeVehicle.plate_number}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-[#0a7337]">
                Assigned & Active
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 font-medium">{activeVehicle.model}</p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
          No vehicle currently assigned by dispatch. You can add your car below or wait for manager assignment.
        </div>
      )}

      {/* Update Vehicle / Plate Form */}
      {isEditing && (
        <form
          action={async (formData) => {
            await addOrUpdateVehicleAction(formData);
            setIsEditing(false);
          }}
          className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
        >
          <input type="hidden" name="driver_id" value={driverId} />
          <h4 className="text-xs font-bold text-slate-800 uppercase">Change Active Plate / Car</h4>
          <p className="text-[11px] text-slate-500">
            Changing your car updates dispatch and archives the previous vehicle in your history.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase">New Plate Number</label>
              <input
                name="plate_number"
                type="text"
                required
                placeholder="e.g. APP-502ZZ"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none font-mono uppercase bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase">Vehicle Model</label>
              <input
                name="model"
                type="text"
                placeholder="e.g. Scania G400"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="w-1/2 py-2 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-1/2 py-2 text-xs font-bold rounded-lg bg-[#0a7337] hover:bg-[#085a2b] text-white shadow-sm transition-all"
            >
              Save & Switch Car
            </button>
          </div>
        </form>
      )}

      {/* Vehicle History */}
      {vehicles.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            <span>Vehicle History ({vehicles.length})</span>
            <span>{showHistory ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs ${
                    v.is_active
                      ? 'bg-green-50/50 border-green-200'
                      : 'bg-white border-slate-200 opacity-80'
                  }`}
                >
                  <div>
                    <span className="font-mono font-bold text-slate-900 mr-2">{v.plate_number}</span>
                    <span className="text-slate-500 font-normal">{v.model}</span>
                    <span className="block text-[10px] text-slate-400">
                      Added: {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {v.is_active ? (
                    <span className="text-[10px] font-bold text-[#0a7337] bg-green-100 px-2 py-0.5 rounded-full">
                      Current
                    </span>
                  ) : (
                    <form action={switchActiveVehicleAction}>
                      <input type="hidden" name="driver_id" value={driverId} />
                      <input type="hidden" name="vehicle_id" value={v.id} />
                      <button
                        type="submit"
                        className="text-[11px] font-semibold text-slate-600 hover:text-[#0a7337] underline"
                      >
                        Switch Back
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}