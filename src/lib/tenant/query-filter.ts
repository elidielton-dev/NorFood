import { getActiveTenantId } from "@/lib/tenant/active-tenant";
import { NORFOOD_DEMO_TENANT_ID } from "@/lib/tenant/constants";

export function resolveTenantIdForQuery(): string {
  return getActiveTenantId() ?? NORFOOD_DEMO_TENANT_ID;
}

/** Aplica filtro tenant_id em queries Supabase */
export function withTenantId<T extends { eq: (col: string, val: string) => T }>(query: T): T {
  return query.eq("tenant_id", resolveTenantIdForQuery());
}
