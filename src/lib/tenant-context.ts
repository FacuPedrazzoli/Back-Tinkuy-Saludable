import { AsyncLocalStorage } from "async_hooks";

interface TenantContext {
  tenantId: string | null;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantId(): string | null {
  const store = tenantStorage.getStore();
  return store?.tenantId ?? null;
}

export function setTenantId(tenantId: string | null): void {
  const store = tenantStorage.getStore();
  if (store) {
    store.tenantId = tenantId;
  }
}

export async function runWithTenant<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}

export function runWithTenantSync<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn);
}

export { tenantStorage };
