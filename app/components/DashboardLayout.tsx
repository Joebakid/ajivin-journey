'use client';

import { useState, ReactNode, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface DashboardLayoutProps {
  initialTab?: 'tab1' | 'tab2' | 'tab3';
  tab1Label: string;
  tab1Content: ReactNode;
  tab2Label: string;
  tab2Content: ReactNode;
  tab3Label: string;
  tab3Content: ReactNode;
  tab3Badge?: ReactNode; // e.g. unread message count, shown next to the Chat label
}

export default function DashboardLayout({
  initialTab = 'tab1',
  tab1Label,
  tab1Content,
  tab2Label,
  tab2Content,
  tab3Label,
  tab3Content,
  tab3Badge,
}: DashboardLayoutProps) {
  const searchParams = useSearchParams();
  const selectedUserId = searchParams.get('userId');
  const [activeTab, setActiveTab] = useState<'tab1' | 'tab2' | 'tab3'>(initialTab);

  // Jump to the details tab when someone is picked from the overview (the chat no longer does this)
  useEffect(() => {
    if (selectedUserId) {
      setActiveTab('tab2');
    }
  }, [selectedUserId]);

  return (
    <div className="flex flex-col flex-1 h-full">
      {/* Mobile Navigation Bar */}
      <div className="md:hidden flex bg-white border-b border-slate-200 sticky top-[60px] z-10 shadow-sm shrink-0">
        <button
          onClick={() => setActiveTab('tab1')}
          className={`flex-1 py-3.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'tab1' ? 'border-[#0a7337] text-[#0a7337]' : 'border-transparent text-slate-500 hover:bg-slate-50'
          }`}
        >
          {tab1Label}
        </button>
        <button
          onClick={() => setActiveTab('tab2')}
          className={`flex-1 py-3.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'tab2' ? 'border-[#0a7337] text-[#0a7337]' : 'border-transparent text-slate-500 hover:bg-slate-50'
          }`}
        >
          {tab2Label}
        </button>
        <button
          onClick={() => setActiveTab('tab3')}
          className={`flex-1 py-3.5 text-xs font-bold border-b-2 transition-colors flex items-center justify-center ${
            activeTab === 'tab3' ? 'border-[#0a7337] text-[#0a7337]' : 'border-transparent text-slate-500 hover:bg-slate-50'
          }`}
        >
          {tab3Label}
          {tab3Badge}
        </button>
      </div>

      {/* Main Content Body */}
      <div className={`flex-1 flex flex-col md:flex-row md:gap-6 ${activeTab === 'tab3' ? 'py-0 md:py-6' : 'py-6'}`}>
        
        {/* Left/Main Column (Overview & Details) */}
        <div className={`flex-1 space-y-6 flex-col ${activeTab === 'tab3' ? 'hidden md:flex' : 'flex'}`}>
          <div className={`${activeTab === 'tab1' ? 'block' : 'hidden md:block'}`}>
            {tab1Content}
          </div>
          <div className={`${activeTab === 'tab2' ? 'block' : 'hidden md:block'}`}>
            {tab2Content}
          </div>
        </div>

        {/* Right Column (Chat View) */}
        <div className={`md:w-[400px] flex-col ${
          activeTab === 'tab3' 
            ? 'flex h-[calc(100vh-112px)] md:h-[550px] -mx-4 sm:mx-0' 
            : 'hidden md:flex md:h-[550px]'
        }`}>
          <h3 className="text-sm font-bold text-slate-900 mb-3 px-1 hidden md:flex items-center">
            {tab3Label}
            {tab3Badge}
          </h3>
          <div className="flex-1 flex flex-col min-h-0">
            {tab3Content}
          </div>
        </div>
        
      </div>
    </div>
  );
}
