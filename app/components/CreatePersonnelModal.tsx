'use client';

import { useState } from 'react';
import { createStaffAccount, CreateAccountResponse } from '@/app/actions/register';

export default function CreatePersonnelModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState('driver');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Success Modal State with Full Credentials
  const [createdData, setCreatedData] = useState<CreateAccountResponse['credentials'] | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    // Capture the HTMLFormElement synchronously before the async boundary
    const form = e.currentTarget;
    const formData = new FormData(form);

    const res = await createStaffAccount(formData);

    setIsSubmitting(false);

    if (res.success && res.credentials) {
      setCreatedData(res.credentials);
      setIsOpen(false);
      form.reset(); // Safely reset the captured form element
      setRole('driver');
    } else {
      setErrorMsg(res.message || 'Failed to create account.');
    }
  };

  const handleCopyDetails = () => {
    if (!createdData) return;
    const text = `AJIVIN LOGISTICS ACCOUNT
Name: ${createdData.name}
Role: ${createdData.role.toUpperCase()}
Email: ${createdData.email}
Password: ${createdData.password}
${createdData.plateNumber ? `Assigned Plate: ${createdData.plateNumber}\n` : ''}${createdData.license ? `License: ${createdData.license}\n` : ''}`.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          setErrorMsg(null);
        }}
        className="inline-flex items-center gap-1.5 bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold py-2 px-3.5 rounded-xl shadow-sm transition-all active:scale-95"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Account
      </button>

      {/* 1. Account Creation Form Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Create Personnel Account</h3>
                <p className="text-xs text-slate-500">Enclosed personnel registration</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 text-xs rounded-xl border bg-red-50 text-red-700 border-red-200 flex items-start gap-2">
                  <span>⚠️</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 uppercase">Full Name</label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Tunde Adebayo"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Email Address</label>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="staff@ajivin.com"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Phone</label>
                  <input
                    name="phone"
                    type="tel"
                    required
                    placeholder="09037291405"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Role</label>
                  <select
                    name="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                  >
                    <option value="driver">Driver</option>
                    <option value="staff">Staff Member</option>
                    <option value="manager">Logistics Manager</option>
                  </select>
                </div>

                {role === 'driver' ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">License No.</label>
                    <input
                      name="license"
                      type="text"
                      required
                      placeholder="DL-982310"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">License</label>
                    <input
                      disabled
                      placeholder="Not required"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-400 outline-none cursor-not-allowed"
                    />
                  </div>
                )}
              </div>

              {/* Unique Plate Assignment: Only shown for Drivers */}
              {role === 'driver' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#0a7337]">
                    <span>Vehicle Assignment</span>
                    <span className="text-[10px] text-slate-400 font-normal">Must be unique</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Plate Number</label>
                      <input
                        name="plate_number"
                        type="text"
                        placeholder="e.g. KJA-991XA"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none font-mono uppercase bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Model</label>
                      <input
                        name="vehicle_model"
                        type="text"
                        placeholder="e.g. Mack Titan"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none bg-white"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">2 drivers cannot share the same plate number.</p>
                </div>
              )}

              {/* Password Input with Visible SHOW / HIDE Toggle */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Initial Password</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[10px] font-bold text-[#0a7337] hover:underline"
                  >
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter account password"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-[#0a7337] outline-none pr-14"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? '👁️' : '🔒'}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-1/2 py-2.5 rounded-xl bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Success Confirmation Modal with Credentials & Copy Button */}
      {createdData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-green-100 text-[#0a7337] rounded-full flex items-center justify-center mx-auto text-2xl shadow-sm">
                ✓
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">Account Created Successfully!</h3>
                <p className="text-xs text-slate-500">Please share these login credentials with the user.</p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-left text-xs space-y-2.5">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Full Name</span>
                  <span className="font-bold text-slate-900">{createdData.name}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Role</span>
                  <span className="font-bold uppercase text-[#0a7337]">{createdData.role}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Email Address</span>
                  <span className="font-mono font-bold text-slate-900">{createdData.email}</span>
                </div>

                {createdData.plateNumber && (
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Assigned Plate</span>
                    <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300">
                      {createdData.plateNumber}
                    </span>
                  </div>
                )}

                {createdData.license && (
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Driver License</span>
                    <span className="font-bold text-slate-900">{createdData.license}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-1">
                  <span className="text-slate-500 font-bold">Password</span>
                  <span className="font-mono text-sm font-extrabold text-emerald-800 bg-emerald-100/70 px-2.5 py-1 rounded-lg border border-emerald-300">
                    {createdData.password}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCopyDetails}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                >
                  {copied ? '✓ Copied!' : '📋 Copy Details'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreatedData(null)}
                  className="w-1/2 py-2.5 rounded-xl bg-[#0a7337] hover:bg-[#085a2b] text-white text-xs font-bold transition-all shadow-md"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}