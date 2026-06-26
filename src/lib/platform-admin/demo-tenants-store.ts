import { NORFOOD_LOGO_URL } from "@/lib/brand/norfood";
import { getFallbackTenant, listFallbackTenants } from "@/lib/tenant/tenants-fallback";
import type { Tenant, TenantStatus } from "@/lib/tenant/types";

const STORAGE_KEY = "norfood-platform-admin-tenants";

export type AdminTenantRow = Tenant & {
  owner_email?: string | null;
  owner_name?: string | null;
  created_at?: string;
};

type DemoStore = {
  tenants: AdminTenantRow[];
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStore(): DemoStore {
  if (!canUseStorage()) return { tenants: listFallbackTenants() };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = { tenants: listFallbackTenants() as AdminTenantRow[] };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as DemoStore;
  } catch {
    return { tenants: listFallbackTenants() };
  }
}

function writeStore(store: DemoStore) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listDemoAdminTenants(): AdminTenantRow[] {
  return readStore().tenants;
}

export function getDemoAdminTenant(id: string): AdminTenantRow | null {
  return readStore().tenants.find((t) => t.id === id) ?? null;
}

export function getDemoAdminTenantBySlug(slug: string): AdminTenantRow | null {
  return readStore().tenants.find((t) => t.slug === slug) ?? null;
}

/** Fallback + empresas criadas no admin demo (localStorage). */
export function resolveTenantBySlug(slug: string): AdminTenantRow | null {
  const fromStore = getDemoAdminTenantBySlug(slug);
  const fallback = getFallbackTenant(slug) as AdminTenantRow | null;
  if (!fromStore) return fallback;
  return {
    ...fallback,
    ...fromStore,
    logo_url: fromStore.logo_url ?? fallback?.logo_url ?? NORFOOD_LOGO_URL,
    primary_color: fromStore.primary_color || fallback?.primary_color || "#FF9100",
  };
}

export function listAllDemoTenants(): AdminTenantRow[] {
  return readStore().tenants;
}

export function saveDemoAdminTenant(tenant: AdminTenantRow) {
  const store = readStore();
  const idx = store.tenants.findIndex((t) => t.id === tenant.id);
  if (idx >= 0) store.tenants[idx] = tenant;
  else store.tenants.push(tenant);
  writeStore(store);
}

export function createDemoAdminTenant(input: {
  name: string;
  slug: string;
  subtitle?: string;
  primary_color?: string;
  status?: TenantStatus;
  owner_email?: string;
  owner_name?: string;
}): AdminTenantRow {
  const tenant: AdminTenantRow = {
    id: crypto.randomUUID(),
    name: input.name,
    slug: input.slug,
    subtitle: input.subtitle ?? null,
    logo_url: NORFOOD_LOGO_URL,
    primary_color: input.primary_color ?? "#FF9100",
    secondary_color: "#1A1A1A",
    accent_color: "#FF5C00",
    custom_domain: null,
    status: input.status ?? "trial",
    timezone: "America/Sao_Paulo",
    currency: "BRL",
    owner_email: input.owner_email ?? null,
    owner_name: input.owner_name ?? null,
    created_at: new Date().toISOString(),
  };
  saveDemoAdminTenant(tenant);
  return tenant;
}

export function updateDemoAdminTenantStatus(id: string, status: TenantStatus) {
  const tenant = getDemoAdminTenant(id);
  if (!tenant) return null;
  const updated = { ...tenant, status };
  saveDemoAdminTenant(updated);
  return updated;
}

export function updateDemoAdminTenant(
  id: string,
  patch: Partial<
    Pick<
      AdminTenantRow,
      "name" | "slug" | "subtitle" | "primary_color" | "status" | "custom_domain" | "owner_email"
    >
  >,
) {
  const tenant = getDemoAdminTenant(id);
  if (!tenant) return null;
  const updated = { ...tenant, ...patch };
  saveDemoAdminTenant(updated);
  return updated;
}
