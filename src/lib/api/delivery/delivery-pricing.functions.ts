import { createServerFn } from "@tanstack/react-start";
import { resolveDeliveryFeeFromDb } from "@/lib/api/pedidos/order-validation.server";
import { resolveTenantIdBySlug } from "@/lib/api/financeiro/platform-billing.functions";

export const getDeliveryFeeServer = createServerFn({ method: "POST" })
  .validator((input: { tenantSlug: string; bairro: string }) => input)
  .handler(async ({ data }) => {
    const tenantSlug = data.tenantSlug?.trim();
    if (!tenantSlug) {
      throw new Error("Restaurante nao informado para calcular a entrega.");
    }

    const tenantId = await resolveTenantIdBySlug(tenantSlug);
    if (!tenantId) {
      throw new Error("Restaurante nao encontrado.");
    }

    try {
      const taxa = await resolveDeliveryFeeFromDb(data.bairro, tenantId);
      return { taxa, source: "database" as const };
    } catch {
      const { getNeighborhoodDeliveryFee } = await import("@/lib/shared/city-config");
      return {
        taxa: getNeighborhoodDeliveryFee(data.bairro),
        source: "fallback" as const,
      };
    }
  });
