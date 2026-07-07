import { createServerFn } from "@tanstack/react-start";
import { resolveDeliveryFeeFromDb } from "@/lib/api/pedidos/order-validation.server";

export const getDeliveryFeeServer = createServerFn({ method: "POST" })
  .validator((input: { bairro: string }) => input)
  .handler(async ({ data }) => {
    try {
      const taxa = await resolveDeliveryFeeFromDb(data.bairro);
      return { taxa, source: "database" as const };
    } catch {
      const { getNeighborhoodDeliveryFee } = await import("@/lib/shared/city-config");
      return {
        taxa: getNeighborhoodDeliveryFee(data.bairro),
        source: "fallback" as const,
      };
    }
  });
