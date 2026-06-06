'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStaffAuth } from '@/contexts/staff-auth';
import { cn } from '@/lib/cn';

const ALL_TABS = [
  { label: 'Subjects',     href: '/school/academics/subjects',     ownerAdminOnly: true  },
  { label: 'Timetable',    href: '/school/academics/timetable',    ownerAdminOnly: false },
  { label: 'Assessments',  href: '/school/academics/assessments',  ownerAdminOnly: false },
  { label: 'Grade Book',   href: '/school/academics/grade-book',   ownerAdminOnly: false },
  { label: 'Report Cards', href: '/school/academics/report-cards', ownerAdminOnly: false },
];

export default function AcademicsLayout({ children }: { children: React.ReactNode }) {
  const pathname   = usePathname();
  const { isOwner, isAdmin } = useStaffAuth();
  const isTeacherOnly = !isOwner && !isAdmin;

  const tabs = ALL_TABS.filter(t => !t.ownerAdminOnly || !isTeacherOnly);

  return (
    <div>
      {/* Sub-nav tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {tabs.map(tab => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-current'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
              style={active ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
