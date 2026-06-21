'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { usePortalAuth } from '@/contexts/portal-auth';

type Notice = { id: string; title: string; publishedAt: string };
type Notification = { id: string; title: string; body: string; isRead: boolean; createdAt: string };

const QUICK_LINKS = [
  { label: 'Attendance',   href: '/portal/attendance',   icon: '📅' },
  { label: 'Timetable',    href: '/portal/timetable',    icon: '🗓' },
  { label: 'Grades',       href: '/portal/grades',       icon: '📊' },
  { label: 'Reports',      href: '/portal/report-cards', icon: '📄' },
  { label: 'Notices',      href: '/portal/notices',      icon: '📢' },
  { label: 'Transport',    href: '/portal/transport',    icon: '🚌' },
  { label: 'Feeding',      href: '/portal/feeding',      icon: '🍽' },
];

export default function PortalDashboard() {
  const { user } = usePortalAuth();

  const fetchNotices = useCallback(() => portalApi.get<Notice[]>('/portal/notices').catch(() => []), []);
  const fetchNotifs  = useCallback(() => portalApi.get<Notification[]>('/portal/notifications').catch(() => []), []);
  const { data: notices } = useApi(fetchNotices);
  const { data: notifs }  = useApi(fetchNotifs);

  const unread = notifs?.filter(n => !n.isRead).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Greeting hero */}
      <div className="rounded-2xl px-5 py-5 text-white" style={{ backgroundColor: 'var(--accent)' }}>
        <p className="text-sm opacity-80">{getGreeting()},</p>
        <h1 className="text-2xl font-bold leading-tight">{user?.firstName} {user?.lastName}</h1>
        <div className="flex items-center gap-2 mt-2 text-xs opacity-80">
          {user?.className && <span className="px-2 py-0.5 rounded-full bg-white/15">{user.className}</span>}
          {user?.studentId && <span className="font-mono">{user.studentId}</span>}
        </div>
      </div>

      {/* Unread notifications */}
      {unread > 0 && (
        <Link href="/portal/notices" className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-100 shadow-sm">
          <span className="text-lg">🔔</span>
          <span className="text-sm font-medium text-slate-700">
            You have {unread} unread notification{unread !== 1 ? 's' : ''}
          </span>
          <span className="ml-auto text-slate-300">›</span>
        </Link>
      )}

      {/* Quick links grid */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Quick access</p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
          {QUICK_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center gap-1.5 py-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
            >
              <span className="text-2xl">{link.icon}</span>
              <span className="text-[10px] font-medium text-slate-600 text-center leading-tight">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent notices */}
      {notices && notices.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Recent notices</p>
            <Link href="/portal/notices" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>View all →</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {notices.slice(0, 3).map(n => (
              <div key={n.id} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
                <p className="text-sm font-medium text-slate-800">{n.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(n.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
