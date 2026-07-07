import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { setActiveTenant } from "@/lib/tenant/active-tenant";
import { applyTenantBranding, clearTenantBranding } from "@/lib/tenant/tenant-branding";
import { fetchTenantBySlugServer, fetchTenantSettingsServer } from "@/lib/api/tenant/tenant.functions";
import { resolveTenantBySlug } from "@/lib/platform-admin/demo-tenants-store";
import { FALLBACK_TENANT_SETTINGS } from "@/lib/tenant/tenants-fallback";
import type { Tenant, TenantSettings } from "@/lib/tenant/types";

type TenantContextValue = {
  tenant: Tenant;
  settings: TenantSettings | null;
  isLoading: boolean;
};

const TenantContext = createContext<TenantContextValue | null>(null);

type TenantProviderProps = {
  slug: string;
  /** Tenant já resolvido no beforeLoad — evita spinner e segunda requisição. */
  initialTenant?: Tenant | null;
  children: ReactNode;
};

export function TenantProvider({ slug, initialTenant, children }: TenantProviderProps) {
  const fallbackTenant = resolveTenantBySlug(slug);
  const fallbackSettings = FALLBACK_TENANT_SETTINGS[slug] ?? null;
  const seedTenant = initialTenant ?? fallbackTenant;

  const {
    data: tenantFromServer,
    isLoading: loadingTenant,
    isFetching: fetchingTenant,
    isError: tenantError,
  } = useQuery({
    queryKey: ["tenant", slug],
    queryFn: () => fetchTenantBySlugServer({ data: slug }),
    initialData: initialTenant ?? undefined,
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const tenant = tenantFromServer ?? seedTenant;

  if (tenant) {
    setActiveTenant(tenant);
  }

  const {
    data: settingsFromServer,
    isLoading: loadingSettings,
    isFetching: fetchingSettings,
  } = useQuery({
    queryKey: ["tenant-settings", slug],
    queryFn: () => fetchTenantSettingsServer({ data: slug }),
    staleTime: 60_000,
    enabled: Boolean(tenant?.id),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const settings = settingsFromServer ?? fallbackSettings;

  const value = useMemo(() => {
    if (!tenant) return null;
    return {
      tenant,
      settings,
      isLoading:
        !seedTenant &&
        (loadingTenant || fetchingTenant || loadingSettings || fetchingSettings),
    };
  }, [
    tenant,
    settings,
    seedTenant,
    loadingTenant,
    fetchingTenant,
    loadingSettings,
    fetchingSettings,
  ]);

  useEffect(() => {
    if (!tenant) return;
    applyTenantBranding(tenant);
    return () => {
      setActiveTenant(null);
      clearTenantBranding();
    };
  }, [tenant]);

  if (!value) {
    if (loadingTenant && !seedTenant) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      );
    }

    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm font-medium text-foreground">Restaurante não encontrado</p>
        <p className="text-xs text-muted-foreground">
          {tenantError ? "Não foi possível carregar os dados da loja." : "Verifique o endereço da loja."}
        </p>
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
