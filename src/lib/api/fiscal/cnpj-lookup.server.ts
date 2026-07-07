import type { EmpresaFiscal, FiscalCrt } from "@/lib/fiscal/fiscal-types";
import { isValidCnpj, onlyDigits } from "@/lib/fiscal/fiscal-validation";

export type CnpjLookupResult = {
  empresa: EmpresaFiscal;
  situacaoCadastral: string;
  fonte: "publica_cnpj_ws" | "minhareceita" | "brasilapi";
};

type PublicaCnpjWs = {
  razao_social?: string;
  estabelecimento?: {
    nome_fantasia?: string | null;
    cep?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    email?: string | null;
    ddd1?: string;
    telefone1?: string;
    situacao_cadastral?: string;
    cidade?: { nome?: string; ibge_id?: number };
    estado?: { sigla?: string };
    atividade_principal?: { id?: string };
  };
  simples?: { simples?: string } | null;
};

type MinhaReceitaCnpj = {
  razao_social?: string;
  nome_fantasia?: string | null;
  cnae_fiscal?: number;
  opcao_pelo_simples?: boolean | null;
  codigo_municipio_ibge?: number;
  municipio?: string;
  uf?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  ddd_telefone_1?: string | null;
  email?: string | null;
  descricao_situacao_cadastral?: string;
};

type BrasilApiCnpj = {
  razao_social?: string;
  nome_fantasia?: string | null;
  cnae_fiscal?: number;
  opcao_pelo_simples?: boolean;
  codigo_municipio_ibge?: number;
  municipio?: string;
  uf?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  ddd_telefone_1?: string | null;
  email?: string | null;
  descricao_situacao_cadastral?: string;
};

function mapCrtFromSimples(opcaoSimples: boolean | null | undefined, simplesText?: string) {
  if (opcaoSimples === true || simplesText?.toLowerCase() === "sim") return 1 as FiscalCrt;
  return 3 as FiscalCrt;
}

function buildEmpresaFromParts(input: {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnae: string;
  crt: FiscalCrt;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  codigoMunicipioIbge: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
}): EmpresaFiscal {
  const ibge = onlyDigits(input.codigoMunicipioIbge).slice(0, 7);
  return {
    cnpj: input.cnpj,
    razaoSocial: input.razaoSocial.trim(),
    nomeFantasia: input.nomeFantasia.trim(),
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    crt: input.crt,
    cnae: onlyDigits(input.cnae).slice(0, 7),
    logradouro: input.logradouro.trim(),
    numero: input.numero.trim() || "S/N",
    complemento: input.complemento.trim(),
    bairro: input.bairro.trim(),
    codigoMunicipioIbge: ibge,
    municipio: input.municipio.trim(),
    uf: input.uf.trim().toUpperCase().slice(0, 2),
    cep: onlyDigits(input.cep).slice(0, 8),
    telefone: onlyDigits(input.telefone),
    email: input.email.trim(),
  };
}

function assertEmpresaMinima(empresa: EmpresaFiscal) {
  if (!empresa.razaoSocial.trim()) {
    throw new Error("Consulta retornou CNPJ sem razao social.");
  }
  if (!empresa.municipio.trim() || !empresa.uf.trim()) {
    throw new Error("Consulta retornou endereco incompleto (municipio/UF).");
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: T }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "AbelhaMel-ERP/1.0 (+https://abelhaemel.vercel.app)",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(25_000),
  });

  if (response.status === 404) return { ok: false, status: 404 };
  if (!response.ok) return { ok: false, status: response.status };

  const data = (await response.json()) as T;
  return { ok: true, status: response.status, data };
}

async function fetchPublicaCnpjWs(cnpj: string): Promise<CnpjLookupResult | null> {
  const result = await fetchJson<PublicaCnpjWs>(`https://publica.cnpj.ws/cnpj/${cnpj}`);
  if (!result.ok || !result.data) return null;

  const data = result.data;
  const est = data.estabelecimento;
  if (!est) return null;

  const empresa = buildEmpresaFromParts({
    cnpj,
    razaoSocial: data.razao_social ?? "",
    nomeFantasia: est.nome_fantasia?.trim() || data.razao_social || "",
    cnae: est.atividade_principal?.id ?? "",
    crt: mapCrtFromSimples(undefined, data.simples?.simples ?? undefined),
    logradouro: est.logradouro ?? "",
    numero: est.numero ?? "",
    complemento: est.complemento ?? "",
    bairro: est.bairro ?? "",
    codigoMunicipioIbge: String(est.cidade?.ibge_id ?? ""),
    municipio: est.cidade?.nome ?? "",
    uf: est.estado?.sigla ?? "PE",
    cep: est.cep ?? "",
    telefone: `${est.ddd1 ?? ""}${est.telefone1 ?? ""}`,
    email: est.email ?? "",
  });

  assertEmpresaMinima(empresa);

  return {
    fonte: "publica_cnpj_ws",
    situacaoCadastral: est.situacao_cadastral?.trim() || "Desconhecida",
    empresa,
  };
}

async function fetchMinhaReceita(cnpj: string): Promise<CnpjLookupResult | null> {
  const result = await fetchJson<MinhaReceitaCnpj>(`https://minhareceita.org/${cnpj}`);
  if (!result.ok || !result.data) return null;

  const data = result.data;
  const empresa = buildEmpresaFromParts({
    cnpj,
    razaoSocial: data.razao_social ?? "",
    nomeFantasia: data.nome_fantasia?.trim() || data.razao_social || "",
    cnae: String(data.cnae_fiscal ?? ""),
    crt: mapCrtFromSimples(data.opcao_pelo_simples),
    logradouro: data.logradouro ?? "",
    numero: data.numero ?? "",
    complemento: data.complemento ?? "",
    bairro: data.bairro ?? "",
    codigoMunicipioIbge: String(data.codigo_municipio_ibge ?? ""),
    municipio: data.municipio ?? "",
    uf: data.uf ?? "PE",
    cep: data.cep ?? "",
    telefone: data.ddd_telefone_1 ?? "",
    email: data.email ?? "",
  });

  assertEmpresaMinima(empresa);

  return {
    fonte: "minhareceita",
    situacaoCadastral: data.descricao_situacao_cadastral?.trim() || "Desconhecida",
    empresa,
  };
}

async function fetchBrasilApi(cnpj: string): Promise<CnpjLookupResult | null> {
  const result = await fetchJson<BrasilApiCnpj>(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (!result.ok || !result.data) return null;

  const data = result.data;
  const empresa = buildEmpresaFromParts({
    cnpj,
    razaoSocial: data.razao_social ?? "",
    nomeFantasia: data.nome_fantasia?.trim() || data.razao_social || "",
    cnae: String(data.cnae_fiscal ?? ""),
    crt: mapCrtFromSimples(data.opcao_pelo_simples),
    logradouro: data.logradouro ?? "",
    numero: data.numero ?? "",
    complemento: data.complemento ?? "",
    bairro: data.bairro ?? "",
    codigoMunicipioIbge: String(data.codigo_municipio_ibge ?? ""),
    municipio: data.municipio ?? "",
    uf: data.uf ?? "PE",
    cep: data.cep ?? "",
    telefone: data.ddd_telefone_1 ?? "",
    email: data.email ?? "",
  });

  assertEmpresaMinima(empresa);

  return {
    fonte: "brasilapi",
    situacaoCadastral: data.descricao_situacao_cadastral?.trim() || "Desconhecida",
    empresa,
  };
}

export async function lookupCnpjPublic(cnpjInput: string): Promise<CnpjLookupResult> {
  const cnpj = onlyDigits(cnpjInput);
  if (!isValidCnpj(cnpj)) {
    throw new Error("CNPJ invalido. Verifique os 14 digitos.");
  }

  const errors: string[] = [];

  for (const provider of [
    { name: "publica.cnpj.ws", run: () => fetchPublicaCnpjWs(cnpj) },
    { name: "minhareceita.org", run: () => fetchMinhaReceita(cnpj) },
    { name: "brasilapi.com.br", run: () => fetchBrasilApi(cnpj) },
  ]) {
    try {
      const result = await provider.run();
      if (result) return result;
      errors.push(`${provider.name}: CNPJ nao encontrado`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider.name}: ${message}`);
      console.warn(`[cnpj] ${provider.name} falhou:`, error);
    }
  }

  throw new Error(
    `Nao foi possivel consultar o CNPJ. ${errors.join(" | ")}`,
  );
}
