'use client';

import { usePathname } from 'next/navigation';

// The sub-pages now live in the sidebar as a collapsible "Transport" group, so
// this layout no longer renders a tab bar — just a breadcrumb for orientation.
const SUB_PAGES = [
  { label: 'Routes',     href: '/school/transport/routes'   },
  { label: 'Vehicles',   href: '/school/transport/vehicles' },
  { label: 'Drivers',    href: '/school/transport/drivers'  },
  { label: 'Daily Fees', href: '/school/transport/fees'     },
];

export default function TransportLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = SUB_PAGES.find(p => pathname.startsWith(p.href));

  return (
    <div>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 mb-6 text-sm">
        <span className="text-slate-500">Transport</span>
        <svg className="w-3.5 h-3.5 text-slate-300" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className="font-medium text-slate-800">{current?.label ?? ''}</span>
      </nav>

      {children}
    </div>
  );
}
