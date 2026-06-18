'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAdminAuth } from '@/contexts/admin-auth';
import { cn } from '@/lib/cn';

const NAV = [
  { label: 'Dashboard', href: '/admin/dashboard',  icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10' },
  { label: 'Packages',  href: '/admin/packages',   icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z' },
  { label: 'Schools',   href: '/admin/schools',    icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { label: 'Curriculum',href: '/admin/curriculum', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' },
  { label: 'Audit Logs',href: '/admin/audit-logs', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
];

function SvgIcon({ d }: { d: string }) {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const { admin, loading, logout } = useAdminAuth();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !admin && pathname !== '/admin/login') {
      router.replace('/admin/login');
    }
  }, [loading, admin, pathname, router]);

  if (pathname === '/admin/login') return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 rounded-full border-2 border-transparent border-t-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!admin) return null;

  async function handleLogout() {
    await logout();
    router.push('/admin/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col bg-slate-900 border-r border-white/5">
        <div className="px-4 py-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              S
            </div>
            <div>
              <p className="text-white text-sm font-semibold">SchoolOps</p>
              <p className="text-slate-500 text-xs">Super Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  active ? 'bg-emerald-600 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-white/5',
                )}
              >
                <SvgIcon d={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-white/5">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">{admin.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{admin.email}</p>
            </div>
            <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-slate-300 transition shrink-0 ml-2">
              Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <div className="px-8 py-7">{children}</div>
      </main>
    </div>
  );
}
