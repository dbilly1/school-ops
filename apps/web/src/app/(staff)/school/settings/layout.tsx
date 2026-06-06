'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStaffAuth } from '@/contexts/staff-auth';
import { cn } from '@/lib/cn';

const NAV = [
  {
    section: 'School',
    items: [
      { label: 'Profile & Branding',   href: '/school/settings/profile'            },
      { label: 'Grade Structure',       href: '/school/settings/grade-structure'    },
      { label: 'Student Categories',    href: '/school/settings/student-categories' },
    ],
  },
  {
    section: 'Academic',
    items: [
      { label: 'Academic Years & Terms', href: '/school/settings/academic-year' },
      { label: 'School Calendar',        href: '/school/settings/calendar'      },
      { label: 'Grading Scale',          href: '/school/settings/grading'       },
      { label: 'Report Card Layout',     href: '/school/settings/report-card'   },
    ],
  },
  {
    section: 'Operations',
    items: [
      { label: 'Feeding Fees', href: '/school/settings/feeding' },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isOwner, isAdmin } = useStaffAuth();

  // Redirect to profile if hitting /school/settings directly is handled by page.tsx
  return (
    <div className="flex gap-8 items-start">

      {/* ── Secondary nav ── */}
      <aside className="w-52 shrink-0 sticky top-0">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Settings</p>
        <nav className="space-y-5">
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 px-2">
                {section}
              </p>
              <div className="space-y-0.5">
                {items.map(item => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'block px-3 py-2 rounded-lg text-sm transition-colors',
                        active
                          ? 'font-semibold text-white'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
                      )}
                      style={active ? { backgroundColor: 'var(--accent)' } : {}}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Page content ── */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
