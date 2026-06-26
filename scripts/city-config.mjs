export const SERVICE_CITY_CONFIG = {
  cep: "56640-000",
  city: "Custodia",
  cityAscii: "Custodia",
  state: "PE",
  stateName: "Pernambuco",
  supportPhone: "(87) 3848-1473",
  center: {
    latitude: -8.090119,
    longitude: -37.640505,
  },
  defaultDeliveryFee: 5,
  neighborhoods: [
    {
      name: "Centro",
      deliveryFee: 5,
      latitude: -8.0874,
      longitude: -37.6392,
      exampleAddress: "Rua Jose Estrela, 21",
      reference: "Proximo ao cartorio no Centro",
    },
    {
      name: "Redencao",
      deliveryFee: 5,
      latitude: -8.0826,
      longitude: -37.6338,
      exampleAddress: "Rua da Redencao, 45",
      reference: "Praca principal da Redencao",
    },
    {
      name: "Pindoba",
      deliveryFee: 5,
      latitude: -8.0788,
      longitude: -37.6284,
      exampleAddress: "Rua da Pindoba, 63",
      reference: "Mercadinho da Pindoba",
    },
    {
      name: "Rodoviaria",
      deliveryFee: 5,
      latitude: -8.0908,
      longitude: -37.6456,
      exampleAddress: "Avenida da Rodoviaria, 12",
      reference: "Frente da rodoviaria",
    },
    {
      name: "Cohab",
      deliveryFee: 5,
      latitude: -8.0932,
      longitude: -37.6498,
      exampleAddress: "Rua Cohab 2, 88",
      reference: "Quadra central da Cohab",
    },
    {
      name: "Novo Horizonte",
      deliveryFee: 5,
      latitude: -8.0964,
      longitude: -37.6537,
      exampleAddress: "Rua Novo Horizonte, 101",
      reference: "Subida do Novo Horizonte",
    },
    {
      name: "Mandacaru",
      deliveryFee: 5,
      latitude: -8.0836,
      longitude: -37.6507,
      exampleAddress: "Rua do Mandacaru, 54",
      reference: "Perto da capela do Mandacaru",
    },
    {
      name: "Baixa Grande",
      deliveryFee: 5,
      latitude: -8.1012,
      longitude: -37.6591,
      exampleAddress: "Rua Baixa Grande, 32",
      reference: "Entrada da Baixa Grande",
    },
    {
      name: "Sao Jose",
      deliveryFee: 5,
      latitude: -8.0911,
      longitude: -37.6362,
      exampleAddress: "Rua Sao Jose, 19",
      reference: "Igreja de Sao Jose",
    },
    {
      name: "Santa Luzia",
      deliveryFee: 5,
      latitude: -8.0882,
      longitude: -37.6314,
      exampleAddress: "Rua Santa Luzia, 74",
      reference: "Praca de Santa Luzia",
    },
    {
      name: "Perpetuo Socorro",
      deliveryFee: 5,
      latitude: -8.0796,
      longitude: -37.6411,
      exampleAddress: "Rua Perpetuo Socorro, 56",
      reference: "Capela do Perpetuo Socorro",
    },
    {
      name: "Vila Pomar",
      deliveryFee: 5,
      latitude: -8.0738,
      longitude: -37.6485,
      exampleAddress: "Rua Vila Pomar, 40",
      reference: "Entrada da Vila Pomar",
    },
  ],
};

const comparableFormatter = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  usage: "search",
});

function normalizeComparableText(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function isSupportedCityCep(value) {
  return value.replace(/\D/g, "") === SERVICE_CITY_CONFIG.cep.replace(/\D/g, "");
}

export function findSupportedNeighborhood(value) {
  const normalized = normalizeComparableText(value);
  return (
    SERVICE_CITY_CONFIG.neighborhoods.find((item) => {
      const aliases = "aliases" in item ? (item.aliases ?? []) : [];
      const candidates = [item.name, ...aliases].map(normalizeComparableText);
      return candidates.some((candidate) => comparableFormatter.compare(candidate, normalized) === 0);
    }) ?? null
  );
}
