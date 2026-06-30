import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth-helpers.server";
import type { Tables } from "@/integrations/supabase/types";

type PedidoRow = Tables<"pedidos">;
type LancamentoRow = Tables<"lancamentos_financeiros">;

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
