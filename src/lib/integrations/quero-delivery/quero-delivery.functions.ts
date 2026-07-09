import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth/auth-helpers.server";

export const fetchQueroDeliveryIntegrationServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { getTenantQueroIntegration } = await import(
      "@/lib/integrations/quero-delivery/quero-delivery.sync.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const integration = await getTenantQueroIntegration(tenantId);
    const { data: logs } = await supabaseAdmin
      .from("quero_delivery_sync_logs")
      .select("level, message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { count } = await supabaseAdmin
      .from("quero_delivery_order_map")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    return {
      enabled: integration?.quero_delivery_enabled ?? false,
      placeId: integration?.quero_delivery_place_id ?? "",
      hasToken: Boolean(integration?.quero_delivery_api_token),
      lastPollAt: integration?.quero_delivery_last_poll_at ?? null,
      lastError: integration?.quero_delivery_last_error ?? null,
      importedOrders: count ?? 0,
      logs: logs ?? [],
    };
  });

export const saveQueroDeliveryIntegrationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      tenantSlug: string;
      enabled: boolean;
      placeId: string;
      apiToken?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      quero_delivery_enabled: data.enabled,
      quero_delivery_place_id: data.placeId.trim(),
      updated_at: new Date().toISOString(),
    };
    if (data.apiToken?.trim()) {
      payload.quero_delivery_api_token = data.apiToken.trim();
    }

    const { error } = await supabaseAdmin.from("tenant_integrations").upsert(payload);
    if (error) throw error;
    return { ok: true as const };
  });

export const runQueroDeliveryPollServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { pollQueroDeliveryForTenant } = await import(
      "@/lib/integrations/quero-delivery/quero-delivery.sync.server"
    );
    return pollQueroDeliveryForTenant(tenantId);
  });

export const runQueroCatalogSyncServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { syncQueroCatalogForTenant } = await import(
      "@/lib/integrations/quero-delivery/quero-delivery.catalog.server"
    );
    return syncQueroCatalogForTenant(tenantId);
  });
