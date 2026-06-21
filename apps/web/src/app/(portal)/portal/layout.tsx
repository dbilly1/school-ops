'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { usePortalAuth } from '@/contexts/portal-auth';
import { cn } from '@/lib/cn';

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Home',        href: '/portal/dashboard',    icon: '🏠' },
  { label: 'Attendance',  href: '/portal/attendance',   icon: '📅' },
  { label: 'Timetable',   href: '/portal/timetable',    icon: '🗓' },
  { label: 'Grades',      href: '/portal/grades',       icon: '📊' },
  { label: 'Reports',     href: '/portal/report-cards', icon: '📄' },
  { label: 'Notices',     href: '/portal/notices',      icon: '📢' },
  { label: 'Transport',   href: '/portal/transport',    icon: '🚌' },
  { label: 'Feeding',     href: '/portal/feeding',      icon: '🍽' },
];

// Routes under /portal that must render WITHOUT a logged-in user. The login page
// lives inside this shell, so without this exemption the "no user" gate below
// blanks it out and redirects it to itself.
const PUBLIC_PORTAL_PATHS = ['/portal/login'];

export default function PortalShellLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = usePortalAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const isPublic = PUBLIC_PORTAL_PATHS.includes(pathname);

  useEffect(() => {
    if (!isPublic && !loading && !user) router.replace('/portal/login');
  }, [isPublic, loading, user, router]);

  // Force password change on first login
  useEffect(() => {
    if (!loading && user?.mustChangePassword && pathname !== '/portal/change-password') {
      router.replace('/portal/change-password');
    }
  }, [loading, user, pathname, router]);

  // Public routes (login) render bare — they bring their own full-screen layout
  // and must not be gated behind authentication.
  if (isPublic) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-transparent border-t-current animate-spin" style={{ color: 'var(--accent)' }} />
          <span className="text-sm text-slate-400">Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  async function handleLogout() {
    await logout();
    router.push('/portal/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top header */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            S
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 leading-tight">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-slate-400">{user.className ?? 'Student Portal'}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-slate-400 hover:text-slate-600 transition"
        >
          Sign out
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-slate-100 px-2 py-2 sticky bottom-0">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {NAV.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition min-w-[52px]',
                  active ? 'text-current' : 'text-slate-400 hover:text-slate-600',
                )}
                style={active ? { color: 'var(--accent)' } : {}}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
