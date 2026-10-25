'use client';

import { useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface TabProps {
  tripContent: ReactNode;
  expenseContent: ReactNode;
  chatContent: ReactNode;
}

export default function DriverMobileTabs({ tripContent, expenseContent, chatContent }: TabProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'trip' | 'expenses' | 'chat'>('trip');

  // Auto-refresh driver dashboard state every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="flex flex-col flex-1 h-full">
      {/* Mobile Navigation Menu */}
      <div className="md:hidden flex bg-white border-b border-slate-200 sticky top-[60px] z-10 shadow-sm shrink-0">
        <button
          onClick={() => setActiveTab('trip')}
          className={`flex-1 py-3.5 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'trip' ? 'border-[#0a7337] text-[#0a7337]' : 'border-transparent text-slate-500 hover:bg-slate-50'
          }`}
        >
          Journey
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`flex-1 py-3.5 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'expenses' ? 'border-[#0a7337] text-[#0a7337]' : 'border-transparent text-slate-500 hover:bg-slate-50'
          }`}
        >
          Expenses
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3.5 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'chat' ? 'border-[#0a7337] text-[#0a7337]' : 'border-transparent text-slate-500 hover:bg-slate-50'
          }`}
        >
          Chat
        </button>
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col md:flex-row md:gap-6 ${activeTab === 'chat' ? 'py-0 md:py-6' : 'py-6'}`}>
        <div className={`flex-1 space-y-6 flex-col ${activeTab === 'chat' ? 'hidden md:flex' : 'flex'}`}>
          <div className={`${activeTab === 'trip' ? 'block' : 'hidden md:block'}`}>
            {tripContent}
          </div>
          <div className={`${activeTab === 'expenses' ? 'block' : 'hidden md:block'}`}>
            {expenseContent}
          </div>
        </div>

        <div className={`md:w-[400px] flex-col ${
          activeTab === 'chat'
            ? 'flex h-[calc(100vh-112px)] md:h-[550px] -mx-4 sm:mx-0'
            : 'hidden md:flex md:h-[550px]'
        }`}>
          <h3 className="text-sm font-bold text-slate-900 mb-3 px-1 hidden md:block">Dispatch Chat</h3>
          <div className="flex-1 flex flex-col min-h-0">
            {chatContent}
          </div>
        </div>
      </div>
    </div>
  );
}