import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TENANT_ID_BY_SLUG } from "@/lib/tenant/constants";
import { getFallbackTenant, FALLBACK_TENANT_SETTINGS } from "@/lib/tenant/tenants-fallback";
import type { Tenant, TenantMembership, TenantSettings } from "@/lib/tenant/types";

export const fetchTenantBySlugServer = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<Tenant | null> => {
    const fallback = getFallbackTenant(slug);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("tenants")
        .select("*")
        .eq("slug", slug)
        .in("status", ["active", "trial"])
        .maybeSingle();
      if (error) {
        console.warn("[fetchTenantBySlugServer]", error.message);
        return fallback;
      }
      if (!data) return fallback;
      return data as Tenant;
    } catch {
      return fallback;
    }
  });

export const fetchTenantSettingsServer = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<TenantSettings | null> => {
    const fallback = FALLBACK_TENANT_SETTINGS[slug] ?? null;
    const tenantId = TENANT_ID_BY_SLUG[slug];
    if (!tenantId) return fallback;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error || !data) return fallback;
      return {
        phone: data.phone,
        address: data.address,
        description: data.description,
        cep: data.cep ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        neighborhood: data.neighborhood ?? null,
        address_number: data.address_number ?? null,
        delivery_fee_default: Number(data.delivery_fee_default),
        delivery_time_minutes: Number(data.delivery_time_minutes),
        pedido_minimo: Number(data.pedido_minimo),
        loja_aberta: data.loja_aberta,
        pontos_por_real: Number(data.pontos_por_real),
      };
    } catch {
      return fallback;
    }
  });

export const fetchUserTenantsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TenantMembership[]> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("tenant_users")
        .select("tenant_id, role, tenants(*)")
        .eq("user_id", context.userId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        tenant_id: row.tenant_id,
        role: row.role,
        tenant: row.tenants as unknown as Tenant,
      }));
    } catch {
      return [];
    }
  });
