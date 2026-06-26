import { createServerFn } from "@tanstack/react-start";
import { validateCoupon } from "@/lib/api/order-validation.server";

export const validateCouponServer = createServerFn({ method: "POST" })
  .validator((input: { codigo: string; subtotal: number }) => input)
  .handler(async ({ data }) => {
    const result = await validateCoupon(data.codigo, data.subtotal);
    if (!result) {
      throw new Error("Informe um codigo de cupom valido.");
    }
    return result;
  });
