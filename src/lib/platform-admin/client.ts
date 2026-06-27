import type { AdminTenantRow } from "@/lib/api/platform-admin.functions";
import {
  createDemoAdminTenant,
  getDemoAdminTenant,
  listDemoAdminTenants,
  updateDemoAdminTenant,
} from "@/lib/platform-admin/demo-tenants-store";
import { isBrowserDemoEnabled, isProductionMode } from "@/lib/runtime";
import { supabase } from "@/integrations/supabase/client";
import { isPlatformAdminEmail } from "@/lib/platform-admin/emails";
import {
  createTenantAdminServer,
  getTenantAdminServer,
  listTenantsAdminServer,
  updateTenantAdminServer,
} from "@/lib/api/platform-admin.functions";
import { fetchPlatformCapacityServer } from "@/lib/api/platform-capacity.functions";
import type { TenantStatus } from "@/lib/tenant/types";
import type { BillingModel, BillingPlanId } from "@/lib/platform/billing-plans";

export function useAdminTenantsSource() {
  if (isProductionMode()) return false;
  return isBrowserDemoEnabled();
}

/** Valida admin da plataforma (cliente + API runtime com PLATFORM_ADMIN_EMAILS). */
export async function checkCurrentUserPlatformAdmin(): Promise<boolean> {
  if (isBrowserDemoEnabled()) return true;

  const { data: userData } = await supabase.auth.getUser();
  if (isPlatformAdminEmail(userData.user?.email)) return true;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return false;

  try {
    const res = await fetch("/api/platform-admin/session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { allowed?: boolean };
    return Boolean(body.allowed);
  } catch {
    return false;
  }
}

export async function fetchAdminTenants(): Promise<AdminTenantRow[]> {
  if (isBrowserDemoEnabled()) {
    return listDemoAdminTenants();
  }
  return listTenantsAdminServer();
}

export async function fetchAdminTenant(id: string): Promise<AdminTenantRow | null> {
  if (isBrowserDemoEnabled()) {
    return getDemoAdminTenant(id);
  }
  return getTenantAdminServer({ data: id });
}

export async function createAdminTenant(input: {
  name: string;
  slug: string;
  subtitle?: string;
  primary_color?: string;
  status?: TenantStatus;
  owner_email?: string;
  owner_name?: string;
  owner_password?: string;
  billing_model?: BillingModel;
  billing_plan?: BillingPlanId;
}): Promise<AdminTenantRow> {
  if (isBrowserDemoEnabled()) {
    return createDemoAdminTenant(input);
  }
  return createTenantAdminServer({ data: input });
}

export async function saveAdminTenant(
  id: string,
  patch: {
    name?: string;
    slug?: string;
    subtitle?: string;
    primary_color?: string;
    status?: TenantStatus;
    custom_domain?: string | null;
  },
): Promise<AdminTenantRow> {
  if (isBrowserDemoEnabled()) {
    const updated = updateDemoAdminTenant(id, patch);
    if (!updated) throw new Error("Empresa não encontrada.");
    return updated;
  }
  return updateTenantAdminServer({ data: { id, ...patch } });
}

export async function fetchPlatformCapacity() {
  if (isBrowserDemoEnabled()) {
    const tenants = listDemoAdminTenants();
    return {
      profile: "demo",
      label: "Modo demonstração local",
      maxTenants: 999,
      currentTenants: tenants.length,
      remaining: 999,
      atLimit: false,
      pm2Instances: 1,
      evolutionOnSameHost: false,
    };
  }
  return fetchPlatformCapacityServer();
}
