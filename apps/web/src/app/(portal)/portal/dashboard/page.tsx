'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { portalApi } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { usePortalAuth } from '@/contexts/portal-auth';

type Notice = { id: string; title: string; publishedAt: string };
type Notification = { id: string; title: string; body: string; isRead: boolean; createdAt: string };

export default function PortalDashboard() {
  const { user } = usePortalAuth();

  const fetchNotices = useCallback(() =>
    portalApi.get<Notice[]>('/portal/notices').catch(() => []), []);
  const fetchNotifs = useCallback(() =>
    portalApi.get<Notification[]>('/portal/notifications').catch(() => []), []);

  const { data: notices } = useApi(fetchNotices);
  const { data: notifs }  = useApi(fetchNotifs);

  const unread = notifs?.filter(n => !n.isRead).length ?? 0;

  const quickLinks = [
    { label: 'Attendance',   href: '/portal/attendance',   icon: '📅', color: '#3b82f6' },
    { label: 'Timetable',    href: '/portal/timetable',    icon: '🗓',  color: '#8b5cf6' },
    { label: 'Grades',       href: '/portal/grades',       icon: '📊', color: '#f59e0b' },
    { label: 'Report Cards', href: '/portal/report-cards', icon: '📄', color: '#22c55e' },
    { label: 'Notices',      href: '/portal/notices',      icon: '📢', color: '#ef4444' },
    { label: 'Transport',    href: '/portal/transport',    icon: '🚌', color: '#0ea5e9' },
    { label: 'Feeding',      href: '/portal/feeding',      icon: '🍽',  color: '#f97316' },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="pt-2">
        <h1 className="text-xl font-bold text-slate-900">
          {getGreeting()}, {user?.firstName}!
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {user?.className ? `${user.className} · ` : ''}Student Portal
        </p>
      </div>

      {/* Unread notifications */}
      {unread > 0 && (
        <div
          className="px-4 py-3 rounded-xl text-sm font-medium text-white flex items-center gap-2"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <span>🔔</span>
          <span>You have {unread} unread notification{unread !== 1 ? 's' : ''}.</span>
        </div>
      )}

      {/* Quick links grid */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Quick access</p>
        <div className="grid grid-cols-4 gap-3">
          {quickLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col items-center gap-1.5 py-3 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow transition"
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
            <Link href="/portal/notices" className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {notices.slice(0, 3).map(n => (
              <div key={n.id} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
                <p className="text-sm font-medium text-slate-800">{n.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(n.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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
