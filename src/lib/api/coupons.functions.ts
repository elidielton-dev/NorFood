import { createServerFn } from "@tanstack/react-start";
import { validateCoupon } from "@/lib/api/order-validation.server";
import { resolveTenantIdBySlug } from "@/lib/api/platform-billing.functions";

export const validateCouponServer = createServerFn({ method: "POST" })
  .validator((input: { codigo: string; subtotal: number; tenantSlug: string }) => input)
  .handler(async ({ data }) => {
    const tenantId = await resolveTenantIdBySlug(data.tenantSlug);
    if (!tenantId) throw new Error("Restaurante nao encontrado.");

    const result = await validateCoupon(data.codigo, data.subtotal, tenantId);
    if (!result) {
      throw new Error("Informe um codigo de cupom valido.");
    }
    return result;
  });
