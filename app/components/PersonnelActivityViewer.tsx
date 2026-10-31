'use client';

import { useState, useMemo } from 'react';
import MapSwitcher from '@/app/components/MapSwitcher';
import { editExpenseDetailsAction } from '@/app/actions/expense';

export interface TripComment {
  id: number;
  trip_id: number;
  user_name: string;
  comment: string;
  rating: number;
  created_at: string;
}

interface Trip {
  id: number;
  destination: string;
  status: string;
  fasttrack_code: string | null;
  current_location?: string | null;
  is_started?: boolean;
  started_at?: string | null;
  created_at: string;
}

interface Expense {
  id: number;
  expense_type?: string;
  category?: string;
  amount: number | string;
  description: string;
  vehicle_plate?: string | null;
  created_at: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  license_number: string | null;
  plate_number?: string | null;
  vehicle_model?: string | null;
  is_online: boolean;
}

interface ActivityViewerProps {
  user: User | null;
  trips: Trip[];
  expenses: Expense[];
  comments?: TripComment[];
}

function statusClasses(status: string) {
  if (status === 'Completed') return 'bg-green-100 text-[#0a7337]';
  if (status === 'Declined' || status === 'Cancelled') return 'bg-red-100 text-red-700';
  if (status === 'Active' || status === 'En Route') return 'bg-blue-100 text-blue-700';
  return 'bg-orange-100 text-orange-700';
}

export default function PersonnelActivityViewer({ user, trips, expenses, comments = [] }: ActivityViewerProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'trips' | 'expenses'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // States for manager inline plate/price editing
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editPlate, setEditPlate] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter trips based on FastTrack code for the search board
  const filteredSearchTrips = useMemo(() => {
    if (!searchQuery.trim()) return trips;
    const q = searchQuery.toLowerCase().trim();
    return trips.filter((t) => t.fasttrack_code?.toLowerCase().includes(q));
  }, [trips, searchQuery]);

  if (!user) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 min-h-[350px] flex flex-col items-center justify-center text-slate-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mb-4 opacity-50"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
        <p className="text-sm font-semibold text-slate-500">
          Select a personnel member from Live Tracking to view details.
        </p>
      </div>
    );
  }

  const handleSaveEdit = async (expenseId: number) => {
    setIsUpdating(true);
    await editExpenseDetailsAction(expenseId, parseFloat(editAmount), editPlate.toUpperCase());
    setEditingExpenseId(null);
    setIsUpdating(false);
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const liveTrip = trips.find((t) => t.status === 'En Route' || (t.status === 'Active' && !!t.is_started)) || null;

  // Reusable Trip Card Renderer
  const renderTripCard = (trip: Trip) => {
    const tripComment = comments.find((c) => c.trip_id === trip.id);
    return (
      <div
        key={trip.id}
        className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col text-xs gap-3 transition-shadow hover:shadow-sm"
      >
        <div className="flex justify-between items-center gap-3">
          <div className="min-w-0">
            <span className="font-bold text-slate-900 block text-sm truncate">{trip.destination}</span>
            <span className="text-slate-500">
              Trip Code: TRP-{trip.id} &bull; FastTrack:{' '}
              <strong className="text-slate-700">{trip.fasttrack_code || 'Pending'}</strong>
            </span>
          </div>
          <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] shrink-0 ${statusClasses(trip.status)}`}>
            {trip.status}
          </span>
        </div>

        {/* Inline Staff Feedback Box */}
        {tripComment && (
          <div className="mt-1 p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg">
            <div className="flex justify-between items-start mb-1.5">
              <span className="text-[10px] font-bold uppercase text-indigo-500 tracking-wider">
                Staff Feedback & Rating
              </span>
              <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded shadow-sm">
                {tripComment.rating} / 5 ⭐
              </span>
            </div>
            <p className="text-indigo-900 italic font-medium leading-relaxed">
              "{tripComment.comment}"
            </p>
            <span className="block text-[9px] text-indigo-400 mt-2 uppercase tracking-wider">
              By {tripComment.user_name}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      {/* Header Info Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-5 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#0a7337]/10 text-[#0a7337] font-extrabold flex items-center justify-center text-xl uppercase shrink-0">
            {user.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{user.name}</h2>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  user.role === 'manager' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {user.role}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {user.email} &bull; ID: AJMS-{user.id.toString().padStart(4, '0')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user.is_online ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Online Now
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Primary Identification Grid: Plate Number First */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. Primary Identifier: Assigned Plate Number */}
        <div className="bg-green-50/50 p-3.5 rounded-xl border border-green-200/70">
          <span className="block text-[10px] font-bold text-[#0a7337] uppercase tracking-wider mb-1">
            {user.role === 'manager' ? 'Vehicle Access' : 'Assigned Plate (ID)'}
          </span>
          {user.role === 'manager' ? (
            <span className="text-xs font-bold text-slate-700">Fleet Dispatcher</span>
          ) : (
            <>
              <span className="font-mono text-sm font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300 inline-block shadow-sm">
                {user.plate_number || 'UNASSIGNED'}
              </span>
              {user.vehicle_model && (
                <span className="block text-[10px] font-semibold text-slate-600 truncate mt-1">
                  {user.vehicle_model}
                </span>
              )}
            </>
          )}
        </div>

        {/* 2. Driver License Number (Secondary) */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            {user.role === 'manager' ? 'Role Type' : 'Driver License'}
          </span>
          <span className="text-sm font-bold text-slate-800 block">
            {user.role === 'manager' ? 'Logistics Manager' : user.license_number || 'Not Set'}
          </span>
          <span className="text-[10px] text-slate-400">Official Clearance</span>
        </div>

        {/* 3. Phone Number */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Phone</span>
          <span className="text-sm font-bold text-slate-800 block">{user.phone || 'N/A'}</span>
          <span className="text-[10px] text-slate-400">Mobile Contact</span>
        </div>

        {/* 4. Total Spent on Car */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Total Spent on Car
          </span>
          <span className="text-sm font-black text-[#0a7337] font-mono block">
            ₦{totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-400">{expenses.length} expense logs</span>
        </div>
      </div>

      {/* Live Map Switcher */}
      {liveTrip ? (
        <div className="pt-2">
          <MapSwitcher
            tripId={liveTrip.id}
            currentLocation={liveTrip.current_location || null}
            isManagerView={true}
            driverName={user.name}
            startedAt={liveTrip.started_at}
          />
        </div>
      ) : (
        user.role !== 'manager' && (
          <p className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            {user.name} has no trip in progress.
          </p>
        )
      )}

      {/* Filter Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('all')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'all'
              ? 'border-[#0a7337] text-[#0a7337]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          Search FastTrack
        </button>
        <button
          onClick={() => setActiveTab('trips')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'trips'
              ? 'border-[#0a7337] text-[#0a7337]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Journeys ({trips.length})
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`py-2 px-4 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'expenses'
              ? 'border-[#0a7337] text-[#0a7337]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Repairs & Fees ({expenses.length})
        </button>
      </div>

      {/* Activity Details List */}
      <div className="space-y-6 max-h-[400px] overflow-y-auto pr-1 pb-4">

        {/* FastTrack Search Board (activeTab === 'all') */}
        {activeTab === 'all' && (
          <div className="space-y-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search journey by FastTrack Code (e.g. FT-931752)..."
                className="w-full pl-4 pr-10 py-3 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-[#0a7337] focus:border-transparent outline-none transition-all font-mono"
              />
              <svg className="w-5 h-5 text-slate-400 absolute right-3.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            <div className="space-y-2">
              {filteredSearchTrips.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  {searchQuery ? `No trips found matching code "${searchQuery}"` : 'No journeys logged for this personnel.'}
                </div>
              ) : (
                filteredSearchTrips.map(renderTripCard)
              )}
            </div>
          </div>
        )}

        {/* Regular Journeys List (activeTab === 'trips') */}
        {activeTab === 'trips' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Full Journey Log</h3>
            {trips.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No trips found for this personnel member.</p>
            ) : (
              trips.map(renderTripCard)
            )}
          </div>
        )}

        {/* Expenses & Repairs Section (activeTab === 'expenses') */}
        {activeTab === 'expenses' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Expenses, Repairs & Fees Log
            </h3>
            {expenses.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No repairs or expense logs recorded.</p>
            ) : (
              expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-3 text-xs"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-900 text-sm">
                          {expense.expense_type || expense.category}
                        </span>
                        <span className="bg-slate-200 text-slate-800 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-slate-300">
                          {expense.vehicle_plate || user.plate_number || 'NO PLATE'}
                        </span>
                      </div>
                      <p className="text-slate-500 truncate">
                        {expense.description || 'No description provided.'}
                      </p>
                      <span className="block text-[10px] text-slate-400 mt-1">
                        {new Date(expense.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="block font-bold text-[#0a7337] font-mono text-sm mb-1">
                        ₦{Number(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      {editingExpenseId !== expense.id && (
                        <button
                          onClick={() => {
                            setEditingExpenseId(expense.id);
                            setEditAmount(expense.amount.toString());
                            setEditPlate(expense.vehicle_plate || user.plate_number || '');
                          }}
                          className="text-[#0a7337] hover:text-[#085a2b] bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg font-bold transition-colors text-xs"
                          title="Edit Plate or Price"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {editingExpenseId === expense.id && (
                    <div className="flex flex-col sm:flex-row gap-2 bg-white p-2 rounded-lg border border-slate-200 mt-1 shadow-sm">
                      <input
                        type="text"
                        value={editPlate}
                        onChange={(e) => setEditPlate(e.target.value.toUpperCase())}
                        placeholder="Plate No."
                        className="w-full sm:w-28 p-2 text-xs border border-slate-300 rounded outline-none font-mono uppercase"
                      />
                      <div className="flex items-center gap-1.5 w-full sm:w-auto border border-slate-300 rounded px-2">
                        <span className="text-slate-500 font-bold">₦</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-full sm:w-24 p-2 text-sm font-bold text-slate-900 outline-none font-mono"
                        />
                      </div>
                      <div className="flex items-center gap-2 sm:ml-auto w-full sm:w-auto">
                        <button
                          onClick={() => handleSaveEdit(expense.id)}
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
        )}
      </div>
    </div>
  );
}
