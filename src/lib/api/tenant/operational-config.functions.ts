import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth/auth-helpers.server";
import { resolveTenantIdBySlug } from "@/lib/api/financeiro/platform-billing.functions";

export type OperationalConfig = {
  pedido_minimo: number;
  loja_aberta: boolean;
  valor_padrao_entrega: number;
  pontos_por_real: number;
};

export type BairroEntrega = {
  id: string;
  nome: string;
  taxa: number;
  latitude: number | null;
  longitude: number | null;
  ativo: boolean;
};

export const fetchOperationalStatusServer = createServerFn({ method: "GET" })
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ data: tenantSlug }): Promise<OperationalConfig> => {
    const { getOperationalConfig } = await import("@/lib/api/pedidos/order-validation.server");
    const tenantId = await resolveTenantIdBySlug(tenantSlug);
    return getOperationalConfig(tenantId ?? undefined);
  });

export const fetchOperationalAdminServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [configResult, bairrosResult] = await Promise.all([
      supabaseAdmin
        .from("config_operacional")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from("bairros_entrega")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("nome"),
    ]);

    if (configResult.error) throw configResult.error;
    if (bairrosResult.error) throw bairrosResult.error;

    const configRow = configResult.data;
    return {
      config: {
        pedido_minimo: Number(configRow?.pedido_minimo ?? 0),
        loja_aberta: configRow?.loja_aberta ?? true,
        valor_padrao_entrega: Number(configRow?.valor_padrao_entrega ?? 0),
        pontos_por_real: Number(configRow?.pontos_por_real ?? 1),
      },
      bairros: (bairrosResult.data ?? []).map((row) => ({
        id: row.id,
        nome: row.nome,
        taxa: Number(row.taxa),
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        ativo: row.ativo,
      })),
    };
  });

export const saveOperationalConfigServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: OperationalConfig & { tenantSlug: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tenantSlug, ...config } = data;
    const { error } = await supabaseAdmin.from("config_operacional").upsert({
      id: tenantId,
      tenant_id: tenantId,
      pedido_minimo: config.pedido_minimo,
      loja_aberta: config.loja_aberta,
      valor_padrao_entrega: config.valor_padrao_entrega,
      pontos_por_real: config.pontos_por_real,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true as const };
  });

export const saveBairroEntregaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      tenantSlug: string;
      id?: string;
      nome: string;
      taxa: number;
      latitude?: number | null;
      longitude?: number | null;
      ativo: boolean;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      tenant_id: tenantId,
      nome: data.nome.trim(),
      taxa: data.taxa,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      ativo: data.ativo,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("bairros_entrega")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return { ok: true as const };
    }

    const { error } = await supabaseAdmin.from("bairros_entrega").insert(payload);
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteBairroEntregaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; id: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bairros_entrega")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return { ok: true as const };
  });

export const fetchBairrosPublicServer = createServerFn({ method: "GET" })
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ data: tenantSlug }) => {
    const tenantId = await resolveTenantIdBySlug(tenantSlug);
    if (!tenantId) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("bairros_entrega")
      .select("nome, taxa")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("nome");
    if (error) throw error;
    return (data ?? []).map((row) => ({ nome: row.nome, taxa: Number(row.taxa) }));
  });
