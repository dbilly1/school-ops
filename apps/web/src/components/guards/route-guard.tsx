'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStaffAuth } from '@/contexts/staff-auth';
import { useNavPermissions } from '@/hooks/use-permission';
import {
  OWNER_ADMIN,
  OWNER_ADMIN_HEAD,
  OWNER_ADMIN_ACCOUNTANT,
} from '@/lib/staff-roles';

// Guards every /school/* page against direct-URL access, mirroring exactly the
// gating the sidebar uses to show/hide nav links. A user who hits a route they
// aren't allowed to see is silently redirected to the dashboard. This is
// defense-in-depth + correct UX; the backend remains the real enforcer.
//
// Feature routes gate on `permId` — the user's VIEW permission resolved through
// the engine (role defaults + role/user overrides + feature state), so a granted
// user-level override actually opens the route. Management routes stay role-based.

const REDIRECT_TO = '/school/dashboard';

type Rule = { prefix: string; roles?: string[]; permId?: string };

// Ordered most-specific-first isn't required here — prefixes are distinct
// top-level sections, so first match wins. Anything not listed (dashboard,
// students, account, onboarding) is allowed for any authenticated staff member,
// which keeps the redirect target always reachable (no loops).
const RULES: Rule[] = [
  { prefix: '/school/admissions',    permId: 'admissions'    },
  { prefix: '/school/staff',         roles: OWNER_ADMIN_HEAD },
  { prefix: '/school/users',         roles: OWNER_ADMIN_HEAD },
  { prefix: '/school/academics',     permId: 'academics'     },
  { prefix: '/school/attendance',    permId: 'attendance'    },
  { prefix: '/school/finance',       permId: 'finance'       },
  { prefix: '/school/expenses',      permId: 'expenses'      },
  { prefix: '/school/feeding',       permId: 'feeding_fees'  },
  { prefix: '/school/transport',     permId: 'transport'     },
  { prefix: '/school/communication', permId: 'communication' },
  { prefix: '/school/reports',       roles: OWNER_ADMIN_ACCOUNTANT },
  { prefix: '/school/progression',   roles: OWNER_ADMIN_HEAD       },
  { prefix: '/school/audit-logs',    roles: OWNER_ADMIN            },
  { prefix: '/school/settings',      roles: OWNER_ADMIN            },
];

function matchRule(pathname: string): Rule | undefined {
  return RULES.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));
}

function Spinner() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div
        className="w-7 h-7 rounded-full border-2 border-transparent border-t-current animate-spin"
        style={{ color: 'var(--accent)' }}
      />
    </div>
  );
}

export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hasRole, loading } = useStaffAuth();
  const { nav: navPerms, loading: permsLoading } = useNavPermissions();

  const rule = matchRule(pathname);
  const isOwnerOrAdmin = hasRole('SCHOOL_OWNER') || hasRole('SCHOOL_ADMIN');

  // Permission-gated routes wait on the engine result; role-gated routes only
  // need auth. Owner/Admin bypass both.
  const permPending = !!rule?.permId && !isOwnerOrAdmin && permsLoading;

  const roleDenied = !loading && !!rule?.roles && !rule.roles.some(r => hasRole(r));
  const permDenied =
    !loading && !permsLoading && !!rule?.permId && !isOwnerOrAdmin && !navPerms[rule.permId];
  const denied = roleDenied || permDenied;

  useEffect(() => {
    if (denied) router.replace(REDIRECT_TO);
  }, [denied, router]);

  if (loading || permPending) return <Spinner />;
  if (denied) return <Spinner />;

  return <>{children}</>;
}
