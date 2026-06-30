import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";

export const fetchVendaDetalheServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pedidoId: string; tenantSlug: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { resolveStaffTenantId } = await import("@/lib/api/auth-helpers.server");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { fetchVendaDetalhe } = await import("@/lib/api/pedido-detalhe.server");
    return fetchVendaDetalhe(data.pedidoId, tenantId);
  });
