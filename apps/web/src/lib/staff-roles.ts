// Shared staff role sets — used by both the sidebar (to gate nav links) and the
// route guard (to gate the pages themselves). Keep these in one place so nav
// visibility and route access never drift apart.

export const OWNER_ADMIN            = ['SCHOOL_OWNER', 'SCHOOL_ADMIN'];
export const OWNER_ADMIN_TEACHER    = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'TEACHER'];
export const OWNER_ADMIN_ACCOUNTANT = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'ACCOUNTANT'];
export const OWNER_ADMIN_TRANSPORT  = ['SCHOOL_OWNER', 'SCHOOL_ADMIN', 'TRANSPORT_OFFICER'];
