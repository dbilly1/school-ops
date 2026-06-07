'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useStaffAuth } from '@/contexts/staff-auth';
import { useTeacherScope } from '@/hooks/use-teacher-scope';
import { useFeature } from '@/hooks/use-feature';
import { cn } from '@/lib/cn';

// ── Icons (inline SVG — no icon library dependency) ───────────────────────────

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      className={cn('w-[18px] h-[18px] shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const icons = {
  dashboard:     'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  admissions:    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  students:      'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  staff:         'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  academics:     'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  attendance:    'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  finance:       'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  feeding:       'M18 8h1a4 4 0 0 1 0 8h-1 M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z M6 1v3 M10 1v3 M14 1v3',
  transport:     'M1 3h15v13H1z M16 8h4l3 3v5h-7V8z M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  communication: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  reports:       'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  audit:         'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  settings:      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
};

// ── Nav item types ────────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  iconPath: string;
  id?: string;           // optional id for custom visibility logic
  featureKey?: string;   // gated — item hidden if feature not ACTIVE
  roles?: string[];      // if set, item only shows for users with at least one matching role
};

// ── Feature-gated nav link ────────────────────────────────────────────────────

function GatedNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { state, loading } = useFeature(item.featureKey!);
  if (loading || state !== 'ACTIVE') return null;
  return <NavLink item={item} active={active} />;
}

// ── Plain nav link ────────────────────────────────────────────────────────────

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
        active
          ? 'text-white font-medium'
          : 'text-slate-400 hover:text-white hover:bg-white/10',
      )}
      style={active ? { backgroundColor: 'var(--accent)' } : {}}
    >
      <Icon d={item.iconPath} />
      <span>{item.label}</span>
    </Link>
  );
}

// ── Nav section ───────────────────────────────────────────────────────────────

function NavSection({ label, items, pathname, hasRole, hiddenIds }: {
  label: string;
  items: NavItem[];
  pathname: string;
  hasRole: (role: string) => boolean;
  hiddenIds?: string[];
}) {
  const visibleItems = items.filter(item => {
    if (item.roles && !item.roles.some(r => hasRole(r))) return false;
    if (item.id && hiddenIds?.includes(item.id)) return false;
    return true;
  });

  if (visibleItems.length === 0) return null;

  return (
    <div>
      <p className="px-3 mb-1 text-[10px] uppercase tracking-widest font-semibold text-slate-500">
        {label}
      </p>
      <div className="space-y-0.5">
        {visibleItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          if (item.featureKey) return <GatedNavLink key={item.href} item={item} active={active} />;
          return <NavLink key={item.href} item={item} active={active} />;
        })}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

// Shorthand role sets
const OWNER_ADMIN            = ['SCHOOL_OWNER', 'SCHOOL_ADMIN'];
const OWNER_ADMIN_TEACHER    = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'TEACHER'];
const OWNER_ADMIN_ACCOUNTANT = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'ACCOUNTANT'];
const OWNER_ADMIN_TRANSPORT  = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'TRANSPORT_OFFICER'];

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Main',
    items: [
      { label: 'Dashboard', href: '/school/dashboard', iconPath: icons.dashboard },
    ],
  },
  {
    section: 'People',
    items: [
      { label: 'Admissions', href: '/school/admissions', iconPath: icons.admissions, featureKey: 'admissions', roles: OWNER_ADMIN },
      { label: 'Students',   href: '/school/students',   iconPath: icons.students },
      { label: 'Staff',      href: '/school/staff',      iconPath: icons.staff,      roles: OWNER_ADMIN },
    ],
  },
  {
    section: 'Academics',
    items: [
      { label: 'Academics',  href: '/school/academics',  iconPath: icons.academics,  featureKey: 'academics',  roles: OWNER_ADMIN_TEACHER },
      { label: 'Attendance', href: '/school/attendance', iconPath: icons.attendance, featureKey: 'attendance', roles: OWNER_ADMIN_TEACHER, id: 'attendance' },
    ],
  },
  {
    section: 'Finance & Ops',
    items: [
      { label: 'Finance',   href: '/school/finance',   iconPath: icons.finance,   featureKey: 'finance',      roles: OWNER_ADMIN_ACCOUNTANT },
      { label: 'Feeding',   href: '/school/feeding',   iconPath: icons.feeding,   featureKey: 'feeding_fees', roles: OWNER_ADMIN_ACCOUNTANT },
      { label: 'Transport', href: '/school/transport', iconPath: icons.transport, featureKey: 'transport',    roles: OWNER_ADMIN_TRANSPORT  },
    ],
  },
  {
    section: 'Communication',
    items: [
      { label: 'Communication', href: '/school/communication', iconPath: icons.communication, featureKey: 'communication' },
    ],
  },
  {
    section: 'Insights',
    items: [
      { label: 'Reports',     href: '/school/reports',     iconPath: icons.reports,     roles: OWNER_ADMIN },
      { label: 'Progression', href: '/school/progression', iconPath: icons.students, roles: OWNER_ADMIN },
      { label: 'Audit Logs',  href: '/school/audit-logs',  iconPath: icons.audit,    roles: OWNER_ADMIN },
    ],
  },
];

// Shared inner content — rendered both in the desktop rail and the mobile drawer.
function SidebarBody() {
  const pathname = usePathname();
  const { branding, hasRole } = useStaffAuth();
  const scope = useTeacherScope();

  const isOwnerOrAdmin = hasRole('SCHOOL_OWNER') || hasRole('SCHOOL_ADMIN');
  // A pure teacher only sees Attendance if they have at least one assigned class
  const canSeeAttendance = isOwnerOrAdmin || (scope.restricted ? scope.assignedClassIds.length > 0 : true);

  return (
    <>
      {/* School identity */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.name}
              className="w-8 h-8 rounded-lg object-cover"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {branding?.name?.[0]?.toUpperCase() ?? 'S'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">
              {branding?.name ?? 'SchoolOps'}
            </p>
            <p className="text-slate-500 text-xs">Staff Portal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map(({ section, items }) => (
          <NavSection
            key={section}
            label={section}
            items={items}
            pathname={pathname}
            hasRole={hasRole}
            hiddenIds={canSeeAttendance ? [] : ['attendance']}
          />
        ))}
      </nav>

      {/* Settings — owners and admins only */}
      {isOwnerOrAdmin && (
        <div className="px-3 py-3 border-t border-white/10">
          <NavLink
            item={{ label: 'Settings', href: '/school/settings', iconPath: icons.settings }}
            active={pathname.startsWith('/school/settings')}
          />
        </div>
      )}
    </>
  );
}

// Desktop rail — hidden below lg (the mobile drawer takes over there).
export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 hidden lg:flex flex-col h-full bg-slate-900">
      <SidebarBody />
    </aside>
  );
}

// Mobile slide-in drawer with backdrop.
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={cn('lg:hidden fixed inset-0 z-50', open ? '' : 'pointer-events-none')} aria-hidden={!open}>
      {/* Backdrop */}
      <div
        className={cn('absolute inset-0 bg-black/40 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className={cn(
          'absolute inset-y-0 left-0 w-60 flex flex-col bg-slate-900 shadow-xl transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarBody />
      </aside>
    </div>
  );
}
