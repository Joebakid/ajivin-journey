// app/components/StaffDashboardClient.tsx
'use client';

import { useState } from 'react';
import {
  bookStaffTripAction,
  addTripCommentAction,
  reportDriverAction,
  reportStaffVehicleExpenseAction,
} from '@/app/actions/staff';

interface VehicleItem {
  id: number;
  plate_number: string;
  model: string;
}

interface DriverItem {
  id: number;
  name: string;
  phone: string | null;
  plate_number: string | null;
}

interface TripItem {
  id: number;
  destination: string;
  status: string;
  fasttrack_code: string | null;
  created_at: string;
  driver_name?: string | null;
}

interface CommentItem {
  id: number;
  trip_id: number;
  user_name: string;
  comment: string;
  rating: number;
  created_at: string;
}

interface StaffDashboardClientProps {
  staffId: number;
  staffName: string;
  trips: TripItem[];
  comments: CommentItem[];
  vehicles: VehicleItem[];
  drivers: DriverItem[];
}

export default function StaffDashboardClient({
  staffId,
  staffName,
  trips,
  comments,
  vehicles,
  drivers,
}: StaffDashboardClientProps) {
  const [activeSubTab, setActiveSubTab] = useState<'booking' | 'report' | 'expenses'>('booking');
  const [commentingTripId, setCommentingTripId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Group comments by tripId
  const commentsByTrip = comments.reduce((acc, c) => {
    acc[c.trip_id] = acc[c.trip_id] || [];
    acc[c.trip_id].push(c);
    return acc;
  }, {} as Record<number, CommentItem[]>);

  const handleBookTrip = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    const formData = new FormData(e.currentTarget);
    formData.append('staff_id', String(staffId));
    const res = await bookStaffTripAction(formData);
    setIsSubmitting(false);
    setFeedback(res);
    if (res.success) (e.target as HTMLFormElement).reset();
  };

  const handleReportDriver = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    const formData = new FormData(e.currentTarget);
    formData.append('staff_id', String(staffId));
    const res = await reportDriverAction(formData);
    setIsSubmitting(false);
    setFeedback(res);
    if (res.success) (e.target as HTMLFormElement).reset();
  };

  const handleLogExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    const formData = new FormData(e.currentTarget);
    formData.append('staff_id', String(staffId));
    const res = await reportStaffVehicleExpenseAction(formData);
    setIsSubmitting(false);
    setFeedback(res);
    if (res.success) (e.target as HTMLFormElement).reset();
  };

  const handleAddComment = async (e: React.FormEvent<HTMLFormElement>, tripId: number) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    formData.append('trip_id', String(tripId));
    formData.append('staff_id', String(staffId));
    const res = await addTripCommentAction(formData);
    setIsSubmitting(false);
    if (res.success) {
      setCommentingTripId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub Navigation Bar */}
      <div className="flex border-b border-slate-200 bg-white rounded-2xl px-3 shadow-sm text-xs font-bold">
        <button
          onClick={() => {
            setActiveSubTab('booking');
            setFeedback(null);
          }}
          className={`py-3.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'booking'
              ? 'border-[#0a7337] text-[#0a7337]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🚗</span>
          <span>Book & View Trips</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('report');
            setFeedback(null);
          }}
          className={`py-3.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'report'
              ? 'border-[#0a7337] text-[#0a7337]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>⚠️</span>
          <span>Report a Driver</span>
        </button>

        <button
          onClick={() => {
            setActiveSubTab('expenses');
            setFeedback(null);
          }}
          className={`py-3.5 px-4 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'expenses'
              ? 'border-[#0a7337] text-[#0a7337]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>💰</span>
          <span>Vehicle Expenses</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 text-xs rounded-xl border flex items-center gap-2 ${
            feedback.success
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          <span>{feedback.success ? '✓' : '⚠️'}</span>
          <span>{feedback.message}</span>
        </div>
      )}

      {/* TAB 1: BOOK A TRIP & TRIP HISTORY WITH COMMENTS */}
      {activeSubTab === 'booking' && (
        <div className="space-y-6">
          {/* Booking Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Book Official Trip</h3>
              <p className="text-xs text-slate-500">Submit travel requirements for dispatch clearance.</p>
            </div>

            <form onSubmit={handleBookTrip} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Destination</label>
                  <input
                    name="destination"
                    type="text"
                    required
                    placeholder="e.g. Victoria Island Client Office"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-slate-50 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Passengers</label>
                    <select
                      name="passengers"
                      defaultValue="1"
                      className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                    >
                      <option value="1">1 Person</option>
                      <option value="2">2 Persons</option>
                      <option value="3">3 Persons</option>
                      <option value="4+">4+ Group</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Schedule Time</label>
                    {/* Changed to native datetime-local picker menu */}
                    <input
                      name="preferred_time"
                      type="datetime-local"
                      required
                      className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Purpose of Travel</label>
                <textarea
                  name="purpose"
                  rows={2}
                  required
                  placeholder="Official meeting, client inspection, supplies pickup..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-slate-50 focus:bg-white resize-none"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold py-3 px-4 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-60 uppercase tracking-wider"
              >
                {isSubmitting ? 'Submitting...' : 'Request Trip Booking'}
              </button>
            </form>
          </div>

          {/* Trips & Comments History */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Your Trips & Reviews</h3>
                <p className="text-xs text-slate-500">Write comments and rate your journeys.</p>
              </div>
              <span className="text-xs font-bold text-slate-400">{trips.length} Bookings</span>
            </div>

            {trips.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-400 italic">No trip bookings found yet.</p>
            ) : (
              <div className="space-y-4">
                {trips.map((trip) => {
                  const tripCommentsList = commentsByTrip[trip.id] || [];
                  const isCommenting = commentingTripId === trip.id;

                  return (
                    <div key={trip.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-900 text-sm block">{trip.destination}</span>
                          <span className="text-[11px] text-slate-500">
                            TRP-{trip.id} • FastTrack:{' '}
                            <strong className="text-[#0a7337]">{trip.fasttrack_code || 'Pending Clearance'}</strong>
                          </span>
                        </div>
                        <span
                          className={`self-start sm:self-auto text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            trip.status === 'Completed'
                              ? 'bg-slate-200 text-slate-700'
                              : trip.status === 'Active' || trip.status === 'En Route'
                              ? 'bg-green-100 text-[#0a7337]'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {trip.status}
                        </span>
                      </div>

                      {/* Existing Comments */}
                      {tripCommentsList.length > 0 && (
                        <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Comments & Feedback</span>
                          {tripCommentsList.map((c) => (
                            <div key={c.id} className="text-[11px] border-b border-slate-100 last:border-0 pb-1.5 last:pb-0">
                              <div className="flex justify-between items-center text-slate-700 font-bold">
                                <span>{c.user_name}</span>
                                <span className="text-amber-500">{'★'.repeat(c.rating)}</span>
                              </div>
                              <p className="text-slate-600 mt-0.5">{c.comment}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Comment Input Form */}
                      {isCommenting ? (
                        <form
                          onSubmit={(e) => handleAddComment(e, trip.id)}
                          className="p-3 bg-white rounded-lg border border-slate-200 space-y-2 mt-2"
                        >
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-slate-700 uppercase">Write a Comment</label>
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-[10px] text-slate-400">Rating:</span>
                              <select name="rating" defaultValue="5" className="border rounded px-1 py-0.5 text-xs bg-white">
                                <option value="5">⭐⭐⭐⭐⭐</option>
                                <option value="4">⭐⭐⭐⭐</option>
                                <option value="3">⭐⭐⭐</option>
                                <option value="2">⭐⭐</option>
                                <option value="1">⭐</option>
                              </select>
                            </div>
                          </div>
                          <textarea
                            name="comment"
                            required
                            rows={2}
                            placeholder="How was the journey?"
                            className="w-full px-2 py-1.5 text-xs border rounded-md outline-none focus:border-[#0a7337] resize-none"
                          ></textarea>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setCommentingTripId(null)}
                              className="px-3 py-1.5 text-slate-500 hover:text-slate-700 font-semibold"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="px-4 py-1.5 bg-[#0a7337] text-white rounded-md font-semibold hover:bg-[#085a2b] disabled:opacity-50"
                            >
                              {isSubmitting ? 'Posting...' : 'Post Comment'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setCommentingTripId(trip.id)}
                            className="text-[11px] font-bold text-[#0a7337] hover:underline"
                          >
                            + Add Comment / Rate Trip
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: REPORT A DRIVER */}
      {activeSubTab === 'report' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="text-red-500">⚠️</span>
              <span>Report Driver Incident or Misconduct</span>
            </h3>
            <p className="text-xs text-slate-500">
              Reports are transmitted directly to Logistics Management for safety enforcement.
            </p>
          </div>

          <form onSubmit={handleReportDriver} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Select Driver</label>
                <select
                  name="driver_id"
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                >
                  <option value="">-- Choose Driver --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.plate_number ? `[Plate: ${d.plate_number}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Violation / Incident Type</label>
                <select
                  name="incident_type"
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                >
                  <option value="Reckless Driving & Speeding">Reckless Driving & Speeding</option>
                  <option value="Unprofessional Conduct & Rudeness">Unprofessional Conduct & Rudeness</option>
                  <option value="Severe Tardiness / No-Show">Severe Tardiness / No-Show</option>
                  <option value="Vehicle Cleanliness & Condition">Vehicle Cleanliness & Condition</option>
                  <option value="Unauthorized Detours / Stops">Unauthorized Detours / Stops</option>
                  <option value="Other Safety Violation">Other Safety Violation</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600 uppercase">Vehicle Plate (If known)</label>
              <input
                name="plate_number"
                type="text"
                placeholder="e.g. KJA-991XA"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none font-mono uppercase bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600 uppercase">Incident Description & Context</label>
              <textarea
                name="description"
                rows={3}
                required
                placeholder="Describe what occurred, time of event, location, and any specific details..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-slate-50 focus:bg-white resize-none"
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-60 uppercase tracking-wider"
            >
              {isSubmitting ? 'Submitting Report...' : 'File Driver Incident Report'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: LOG VEHICLE EXPENSE */}
      {activeSubTab === 'expenses' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Report Vehicle Expense</h3>
            <p className="text-xs text-slate-500">Record fueling, servicing, tolls, or parts bought for a fleet vehicle.</p>
          </div>

          <form onSubmit={handleLogExpense} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Select Vehicle [Plate]</label>
                <select
                  name="vehicle_id"
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none font-mono font-bold uppercase bg-white"
                >
                  <option value="">-- Choose Fleet Vehicle --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate_number} - {v.model}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Category</label>
                <select
                  name="expense_type"
                  required
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                >
                  <option value="Fuel Refill">Fuel Refill</option>
                  <option value="Oil Change & Filter">Oil Change & Filter</option>
                  <option value="Tire Repair / Replacement">Tire Repair / Replacement</option>
                  <option value="Toll Gate / Parking Fee">Toll Gate / Parking Fee</option>
                  <option value="Mechanical Servicing">Mechanical Servicing</option>
                  <option value="Emergency Road Repair">Emergency Road Repair</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600 uppercase">Amount (₦)</label>
              <input
                name="amount"
                type="number"
                min="1"
                step="0.01"
                required
                placeholder="e.g. 25000"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none font-mono text-sm bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600 uppercase">Description / Vendor / Receipt</label>
              <textarea
                name="description"
                rows={2}
                required
                placeholder="Fuel purchased at Total Station, receipt ref #4489..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-slate-50 focus:bg-white resize-none"
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold py-3 px-4 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-60 uppercase tracking-wider"
            >
              {isSubmitting ? 'Recording...' : 'Submit Vehicle Expense'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}