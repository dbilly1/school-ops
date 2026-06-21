// Shared staff role sets — used by both the sidebar (to gate nav links) and the
// route guard (to gate the pages themselves). Keep these in one place so nav
// visibility and route access never drift apart.

// Roles that a Headmaster (academic head) may NOT grant — they unlock areas the
// Headmaster has no access to. Mirrors UsersService.FINANCE_OPS_ROLES on the API.
const FINANCE_OPS_ROLES = ['ACCOUNTANT', 'TRANSPORT_OFFICER'];

// Which roles the current actor may assign to others. Keep in sync with
// UsersService.assertCanGrantRoles so the picker never offers a role the backend
// will reject:
//   • Owner       → any role
//   • Admin       → any role except Owner/Admin/Headmaster (appoint-once roles)
//   • Headmaster  → academic roles only (also no Finance/Ops roles)
export function assignableRoles<T extends { value: string }>(
  roles: T[],
  caps: { isOwner: boolean; isAdmin: boolean; isHeadmaster: boolean },
): T[] {
  if (caps.isOwner) return roles;
  const headmasterOnly = caps.isHeadmaster && !caps.isAdmin;
  return roles.filter((r) => {
    if (r.value === 'SCHOOL_ADMIN' || r.value === 'HEADMASTER') return false;
    if (headmasterOnly && FINANCE_OPS_ROLES.includes(r.value)) return false;
    return true;
  });
}

export const OWNER_ADMIN              = ['SCHOOL_OWNER', 'SCHOOL_ADMIN'];
// The Headmaster (academic head) sits alongside Owner/Admin for People &
// Academics, but is excluded from Finance & Ops and aggregate Reports.
export const OWNER_ADMIN_HEAD         = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'HEADMASTER'];
export const OWNER_ADMIN_HEAD_TEACHER = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'HEADMASTER', 'TEACHER'];
export const OWNER_ADMIN_ACCOUNTANT   = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'ACCOUNTANT'];
export const OWNER_ADMIN_TRANSPORT    = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'TRANSPORT_OFFICER'];
