'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStaffAuth } from '@/contexts/staff-auth';
import { Sidebar, MobileSidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { RouteGuard } from '@/components/guards/route-guard';

// Darken a #rgb / #rrggbb colour toward black (factor < 1 = darker). Used for
// the sidebar rail so it's a deep shade of the school's brand colour.
function darkenHex(hex: string, factor = 0.55): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
  const n = parseInt(full, 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export default function SchoolShellLayout({ children }: { children: React.ReactNode }) {
  const { user, branding, loading } = useStaffAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer whenever the route changes
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // Only the school owner is redirected to onboarding — no other role
    const isOwner = user.roles.includes('SCHOOL_OWNER');
    if (isOwner && !user.onboardingComplete && pathname !== '/school/onboarding') {
      router.replace('/school/onboarding');
    }
  }, [loading, user, pathname, router]);

  // Apply school brand color
  useEffect(() => {
    const root = document.documentElement;
    if (branding?.primaryColor) {
      root.style.setProperty('--accent', branding.primaryColor);
      root.style.setProperty('--accent-hover', branding.primaryColor);
      root.style.setProperty('--accent-dark', darkenHex(branding.primaryColor));
    } else {
      root.style.setProperty('--accent', '#065f46');
      root.style.setProperty('--accent-hover', '#047857');
      root.style.setProperty('--accent-dark', '#022c22');
    }
  }, [branding?.primaryColor]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-transparent border-t-current animate-spin"
            style={{ color: 'var(--accent)' }}
          />
          <span className="text-sm text-slate-400">Loading workspace…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // Render children without the app shell while the owner is in onboarding
  const isOwner = user.roles.includes('SCHOOL_OWNER');
  if (isOwner && !user.onboardingComplete) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <MobileSidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
