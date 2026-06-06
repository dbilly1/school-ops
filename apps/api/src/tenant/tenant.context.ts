import { AsyncLocalStorage } from 'async_hooks';

interface TenantStore {
  schoolId: string;
}

// Populated per-request by TenantInterceptor; consumed by the Prisma
// tenant-scope middleware (see prisma/tenant-scope.middleware.ts).
export const tenantStorage = new AsyncLocalStorage<TenantStore>();
