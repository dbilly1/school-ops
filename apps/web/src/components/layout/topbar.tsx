'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStaffAuth } from '@/contexts/staff-auth';
import { staffApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

// ── Types ─────────────────────────────────────────────────────────────────────

type Notification = {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

// ── Bell icon ─────────────────────────────────────────────────────────────────

function BellIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ── Notification panel ────────────────────────────────────────────────────────

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const fetchNotifications = () => staffApi.get<Notification[]>('/school/notifications');
  const { data, loading } = useApi(fetchNotifications);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50"
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">Notifications</span>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 transition">
          Close
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
        )}
        {!loading && (!data || data.length === 0) && (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No notifications</div>
        )}
        {data?.map(n => (
          <div key={n.id} className={`px-4 py-3 ${n.isRead ? '' : 'bg-slate-50'}`}>
            <p className={`text-sm font-medium ${n.isRead ? 'text-slate-600' : 'text-slate-800'}`}>
              {n.title}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
            <p className="text-xs text-slate-300 mt-1">
              {new Date(n.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── User menu ─────────────────────────────────────────────────────────────────

function UserMenu({ onClose }: { onClose: () => void }) {
  const { user, logout } = useStaffAuth();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50"
    >
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-medium text-slate-800">
          {user?.firstName} {user?.lastName}
        </p>
        <p className="text-xs text-slate-400 truncate">{user?.email}</p>
      </div>
      <div className="py-1">
        <button
          onClick={() => { router.push('/school/settings/profile'); onClose(); }}
          className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition"
        >
          Profile settings
        </button>
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user } = useStaffAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showMenu, setShowMenu]     = useState(false);

  // Fetch unread count
  const fetchNotifs = () => staffApi.get<Notification[]>('/school/notifications');
  const { data: notifications } = useApi(fetchNotifs);
  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-100 px-4 sm:px-6 flex items-center justify-between gap-3">

      {/* Mobile menu toggle */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18 M3 6h18 M3 18h18" />
        </svg>
      </button>

      {/* Right cluster */}
      <div className="flex items-center gap-3 ml-auto">

      {/* Notification bell */}
      <div className="relative">
        <button
          onClick={() => { setShowNotifs(v => !v); setShowMenu(false); }}
          className="relative w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition"
        >
          <BellIcon />
          {unreadCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ backgroundColor: '#ef4444' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        {showNotifs && <NotificationPanel onClose={() => setShowNotifs(false)} />}
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => { setShowMenu(v => !v); setShowNotifs(false); }}
          className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-slate-50 transition"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <span className="text-sm font-medium text-slate-700 max-w-[120px] truncate">
            {user?.firstName} {user?.lastName}
          </span>
          <ChevronIcon />
        </button>
        {showMenu && <UserMenu onClose={() => setShowMenu(false)} />}
      </div>

      </div>
    </header>
  );
}
