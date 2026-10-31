'use client';

import { useState, useMemo } from 'react';
import {
  createVehicleDirectAction,
  updateVehicleDetailsAction,
  deleteVehicleAction,
  assignVehicleDriverAction,
  addVehicleExpenseAction,
  deleteVehicleExpenseAction,
  toggleVehicleStatusAction,
} from '@/app/actions/vehicle';

export interface VehicleWithDriver {
  id: number;
  driver_id: number | null;
  plate_number: string;
  model: string;
  is_active: boolean;
  created_at: string;
  driver_name: string | null;
  driver_phone: string | null;
}

export interface VehicleExpenseRecord {
  id: number;
  vehicle_id: number;
  expense_type: string;
  amount: number | string;
  description: string | null;
  logged_by_name: string | null;
  created_at: string;
}

interface VehicleFleetManagerProps {
  vehicles: VehicleWithDriver[];
  expenses: VehicleExpenseRecord[];
  drivers: Array<{ id: number; name: string; phone?: string | null }>;
}

export default function VehicleFleetManager({ vehicles, expenses, drivers }: VehicleFleetManagerProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoggingExpense, setIsLoggingExpense] = useState(false);
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const q = searchQuery.toLowerCase();
      return (
        v.plate_number.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.driver_name && v.driver_name.toLowerCase().includes(q))
      );
    });
  }, [vehicles, searchQuery]);

  const vehicleExpensesMap = useMemo(() => {
    const map = new Map<number, VehicleExpenseRecord[]>();
    for (const exp of expenses) {
      const list = map.get(exp.vehicle_id) || [];
      list.push(exp);
      map.set(exp.vehicle_id, list);
    }
    return map;
  }, [expenses]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || null;
  const currentVehicleExpenses = selectedVehicleId ? vehicleExpensesMap.get(selectedVehicleId) || [] : [];

  const selectedVehicleTotalSpent = currentVehicleExpenses.reduce(
    (sum, exp) => sum + parseFloat(String(exp.amount || 0)),
    0
  );

  const grandTotalFleetSpent = expenses.reduce(
    (sum, exp) => sum + parseFloat(String(exp.amount || 0)),
    0
  );

  // Handle Editing Vehicle Details (Plate Number & Model)
  const handleUpdateVehicle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalFeedback(null);

    const formData = new FormData(e.currentTarget);
    const res = await updateVehicleDetailsAction(formData);

    setIsSubmitting(false);
    setModalFeedback(res);

    if (res.success) {
      setTimeout(() => {
        setIsEditingVehicle(false);
        setModalFeedback(null);
      }, 1500);
    }
  };

  // Handle Deleting Vehicle
  const handleDeleteVehicle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setModalFeedback(null);

    const formData = new FormData(e.currentTarget);
    const res = await deleteVehicleAction(formData);

    setIsSubmitting(false);

    if (res.success) {
      setSelectedVehicleId(null);
      setIsConfirmingDelete(false);
      setModalFeedback(null);
    } else {
      setModalFeedback(res);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-5">
      {/* Header & Fleet Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-green-50 text-[#0a7337]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
            </span>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Fleet Vehicles & Maintenance</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Click any vehicle to view costs, change plate number, or manage status.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setIsAddingVehicle(true);
              setModalFeedback(null);
            }}
            className="inline-flex items-center gap-1.5 bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold py-2 px-3 rounded-xl shadow-sm transition-all active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Vehicle
          </button>
          <div className="h-7 w-[1px] bg-slate-200"></div>
          <div className="text-right">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Total Fleet Cost</span>
            <span className="text-sm font-extrabold text-[#0a7337]">
              ₦{grandTotalFleetSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="h-7 w-[1px] bg-slate-200"></div>
          <div className="text-right">
            <span className="block text-[10px] uppercase font-bold text-slate-400">Total Units</span>
            <span className="text-sm font-extrabold text-slate-800">{vehicles.length}</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by plate number, model, or driver..."
          className="w-full px-3.5 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0a7337] outline-none"
        />
      </div>

      {/* Vehicle Grid */}
      {filteredVehicles.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
          No vehicles found in fleet. Click <strong>Add Vehicle</strong> above to register a new car.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredVehicles.map((vehicle) => {
            const vExpenses = vehicleExpensesMap.get(vehicle.id) || [];
            const totalSpent = vExpenses.reduce((sum, e) => sum + parseFloat(String(e.amount || 0)), 0);

            return (
              <div
                key={vehicle.id}
                onClick={() => {
                  setSelectedVehicleId(vehicle.id);
                  setIsLoggingExpense(false);
                  setIsEditingVehicle(false);
                  setIsConfirmingDelete(false);
                  setModalFeedback(null);
                }}
                className={`p-4 rounded-xl border transition-all cursor-pointer text-left hover:shadow-md hover:border-[#0a7337]/50 ${
                  selectedVehicleId === vehicle.id
                    ? 'border-[#0a7337] bg-green-50/20 ring-2 ring-[#0a7337]/20'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-xs font-black tracking-wider text-slate-900 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded shadow-sm">
                    {vehicle.plate_number}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      vehicle.is_active ? 'bg-green-100 text-[#0a7337]' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {vehicle.is_active ? 'Active Fleet' : 'Standby / History'}
                  </span>
                </div>

                <div className="text-xs font-bold text-slate-800">{vehicle.model}</div>

                <div className="text-[11px] text-slate-500 flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                  <span>
                    Driver: <strong className="text-slate-700">{vehicle.driver_name || 'Unassigned'}</strong>
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    ₦{totalSpent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>

                <div className="mt-2 text-[10px] text-[#0a7337] font-bold flex items-center justify-end gap-1">
                  <span>View Details & Costs</span>
                  <span>→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add New Vehicle Independently with Duplicate Checking */}
      {isAddingVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm">Register Fleet Vehicle</h3>
              <button
                onClick={() => setIsAddingVehicle(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsSubmitting(true);
                setModalFeedback(null);
                const formData = new FormData(e.currentTarget);
                const res = await createVehicleDirectAction(formData);
                setIsSubmitting(false);
                if (res.success) {
                  setIsAddingVehicle(false);
                } else {
                  setModalFeedback(res);
                }
              }}
              className="p-6 space-y-4"
            >
              {modalFeedback && !modalFeedback.success && (
                <div className="p-3 text-xs rounded-xl border bg-red-50 text-red-700 border-red-200">
                  {modalFeedback.message}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Plate Number</label>
                <input
                  name="plate_number"
                  type="text"
                  required
                  placeholder="e.g. KJA-991XA"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none font-mono uppercase"
                />
                <p className="text-[10px] text-slate-400">Must be unique. Two cars cannot share the same plate.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Vehicle Model</label>
                <input
                  name="model"
                  type="text"
                  required
                  placeholder="e.g. Mack Titan 40T / Hilux Van"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Assign Driver (Optional)</label>
                <select
                  name="driver_id"
                  defaultValue="unassigned"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                >
                  <option value="unassigned">-- Assign Later (Unassigned) --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.phone ? `(${d.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingVehicle(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-1/2 py-2.5 rounded-xl bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Add Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Selected Vehicle Details, Edit Plate, Delete Car & Maintenance Ledger */}
      {selectedVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[90vh]">
            {/* Modal Top Header */}
            <div className="flex justify-between items-start px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-black text-slate-900 bg-white border border-slate-300 px-2.5 py-0.5 rounded shadow-sm">
                    {selectedVehicle.plate_number}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      selectedVehicle.is_active ? 'bg-green-100 text-[#0a7337]' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {selectedVehicle.is_active ? 'In Service' : 'Standby / Out of Service'}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-slate-700 mt-1">{selectedVehicle.model}</h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingVehicle(!isEditingVehicle);
                    setIsConfirmingDelete(false);
                    setModalFeedback(null);
                  }}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {isEditingVehicle ? 'Cancel Edit' : 'Edit Plate / Model'}
                </button>

                <form action={toggleVehicleStatusAction}>
                  <input type="hidden" name="vehicle_id" value={selectedVehicle.id} />
                  <input type="hidden" name="current_status" value={String(selectedVehicle.is_active)} />
                  <button
                    type="submit"
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {selectedVehicle.is_active ? 'Mark Standby' : 'Mark Active'}
                  </button>
                </form>

                <button
                  onClick={() => setSelectedVehicleId(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg font-bold text-sm"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Error or Success Feedback Banner */}
            {modalFeedback && (
              <div
                className={`px-6 py-2.5 text-xs border-b ${
                  modalFeedback.success
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}
              >
                {modalFeedback.message}
              </div>
            )}

            {/* Inline Form: Change Plate Number & Model */}
            {isEditingVehicle && (
              <form onSubmit={handleUpdateVehicle} className="p-4 bg-amber-50/60 border-b border-amber-200 space-y-3">
                <input type="hidden" name="vehicle_id" value={selectedVehicle.id} />
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-900 uppercase">Change Plate Number & Details</h4>
                  <span className="text-[10px] text-amber-700 font-medium">Duplicate plates will be blocked</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Plate Number</label>
                    <input
                      name="plate_number"
                      type="text"
                      required
                      defaultValue={selectedVehicle.plate_number}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none font-mono uppercase bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Vehicle Model</label>
                    <input
                      name="model"
                      type="text"
                      required
                      defaultValue={selectedVehicle.model}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingVehicle(false)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[#0a7337] hover:bg-[#085a2b] text-white shadow-sm transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}

            {/* Reassign / Assign Driver Inline */}
            <div className="px-6 py-3 bg-white border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Assigned Driver</span>
                <span className="font-bold text-slate-800">
                  {selectedVehicle.driver_name || 'Currently Unassigned'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <form action={assignVehicleDriverAction} className="flex items-center gap-2">
                  <input type="hidden" name="vehicle_id" value={selectedVehicle.id} />
                  <select
                    name="driver_id"
                    defaultValue={selectedVehicle.driver_id || 'unassigned'}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                  >
                    <option value="unassigned">-- Unassigned --</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg text-xs"
                  >
                    Update Driver
                  </button>
                </form>

                {/* Delete Vehicle Trigger */}
                {!isConfirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(true)}
                    className="px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
                  >
                    Delete Car
                  </button>
                ) : (
                  <form onSubmit={handleDeleteVehicle} className="flex items-center gap-1.5">
                    <input type="hidden" name="vehicle_id" value={selectedVehicle.id} />
                    <span className="text-[10px] font-bold text-red-700">Are you sure?</span>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-2.5 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm"
                    >
                      {isSubmitting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(false)}
                      className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="p-6 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50/50">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Total Spent</span>
                <span className="text-base font-black text-[#0a7337]">
                  ₦{selectedVehicleTotalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Service Records</span>
                <span className="text-base font-black text-slate-800">{currentVehicleExpenses.length} entries</span>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 col-span-2 sm:col-span-1 flex items-center justify-center">
                <button
                  onClick={() => setIsLoggingExpense(!isLoggingExpense)}
                  className="w-full text-xs font-bold text-white bg-[#0a7337] hover:bg-[#085a2b] py-2 px-3 rounded-lg shadow-sm transition-all active:scale-95"
                >
                  {isLoggingExpense ? 'Close Form' : '+ Record Maintenance'}
                </button>
              </div>
            </div>

            {/* Record Cost Form */}
            {isLoggingExpense && (
              <form
                action={async (formData) => {
                  setIsSubmitting(true);
                  await addVehicleExpenseAction(formData);
                  setIsSubmitting(false);
                  setIsLoggingExpense(false);
                }}
                className="p-5 bg-green-50/50 border-b border-green-200 space-y-3"
              >
                <input type="hidden" name="vehicle_id" value={selectedVehicle.id} />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Log Expense / Maintenance on {selectedVehicle.plate_number}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Expense Category</label>
                    <select
                      name="expense_type"
                      required
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                    >
                      <option value="Oil Change & Filter">🛢️ Oil Change & Filter</option>
                      <option value="Mechanical & Engine">🔧 Mechanical & Engine Repair</option>
                      <option value="Tires & Alignment">🛞 Tires & Alignment</option>
                      <option value="Brake System">🛑 Brake System</option>
                      <option value="Fuel / Fluid Top-up">⛽ Fuel / Fluid Top-up</option>
                      <option value="Routine Inspection">📋 Routine Inspection</option>
                      <option value="Vehicle License / Papers">📄 Vehicle License / Papers</option>
                      <option value="Other Maintenance">📦 Other Maintenance</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Amount (₦)</label>
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      required
                      placeholder="e.g. 35000"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Notes / Work Done / Vendor</label>
                  <input
                    name="description"
                    type="text"
                    required
                    placeholder="e.g. Total Quartz 5W30 + oil filter replacement at Oando Service Hub"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsLoggingExpense(false)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[#0a7337] hover:bg-[#085a2b] text-white shadow-sm transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? 'Recording...' : 'Save Record'}
                  </button>
                </div>
              </form>
            )}

            {/* Expense Ledger */}
            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                Expense & Maintenance History
              </h4>

              {currentVehicleExpenses.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No costs recorded for this vehicle yet. Click <strong>+ Record Maintenance</strong> to add an oil change, repair, or fuel expenditure.
                </div>
              ) : (
                <div className="space-y-2">
                  {currentVehicleExpenses.map((exp) => (
                    <div
                      key={exp.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{exp.expense_type}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(exp.created_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        {exp.description && <p className="text-slate-600 text-[11px]">{exp.description}</p>}
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 block">
                          Logged by: {exp.logged_by_name || 'Manager'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-extrabold text-[#0a7337] text-sm whitespace-nowrap">
                          ₦{parseFloat(String(exp.amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <form action={deleteVehicleExpenseAction}>
                          <input type="hidden" name="expense_id" value={exp.id} />
                          <button
                            type="submit"
                            title="Remove entry"
                            className="text-slate-300 hover:text-red-500 transition-colors p-1"
                          >
                            ✕
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}