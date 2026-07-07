import { SERVICE_CITY_CONFIG, isSupportedCityCep } from "@/lib/shared/city-config";

export type ViaCepAddress = {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
};

export function normalizeCep(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function formatCep(value: string) {
  const digits = normalizeCep(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export async function fetchAddressByCep(cep: string): Promise<ViaCepAddress> {
  const normalized = normalizeCep(cep);

  if (normalized.length !== 8) {
    throw new Error("CEP invalido");
  }

  const response = await fetch(`https://viacep.com.br/ws/${normalized}/json/`);
  if (!response.ok) {
    throw new Error("Falha ao consultar o CEP");
  }

  const data = (await response.json()) as {
    cep?: string;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
    complemento?: string;
    erro?: boolean;
  };

  if (data.erro) {
    throw new Error("CEP nao encontrado");
  }

  const isKnownUniversalCep = isSupportedCityCep(normalized);

  return {
    cep: data.cep ?? formatCep(normalized),
    street: data.logradouro ?? "",
    neighborhood: data.bairro ?? "",
    city: data.localidade ?? (isKnownUniversalCep ? SERVICE_CITY_CONFIG.city : ""),
    state: data.uf ?? (isKnownUniversalCep ? SERVICE_CITY_CONFIG.state : ""),
    complement: data.complemento ?? "",
  };
}
