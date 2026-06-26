import { SERVICE_CITY_CONFIG, getNeighborhoodDeliveryFee } from "@/lib/city-config";

const GESTAO_STORAGE_KEY = "abelha-mel-gestao-entregadores-v1";

type GestaoDeliveryConfig = {
  configuracoes?: {
    valorPadraoEntrega?: number;
    taxaPorBairro?: Record<string, number>;
  };
};

export function getDeliveryFeeForNeighborhood(neighborhood: string) {
  if (typeof window === "undefined") {
    return getNeighborhoodDeliveryFee(neighborhood);
  }

  try {
    const raw = window.localStorage.getItem(GESTAO_STORAGE_KEY);
    if (!raw) return getNeighborhoodDeliveryFee(neighborhood);

    const parsed = JSON.parse(raw) as GestaoDeliveryConfig;
    const defaultFee = Number(
      parsed.configuracoes?.valorPadraoEntrega ?? SERVICE_CITY_CONFIG.defaultDeliveryFee,
    );
    const feeMap =
      parsed.configuracoes?.taxaPorBairro ??
      Object.fromEntries(
        SERVICE_CITY_CONFIG.neighborhoods.map((item) => [item.name, item.deliveryFee]),
      );
    const normalizedNeighborhood = neighborhood.trim().toLowerCase();

    const matchedEntry = Object.entries(feeMap).find(
      ([key]) => key.trim().toLowerCase() === normalizedNeighborhood,
    );

    return Number(matchedEntry?.[1] ?? defaultFee);
  } catch {
    return getNeighborhoodDeliveryFee(neighborhood);
  }
}
