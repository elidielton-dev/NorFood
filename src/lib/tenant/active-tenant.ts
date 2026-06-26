import type { Tenant } from "@/lib/tenant/types";

let activeTenant: Tenant | null = null;

export function setActiveTenant(tenant: Tenant | null) {
  activeTenant = tenant;
}

export function getActiveTenant(): Tenant | null {
  return activeTenant;
}

export function getActiveTenantId(): string | null {
  return activeTenant?.id ?? null;
}

export function getActiveTenantSlug(): string | null {
  return activeTenant?.slug ?? null;
}

export function requireActiveTenantId(): string {
  const id = getActiveTenantId();
  if (!id) {
    throw new Error("Tenant não definido no contexto atual.");
  }
  return id;
}
