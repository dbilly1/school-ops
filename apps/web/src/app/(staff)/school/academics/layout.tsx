'use client';

import { usePathname } from 'next/navigation';

// The sub-pages now live in the sidebar as a collapsible "Academics" group, so
// this layout no longer renders a tab bar — just a breadcrumb for orientation.
const SUB_PAGES = [
  { label: 'Subjects',     href: '/school/academics/subjects'     },
  { label: 'Timetable',    href: '/school/academics/timetable'    },
  { label: 'Assessments',  href: '/school/academics/assessments'  },
  { label: 'Grade Book',   href: '/school/academics/grade-book'   },
  { label: 'Report Cards', href: '/school/academics/report-cards' },
  { label: 'Lesson Notes', href: '/school/academics/lesson-notes' },
  { label: 'Curriculum',   href: '/school/academics/curriculum' },
];

export default function AcademicsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = SUB_PAGES.find(p => pathname.startsWith(p.href));

  return (
    <div>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 mb-6 text-sm">
        <span className="text-slate-500">Academics</span>
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
