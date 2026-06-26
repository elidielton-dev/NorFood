import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { setActiveTenant } from "@/lib/tenant/active-tenant";
import { applyTenantBranding, clearTenantBranding } from "@/lib/tenant/tenant-branding";
import { fetchTenantBySlugServer, fetchTenantSettingsServer } from "@/lib/api/tenant.functions";
import { resolveTenantBySlug } from "@/lib/platform-admin/demo-tenants-store";
import { FALLBACK_TENANT_SETTINGS } from "@/lib/tenant/tenants-fallback";
import type { Tenant, TenantSettings } from "@/lib/tenant/types";

type TenantContextValue = {
  tenant: Tenant;
  settings: TenantSettings | null;
  isLoading: boolean;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const fallbackTenant = resolveTenantBySlug(slug);
  const fallbackSettings = FALLBACK_TENANT_SETTINGS[slug] ?? null;

  const { data: tenantFromServer, isLoading: loadingTenant, isFetching: fetchingTenant } =
    useQuery({
      queryKey: ["tenant", slug],
      queryFn: () => fetchTenantBySlugServer({ data: slug }),
      staleTime: 5 * 60_000,
      retry: 1,
    });

  const tenant = tenantFromServer ?? fallbackTenant;

  const {
    data: settingsFromServer,
    isLoading: loadingSettings,
    isFetching: fetchingSettings,
  } = useQuery({
    queryKey: ["tenant-settings", slug],
    queryFn: () => fetchTenantSettingsServer({ data: slug }),
    staleTime: 60_000,
    enabled: Boolean(tenant),
    retry: 1,
  });

  const settings = settingsFromServer ?? fallbackSettings;

  const value = useMemo(() => {
    if (!tenant) return null;
    return {
      tenant,
      settings,
      isLoading:
        (loadingTenant || fetchingTenant || loadingSettings || fetchingSettings) &&
        !fallbackTenant,
    };
  }, [
    tenant,
    settings,
    loadingTenant,
    fetchingTenant,
    loadingSettings,
    fetchingSettings,
    fallbackTenant,
  ]);

  useEffect(() => {
    if (!tenant) return;
    setActiveTenant(tenant);
    applyTenantBranding(tenant);
    return () => {
      setActiveTenant(null);
      clearTenantBranding();
    };
  }, [tenant]);

  if (!value) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant deve ser usado dentro de TenantProvider");
  return ctx;
}

export function useTenantOptional() {
  return useContext(TenantContext);
}

export function useTenantId() {
  return useTenant().tenant.id;
}

export function useTenantSlug() {
  return useTenant().tenant.slug;
}
