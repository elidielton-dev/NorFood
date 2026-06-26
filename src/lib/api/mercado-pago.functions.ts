import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, fetchUserRoles, isStaffRole } from "@/lib/api/auth-helpers.server";

export const expirePendingMercadoPagoOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { expireStalePendingMercadoPagoOrders } = await import("@/lib/api/mercado-pago.server");
    const roles = await fetchUserRoles(context.userId);

    return await expireStalePendingMercadoPagoOrders({
      customerId: isStaffRole(roles) ? undefined : context.userId,
    });
  });

export const expirePendingMercadoPagoOrdersStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    const { expireStalePendingMercadoPagoOrders } = await import("@/lib/api/mercado-pago.server");
    return await expireStalePendingMercadoPagoOrders();
  });
