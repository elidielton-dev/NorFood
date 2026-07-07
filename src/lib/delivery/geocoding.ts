import { SERVICE_CITY_CONFIG, getNeighborhoodCoordinates } from "@/lib/shared/city-config";

export type GeocodedPoint = {
  latitude: number;
  longitude: number;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildAddressQuery(parts: Array<string | null | undefined>) {
  return normalizeWhitespace(parts.filter(Boolean).join(", "));
}

function normalizeComparableText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function resolveLocalNeighborhoodFallback(input: {
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}) {
  const cepMatches = input.cep?.replace(/\D/g, "") === SERVICE_CITY_CONFIG.cep.replace(/\D/g, "");
  const cityMatches =
    normalizeComparableText(input.cidade) === normalizeComparableText(SERVICE_CITY_CONFIG.city) ||
    normalizeComparableText(input.cidade) ===
      normalizeComparableText(SERVICE_CITY_CONFIG.cityAscii);
  const stateMatches =
    !input.estado ||
    normalizeComparableText(input.estado) === normalizeComparableText(SERVICE_CITY_CONFIG.state);

  if (!cepMatches && !(cityMatches && stateMatches)) {
    return null;
  }

  return getNeighborhoodCoordinates(input.bairro ?? "");
}

/**
 * Resolve coordenadas reais do cliente a partir do endereco informado no checkout.
 * Usa Nominatim (OpenStreetMap) para manter o stack sem dependencias proprietarias.
 */
export async function geocodeAddress(input: {
  endereco: string;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}) {
  const query = buildAddressQuery([
    input.endereco,
    input.bairro,
    input.cidade,
    input.estado,
    input.cep,
    "Brasil",
  ]);
  const localFallback = resolveLocalNeighborhoodFallback(input);

  if (!query) return localFallback;

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "AbelhaMelCheckout/1.0",
        },
      },
    );

    if (!response.ok) {
      return localFallback;
    }

    const payload = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
    }>;

    const first = payload[0];
    if (!first?.lat || !first?.lon) {
      return localFallback;
    }

    return {
      latitude: Number(first.lat),
      longitude: Number(first.lon),
    } satisfies GeocodedPoint;
  } catch {
    return localFallback;
  }
}
