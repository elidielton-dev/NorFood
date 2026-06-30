import { getActiveTenantId } from "@/lib/tenant/active-tenant";
import { NORFOOD_DEMO_TENANT_ID } from "@/lib/tenant/constants";
import { isBrowserDemoEnabled } from "@/lib/runtime";

export function resolveTenantIdForQuery(): string {
  const id = getActiveTenantId();
  if (id) return id;
  if (isBrowserDemoEnabled()) return NORFOOD_DEMO_TENANT_ID;
  throw new Error("Restaurante não definido no contexto atual.");
}

/** Aplica filtro tenant_id em queries Supabase */
export function withTenantId<T extends { eq: (col: string, val: string) => T }>(query: T): T {
  return query.eq("tenant_id", resolveTenantIdForQuery());
}
