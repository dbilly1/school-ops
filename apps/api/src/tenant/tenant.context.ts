import { AsyncLocalStorage } from 'async_hooks';

interface TenantStore {
  schoolId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getCurrentSchoolId(): string {
  const store = tenantStorage.getStore();
  if (!store) throw new Error('No tenant context — is TenantInterceptor applied?');
  return store.schoolId;
}
