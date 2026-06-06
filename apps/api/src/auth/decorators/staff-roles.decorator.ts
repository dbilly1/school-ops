import { SetMetadata } from '@nestjs/common';
import { StaffRole } from '@prisma/client';

export const STAFF_ROLES_KEY = 'required_staff_roles';

/**
 * Restrict a route to staff holding at least one of the given roles.
 *
 * Used for management/configuration endpoints that are not modelled as package
 * features (user management, school setup, reports, progression) — typically
 * `@RequireStaffRole('SCHOOL_OWNER', 'SCHOOL_ADMIN')` on write endpoints, with
 * read endpoints left open to any authenticated staff.
 */
export const RequireStaffRole = (...roles: StaffRole[]) =>
  SetMetadata(STAFF_ROLES_KEY, roles);
