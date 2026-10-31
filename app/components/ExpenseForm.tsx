'use client';

import { useState, useRef, useEffect } from 'react';
import ConfirmationModal from './ConfirmationModal';
import { submitExpenseAction, getDriverExpensesAction, editExpenseDetailsAction } from '@/app/actions/expense';
import { getDriverVehiclesAction } from '@/app/actions/vehicle';

export interface VehicleOption {
  id?: number;
  plate_number: string;
  model?: string;
  is_active?: boolean;
}

export default function ExpenseForm({
  driverId,
  vehicles = [],
}: {
  driverId: string;
  vehicles?: VehicleOption[];
}) {
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  // Vehicle selection state
  const [vehicleList, setVehicleList] = useState<VehicleOption[]>(vehicles);
  const [selectedPlate, setSelectedPlate] = useState<string>('');
  const [isCustomPlate, setIsCustomPlate] = useState(false);
  const [customPlateValue, setCustomPlateValue] = useState('');

  // Inline edit state for driver's history
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editPlate, setEditPlate] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  const loadHistory = async () => {
    const res = await getDriverExpensesAction(parseInt(driverId, 10));
    if (res.success) setHistory(res.expenses);
  };

  const initVehicles = async () => {
    if (vehicles && vehicles.length > 0) {
      setVehicleList(vehicles);
      const active = vehicles.find((v) => v.is_active) || vehicles[0];
      if (active) setSelectedPlate(active.plate_number);
    } else {
      const res = await getDriverVehiclesAction(parseInt(driverId, 10));
      if (res.success && res.vehicles && res.vehicles.length > 0) {
        setVehicleList(res.vehicles as VehicleOption[]);
        const active = (res.vehicles as VehicleOption[]).find((v) => v.is_active) || res.vehicles[0];
        if (active) setSelectedPlate(active.plate_number);
      } else {
        setIsCustomPlate(true);
      }
    }
  };

  useEffect(() => {
    loadHistory();
    initVehicles();
  }, [driverId]);

  useEffect(() => {
    if (vehicles && vehicles.length > 0) {
      setVehicleList(vehicles);
      const active = vehicles.find((v) => v.is_active) || vehicles[0];
      if (active && !selectedPlate) setSelectedPlate(active.plate_number);
    }
  }, [vehicles]);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity();
      return;
    }
    setIsModalOpen(true);
  };

  const confirmAndSubmit = async () => {
    if (!formRef.current) return;

    setIsModalOpen(false);
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData(formRef.current);
      formData.append('driver_id', driverId);

      const result = await submitExpenseAction(formData);

      if (result.success) {
        setSuccessMsg('Expense logged securely and sent to manager.');
        formRef.current.reset();

        // Restore active vehicle as default
        const active = vehicleList.find((v) => v.is_active) || vehicleList[0];
        if (active) {
          setSelectedPlate(active.plate_number);
          setIsCustomPlate(false);
          setCustomPlateValue('');
        }

        loadHistory();
      } else {
        setErrorMsg(result.error || 'Failed to submit expense.');
      }
    } catch (err) {
      setErrorMsg('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (expenseId: number) => {
    setIsUpdating(true);
    const result = await editExpenseDetailsAction(expenseId, parseFloat(editAmount), editPlate);
    if (result.success) {
      setEditingExpenseId(null);
      loadHistory();
    }
    setIsUpdating(false);
  };

  return (
    <div className="space-y-6 max-h-[calc(100vh-140px)] overflow-y-auto pb-6">
      <form
        ref={formRef}
        onSubmit={handleFormSubmit}
        className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4 relative"
      >
        <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2">Log Vehicle Expense</h3>

        {errorMsg && <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">{errorMsg}</div>}
        {successMsg && <div className="p-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg">{successMsg}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Vehicle Dropdown */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-500 uppercase">Vehicle Plate No.</label>
              {vehicleList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomPlate(!isCustomPlate);
                    if (isCustomPlate) {
                      const active = vehicleList.find((v) => v.is_active) || vehicleList[0];
                      if (active) setSelectedPlate(active.plate_number);
                    } else {
                      setSelectedPlate('');
                    }
                  }}
                  className="text-[11px] text-[#0a7337] font-bold hover:underline"
                >
                  {isCustomPlate ? 'Select from cars' : 'Enter manually'}
                </button>
              )}
            </div>

            {!isCustomPlate && vehicleList.length > 0 ? (
              <select
                name="vehicle_plate"
                required
                value={selectedPlate}
                onChange={(e) => {
                  if (e.target.value === '__CUSTOM__') {
                    setIsCustomPlate(true);
                    setSelectedPlate('');
                  } else {
                    setSelectedPlate(e.target.value);
                  }
                }}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0a7337] font-mono font-bold text-xs uppercase bg-white cursor-pointer"
              >
                <option value="" disabled>-- Select Vehicle Plate --</option>
                {vehicleList.map((v) => (
                  <option key={v.id || v.plate_number} value={v.plate_number}>
                    {v.plate_number} {v.model ? `(${v.model})` : ''} {v.is_active ? '— [Active]' : ''}
                  </option>
                ))}
                <option value="__CUSTOM__">+ Other / Enter Different Plate</option>
              </select>
            ) : (
              <input
                type="text"
                name="vehicle_plate"
                required
                value={customPlateValue}
                onChange={(e) => setCustomPlateValue(e.target.value.toUpperCase())}
                placeholder="e.g. KJA-991XA"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0a7337] uppercase font-mono font-bold text-xs"
              />
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase">Category</label>
            <select
              name="expense_type"
              required
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0a7337] text-xs font-medium bg-white"
            >
              <option value="Fuel">Fuel Refill</option>
              <option value="Oil">Oil Change & Filter</option>
              <option value="Tire">Tire Repair / Replacement</option>
              <option value="Brake">Brake Service</option>
              <option value="Mechanical">Mechanical / Engine Work</option>
              <option value="Other">Other Maintenance</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase">Amount (₦)</label>
          <input
            type="number"
            name="amount"
            required
            min="1"
            step="0.01"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0a7337] font-mono text-sm"
            placeholder="5000"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase">Details / Description</label>
          <textarea
            name="description"
            rows={2}
            required
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0a7337] text-xs resize-none"
            placeholder="Replaced rear left tire, bought 4L engine oil, etc..."
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-70 flex items-center justify-center gap-2 shadow-md active:scale-95 text-xs uppercase tracking-wider"
        >
          {loading && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {loading ? 'Submitting...' : 'Submit Expense'}
        </button>
      </form>

      {/* Driver's Personal Expense History */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-sm">Your Expense History</h3>
          <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {history.length}
          </span>
        </div>
        <div className="divide-y divide-slate-100">
          {history.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-400 italic">You haven't logged any expenses yet.</p>
          ) : (
            history.map((exp) => (
              <div key={exp.id} className="p-4 sm:p-5 flex flex-col gap-3 text-xs">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-900 text-sm">{exp.expense_type || exp.category}</span>
                      <span className="bg-slate-100 text-slate-700 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-slate-200">
                        {exp.vehicle_plate || 'NO PLATE'}
                      </span>
                    </div>
                    <p className="text-slate-500 truncate">{exp.description}</p>
                    <span className="block text-[10px] text-slate-400 mt-1">
                      {new Date(exp.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="block font-bold text-[#0a7337] text-sm mb-1 font-mono">
                      ₦{Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    {editingExpenseId !== exp.id && (
                      <button
                        onClick={() => {
                          setEditingExpenseId(exp.id);
                          setEditAmount(exp.amount.toString());
                          setEditPlate(exp.vehicle_plate || '');
                        }}
                        className="text-[#0a7337] hover:text-[#085a2b] bg-green-50 hover:bg-green-100 px-2.5 py-1 rounded font-bold transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>

                {editingExpenseId === exp.id && (
                  <div className="flex flex-col sm:flex-row gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 mt-1">
                    {vehicleList.length > 0 ? (
                      <select
                        value={editPlate}
                        onChange={(e) => setEditPlate(e.target.value)}
                        className="w-full sm:w-36 p-2 text-xs border border-slate-300 rounded outline-none font-mono font-bold uppercase bg-white"
                      >
                        {vehicleList.map((v) => (
                          <option key={v.id || v.plate_number} value={v.plate_number}>
                            {v.plate_number}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={editPlate}
                        onChange={(e) => setEditPlate(e.target.value.toUpperCase())}
                        placeholder="Plate No."
                        className="w-full sm:w-28 p-2 text-xs border border-slate-300 rounded outline-none font-mono uppercase"
                      />
                    )}

                    <div className="flex items-center gap-1.5 w-full sm:w-auto bg-white border border-slate-300 rounded px-2">
                      <span className="text-slate-500 font-bold">₦</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-full sm:w-24 p-2 text-xs font-bold text-slate-900 outline-none font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-2 sm:ml-auto w-full sm:w-auto">
                      <button
                        onClick={() => handleSaveEdit(exp.id)}
                        disabled={isUpdating}
                        className="flex-1 sm:flex-none bg-[#0a7337] hover:bg-[#085a2b] text-white px-3 py-2 rounded text-xs font-bold disabled:opacity-50"
                      >
                        {isUpdating ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingExpenseId(null)}
                        className="flex-1 sm:flex-none bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded text-xs font-bold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={confirmAndSubmit}
        title="Submit Expense?"
        message="Are you sure you want to log this vehicle expense? The logistics manager will be notified."
        confirmText="Yes, Submit"
        cancelText="Cancel"
        variant="primary"
      />
    </div>
  );
}