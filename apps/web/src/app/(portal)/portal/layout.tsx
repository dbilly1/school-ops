'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { usePortalAuth } from '@/contexts/portal-auth';
import { usePortalBranding } from '@/contexts/portal-branding';
import { PortalIcon, type PortalIconName } from '@/components/portal/icons';
import { cn } from '@/lib/cn';

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV: { label: string; href: string; icon: PortalIconName }[] = [
  { label: 'Home',       href: '/portal/dashboard',    icon: 'home' },
  { label: 'Attendance', href: '/portal/attendance',   icon: 'attendance' },
  { label: 'Timetable',  href: '/portal/timetable',    icon: 'timetable' },
  { label: 'Grades',     href: '/portal/grades',       icon: 'grades' },
  { label: 'Reports',    href: '/portal/report-cards', icon: 'reports' },
  { label: 'Notices',    href: '/portal/notices',      icon: 'notices' },
  { label: 'Transport',  href: '/portal/transport',    icon: 'transport' },
  { label: 'Feeding',    href: '/portal/feeding',      icon: 'feeding' },
];

// Routes under /portal that must render WITHOUT a logged-in user. The login page
// lives inside this shell, so without this exemption the "no user" gate below
// blanks it out and redirects it to itself.
const PUBLIC_PORTAL_PATHS = ['/portal/login'];

function BrandMark({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const branding = usePortalBranding();
  const box = size === 'md' ? 'w-9 h-9 text-base' : 'w-8 h-8 text-sm';
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {branding.logoUrl ? (
        <img src={branding.logoUrl} alt={branding.name ?? 'School'} className={cn('rounded-xl object-cover bg-white shrink-0', box)} />
      ) : (
        <div className={cn('rounded-xl flex items-center justify-center text-white font-bold shrink-0', box)} style={{ backgroundColor: 'var(--accent)' }}>
          {branding.name?.[0]?.toUpperCase() ?? 'S'}
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <p className="font-semibold text-slate-800 truncate text-sm">{branding.name ?? 'School'}</p>
        <p className="text-[11px] text-slate-400">Student Portal</p>
      </div>
    </div>
  );
}

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

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 bg-white border-r border-slate-100">
        <div className="px-5 py-5 border-b border-slate-100">
          <BrandMark size="md" />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition',
                  active ? 'font-semibold' : 'text-slate-600 hover:bg-slate-50',
                )}
                style={active ? { backgroundColor: 'var(--accent-tint)', color: 'var(--accent-dark)' } : {}}
              >
                <PortalIcon name={item.icon} className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-3 border-t border-slate-100">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-slate-400 truncate">{user.className ?? 'Student'}</p>
            </div>
            <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-slate-600 transition shrink-0">Sign out</button>
          </div>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────────── */}
      <div className="lg:pl-64 flex-1 flex flex-col min-h-screen">
        {/* Mobile top header */}
        <header className="lg:hidden bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <BrandMark />
          <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-slate-600 transition">Sign out</button>
        </header>

        {/* Desktop top bar */}
        <header className="hidden lg:flex bg-white/70 backdrop-blur border-b border-slate-100 px-8 py-3 items-center justify-end sticky top-0 z-10">
          <p className="text-sm text-slate-500">
            {user.firstName} {user.lastName}
            {user.className ? <span className="text-slate-300"> · {user.className}</span> : null}
          </p>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 lg:px-8 lg:py-8 pb-24 lg:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-1.5 py-1.5 z-10">
          <div className="flex items-center justify-between overflow-x-auto no-scrollbar">
            {NAV.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition min-w-[44px] shrink-0"
                  style={active ? { color: 'var(--accent)' } : { color: '#94a3b8' }}
                >
                  <PortalIcon name={item.icon} className="w-5 h-5" />
                  <span className="text-[9px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
