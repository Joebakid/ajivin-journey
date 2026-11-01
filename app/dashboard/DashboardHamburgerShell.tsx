'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  FiMenu,
  FiX,
  FiNavigation,
  FiTruck,
  FiPlusCircle,
  FiDollarSign,
  FiClock,
  FiMessageSquare,
  FiUser,
  FiCheckSquare,
  FiMapPin,
  FiUsers,
  FiBell,
  FiLogOut,
  FiChevronRight,
} from 'react-icons/fi';
import { IconType } from 'react-icons';
import Logo from '@/app/components/Logo';
import Container from '@/app/components/Container';
import { markAllNotificationsReadAction } from '@/app/actions/notification';

interface ShellProps {
  userId: number;
  userName: string;
  userRole: 'driver' | 'manager' | 'staff';
  notifications?: any[];
  children: React.ReactNode;
}

interface MenuItem {
  key: string;
  label: string;
  href: string;
  icon: IconType;
}

// Dynamically maps each role to their exact views and URLs
const ROLE_MENUS: Record<'driver' | 'manager' | 'staff', MenuItem[]> = {
  driver: [
    { key: 'journey', label: 'Current Journey & Request', href: '/dashboard/driver?view=journey', icon: FiNavigation },
    { key: 'vehicle', label: 'Assigned Vehicle', href: '/dashboard/driver?view=vehicle', icon: FiTruck},
    { key: 'log-expense', label: 'Submit New Expense', href: '/dashboard/driver?view=log-expense', icon: FiPlusCircle },
    { key: 'expenses', label: 'Vehicle Expenses & Repairs', href: '/dashboard/driver?view=expenses', icon: FiDollarSign },
    { key: 'history', label: 'My Journey Log', href: '/dashboard/driver?view=history', icon: FiClock },
    { key: 'chat', label: 'Dispatch Chat', href: '/dashboard/driver?view=chat', icon: FiMessageSquare },
    { key: 'profile', label: 'My Profile', href: '/dashboard/profile', icon: FiUser },
  ],
  manager: [
    { key: 'approvals', label: 'Pending Clearances', href: '/dashboard/manager?view=approvals', icon: FiCheckSquare },
    { key: 'active', label: 'Active Journeys & Live Map', href: '/dashboard/manager?view=active', icon: FiMapPin },
    { key: 'fleet', label: 'Vehicle Fleet & Expenses', href: '/dashboard/manager?view=fleet', icon: FiTruck },
    { key: 'personnel', label: 'Personnel & Activity', href: '/dashboard/manager?view=personnel', icon: FiUsers },
    { key: 'chat', label: 'Dispatch Chat', href: '/dashboard/manager?view=chat', icon: FiMessageSquare},
    { key: 'profile', label: 'My Profile', href: '/dashboard/profile', icon: FiUser },
  ],
  staff: [
    { key: 'request', label: 'Request / Book a Trip', href: '/dashboard/staff?view=request', icon: FiNavigation },
    { key: 'trips', label: 'My Trips & Tracking', href: '/dashboard/staff?view=trips', icon: FiClock },
    { key: 'fleet', label: 'Vehicle Fleet Directory', href: '/dashboard/staff?view=fleet', icon: FiTruck },
    { key: 'chat', label: 'Fleet Broadcast Chat', href: '/dashboard/staff?view=chat', icon: FiMessageSquare },
    { key: 'profile', label: 'My Profile', href: '/dashboard/profile', icon: FiUser },
  ],
};

export default function DashboardHamburgerShell({
  userId,
  userName,
  userRole,
  notifications = [],
  children,
}: ShellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const menuItems = ROLE_MENUS[userRole] || ROLE_MENUS.driver;
  
  const currentView = pathname.includes('/profile')
    ? 'profile'
    : searchParams.get('view') || menuItems[0].key;

  const activeItem = menuItems.find((item) => item.key === currentView) || menuItems[0];
  const ActiveHeaderIcon = activeItem.icon || FiNavigation;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Auto-close menus on route/view change
  useEffect(() => {
    setIsOpen(false);
    setIsNotifOpen(false);
  }, [pathname, searchParams]);

  const toggleNotifications = async () => {
    setIsNotifOpen(!isNotifOpen);
    // Mark as read in the background when opening the modal
    if (!isNotifOpen && unreadCount > 0) {
      await markAllNotificationsReadAction(userId, userRole);
    }
  };

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    } finally {
      document.cookie = 'userId=; Max-Age=0; path=/;';
      document.cookie = 'ajivin_session_id=; Max-Age=0; path=/;';
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <div className="min-h-[calc(100vh-55px)] bg-slate-50 flex flex-col relative">
      
      {/* Invisible backdrop for Notifications Modal */}
      {isNotifOpen && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => setIsNotifOpen(false)}
        />
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <Container className="h-16 flex items-center justify-between gap-4">
          
          {/* Left: Hamburger + Brand + Active Page Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsOpen(true)}
              aria-label="Open Navigation Menu"
              className="p-2.5 rounded-xl text-slate-700 bg-white hover:bg-green-50 hover:text-[#0a7337] hover:border-green-200 active:scale-95 transition-all border border-slate-200 shrink-0 cursor-pointer"
            >
              <FiMenu className="w-5 h-5" />
            </button>

            <Logo />

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200 min-w-0">
              <ActiveHeaderIcon className="w-4 h-4 text-[#0a7337] shrink-0" />
              <span className="text-sm font-bold text-slate-800 truncate">
                {activeItem?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Right: Notifications + User Profile Pill + Visible Logout Button */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            
            {/* Notification Bell with Dropdown Modal */}
            <div className="relative z-50">
              <button
                onClick={toggleNotifications}
                className="p-2 sm:p-2.5 rounded-full sm:rounded-xl text-slate-500 bg-white hover:bg-green-50 hover:text-[#0a7337] hover:border-green-200 active:scale-95 transition-all border border-slate-200 shrink-0 flex items-center justify-center relative cursor-pointer"
                aria-label="View Notifications"
              >
                <FiBell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                )}
              </button>

              {isNotifOpen && (
                <div className="absolute top-full right-0 mt-3 w-[320px] max-h-[450px] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <span className="text-sm font-bold text-slate-900">Notifications Feed</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold bg-[#0a7337] text-white px-2 py-0.5 rounded-full">
                        {unreadCount} New
                      </span>
                    )}
                  </div>
                  
                  <div className="overflow-y-auto flex-1 p-2">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-xs font-medium text-slate-400">
                        No notifications yet.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {notifications.map((notif) => (
                          <div 
                            key={notif.id} 
                            className={`p-3.5 rounded-xl flex flex-col gap-1 transition-colors ${
                              notif.is_read ? 'hover:bg-slate-50' : 'bg-green-50/50 border border-green-100'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-xs font-bold text-slate-900 leading-tight">{notif.title}</span>
                              {!notif.is_read && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#0a7337] shrink-0 mt-1"></span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-600 leading-relaxed">{notif.message}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                              {notif.time}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/dashboard/profile"
              className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#0a7337] text-white flex items-center justify-center text-xs font-extrabold uppercase">
                {userName.charAt(0)}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-slate-900 leading-none">{userName}</span>
                <span className="text-[10px] font-bold uppercase text-[#0a7337] mt-0.5">{userRole}</span>
              </div>
            </Link>

            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-600 hover:text-white border border-red-200 hover:border-red-600 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <FiLogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{isLoggingOut ? 'Signing out...' : 'Logout'}</span>
            </button>
          </div>
        </Container>
      </header>

      {/* Dark Backdrop Overlay for Mobile Hamburger Menu */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-out Hamburger Drawer */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-80 bg-white border-r border-slate-200 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer User Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#0a7337] text-white flex items-center justify-center text-base font-black uppercase shadow-xs shrink-0">
              {userName.charAt(0)}
            </div>
            <div className="min-w-0">
              <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-green-100 text-[#0a7337]">
                {userRole} portal
              </span>
              <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{userName}</p>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Navigation Links */}
        <div className="px-4 pt-4 pb-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">
            Navigation Menu
          </p>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = item.key === currentView;
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`group flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-[#0a7337] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-[#0a7337]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                <FiChevronRight
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                    isActive ? 'text-white' : 'text-slate-300 group-hover:text-slate-600'
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        {/* Drawer Footer with Prominent Full-Width Logout Button */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-600 hover:text-white border border-red-200 hover:border-red-600 transition-all active:scale-95 cursor-pointer shadow-2xs"
          >
            <FiLogOut className="w-4 h-4" />
            <span>{isLoggingOut ? 'Signing Out...' : 'Sign Out of Account'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Wrapped in Container */}
      <main className="flex-1 py-6">
        <Container>{children}</Container>
      </main>
    </div>
  );
}