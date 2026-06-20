'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useStaffAuth } from '@/contexts/staff-auth';
import { useFeature } from '@/hooks/use-feature';
import {
  OWNER_ADMIN,
  OWNER_ADMIN_TEACHER,
  OWNER_ADMIN_ACCOUNTANT,
  OWNER_ADMIN_TRANSPORT,
} from '@/lib/staff-roles';

// Guards every /school/* page against direct-URL access, mirroring exactly the
// role + feature gating the sidebar uses to show/hide nav links. A user who hits
// a route they aren't allowed to see is silently redirected to the dashboard.
// This is defense-in-depth + correct UX; the backend remains the real enforcer.

const REDIRECT_TO = '/school/dashboard';

type Rule = { prefix: string; roles?: string[]; featureKey?: string };

// Ordered most-specific-first isn't required here — prefixes are distinct
// top-level sections, so first match wins. Anything not listed (dashboard,
// students, account, onboarding) is allowed for any authenticated staff member,
// which keeps the redirect target always reachable (no loops).
const RULES: Rule[] = [
  { prefix: '/school/admissions',    roles: OWNER_ADMIN,            featureKey: 'admissions'    },
  { prefix: '/school/staff',         roles: OWNER_ADMIN                                          },
  { prefix: '/school/academics',     roles: OWNER_ADMIN_TEACHER,    featureKey: 'academics'     },
  { prefix: '/school/attendance',    roles: OWNER_ADMIN_TEACHER,    featureKey: 'attendance'    },
  { prefix: '/school/finance',       roles: OWNER_ADMIN_ACCOUNTANT, featureKey: 'finance'       },
  { prefix: '/school/expenses',      roles: OWNER_ADMIN_ACCOUNTANT, featureKey: 'finance'       },
  { prefix: '/school/feeding',       roles: OWNER_ADMIN_ACCOUNTANT, featureKey: 'feeding_fees'  },
  { prefix: '/school/transport',     roles: OWNER_ADMIN_TRANSPORT,  featureKey: 'transport'     },
  { prefix: '/school/communication',                                featureKey: 'communication' },
  { prefix: '/school/reports',       roles: OWNER_ADMIN                                          },
  { prefix: '/school/progression',   roles: OWNER_ADMIN                                          },
  { prefix: '/school/audit-logs',    roles: OWNER_ADMIN                                          },
  { prefix: '/school/settings',      roles: OWNER_ADMIN                                          },
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

// Isolates the useFeature hook so the parent's hook order stays stable across
// routes with and without a feature requirement.
function FeatureRouteGate({ featureKey, children }: { featureKey: string; children: ReactNode }) {
  const router = useRouter();
  const { isActive, loading } = useFeature(featureKey);

  useEffect(() => {
    if (!loading && !isActive) router.replace(REDIRECT_TO);
  }, [loading, isActive, router]);

  if (loading || !isActive) return <Spinner />;
  return <>{children}</>;
}

export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hasRole, loading } = useStaffAuth();

  const rule = matchRule(pathname);
  const roleDenied = !loading && !!rule?.roles && !rule.roles.some(r => hasRole(r));

  useEffect(() => {
    if (roleDenied) router.replace(REDIRECT_TO);
  }, [roleDenied, router]);

  if (loading) return <Spinner />;
  if (roleDenied) return <Spinner />;

  // Role check passed (or no rule). Apply the feature check if the rule has one.
  if (rule?.featureKey) {
    return <FeatureRouteGate featureKey={rule.featureKey}>{children}</FeatureRouteGate>;
  }

  return <>{children}</>;
}
