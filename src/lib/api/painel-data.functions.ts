import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth-helpers.server";
import type { Tables } from "@/integrations/supabase/types";
import { isTodayInTimezone } from "@/lib/tenant/tenant-day";

type PedidoRow = Tables<"pedidos">;
type LancamentoRow = Tables<"lancamentos_financeiros">;

function getMpStatus(observacoes: string | null): string | null {
  if (!observacoes) return null;
  return observacoes.match(/mp_status=([^;]+)/i)?.[1]?.trim() ?? null;
}

function isPedidoContabilizavel(pedido: Pick<PedidoRow, "status" | "observacoes">) {
  return pedido.status !== "cancelado" && getMpStatus(pedido.observacoes) !== "pending";
}

export type PainelDashboardResumo = {
  pedidos: PedidoRow[];
  faturamentoHoje: number;
  pedidosHoje: number;
  ticketMedio: number;
  emAndamento: number;
};

export const fetchPainelDashboardServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<PainelDashboardResumo> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel.");
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: pedidos, error: pedidosError }, { data: tenant, error: tenantError }] =
      await Promise.all([
        supabaseAdmin
          .from("pedidos")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabaseAdmin.from("tenants").select("timezone").eq("id", tenantId).maybeSingle(),
      ]);

    if (pedidosError) throw pedidosError;
    if (tenantError) throw tenantError;

    const timeZone = tenant?.timezone ?? "America/Sao_Paulo";
    const rows = pedidos ?? [];
    const contabilizaveis = rows.filter(isPedidoContabilizavel);
    const deHoje = contabilizaveis.filter((pedido) =>
      isTodayInTimezone(pedido.created_at, timeZone),
    );
    const faturamentoHoje = deHoje.reduce((sum, pedido) => sum + Number(pedido.total), 0);

    return {
      pedidos: rows,
      faturamentoHoje,
      pedidosHoje: deHoje.length,
      ticketMedio: deHoje.length ? faturamentoHoje / deHoje.length : 0,
      emAndamento: rows.filter((pedido) =>
        ["aberto", "em_preparo", "pronto", "em_entrega"].includes(pedido.status),
      ).length,
    };
  });

export const listPedidosPainelServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<PedidoRow[]> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel.");
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("pedidos")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    return data ?? [];
  });

export const listLancamentosPainelServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<LancamentoRow[]> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao financeiro.");
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("lancamentos_financeiros")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("data", { ascending: false })
      .limit(100);

    if (error) throw error;
    return data ?? [];
  });
