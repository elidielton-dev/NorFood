import type {
  EmpresaFiscal,
  FiscalAmbiente,
  FiscalConfigPublic,
  FiscalSettings,
} from "@/lib/fiscal/fiscal-types";
import { assessFiscalReadiness } from "@/lib/fiscal/fiscal-validation";
import { onlyDigits } from "@/lib/fiscal/fiscal-validation";

type DbEmpresa = {
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  crt: number | null;
  cnae: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  codigo_municipio_ibge: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
};

type DbFiscalConfig = {
  nfce_habilitada: boolean;
  nfe_habilitada: boolean;
  ambiente: string;
  serie_nfce: number;
  proximo_numero_nfce: number;
  csc_id: string | null;
  csc_token_encrypted: string | null;
  certificado_pfx_encrypted: string | null;
  certificado_senha_encrypted: string | null;
  certificado_valido_ate: string | null;
  certificado_titular: string | null;
  certificado_cnpj: string | null;
  certificado_instalado_em: string | null;
  emitir_automatico_pdv: boolean;
  emitir_automatico_delivery: boolean;
  emitir_automatico_mesas: boolean;
  provider: string;
};

const EMPTY_EMPRESA: EmpresaFiscal = {
  cnpj: "",
  razaoSocial: "",
  nomeFantasia: "",
  inscricaoEstadual: "",
  inscricaoMunicipal: "",
  crt: 1,
  cnae: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  codigoMunicipioIbge: "",
  municipio: "",
  uf: "PE",
  cep: "",
  telefone: "",
  email: "",
};

function mapEmpresa(row: DbEmpresa | null): EmpresaFiscal {
  if (!row) return { ...EMPTY_EMPRESA };
  return {
    cnpj: row.cnpj ?? "",
    razaoSocial: row.razao_social ?? "",
    nomeFantasia: row.nome_fantasia ?? "",
    inscricaoEstadual: row.inscricao_estadual ?? "",
    inscricaoMunicipal: row.inscricao_municipal ?? "",
    crt: (row.crt ?? 1) as EmpresaFiscal["crt"],
    cnae: row.cnae ?? "",
    logradouro: row.logradouro ?? "",
    numero: row.numero ?? "",
    complemento: row.complemento ?? "",
    bairro: row.bairro ?? "",
    codigoMunicipioIbge: row.codigo_municipio_ibge ?? "",
    municipio: row.municipio ?? "",
    uf: row.uf ?? "",
    cep: row.cep ?? "",
    telefone: row.telefone ?? "",
    email: row.email ?? "",
  };
}

function mapConfigPublic(row: DbFiscalConfig | null): FiscalConfigPublic {
  const validoAte = row?.certificado_valido_ate ?? null;
  const diasRestantes =
    validoAte != null
      ? Math.ceil((new Date(validoAte).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;

  return {
    nfceHabilitada: row?.nfce_habilitada ?? false,
    nfeHabilitada: row?.nfe_habilitada ?? false,
    ambiente: (row?.ambiente === "producao" ? "producao" : "homologacao") as FiscalAmbiente,
    serieNfce: row?.serie_nfce ?? 1,
    proximoNumeroNfce: row?.proximo_numero_nfce ?? 1,
    cscId: row?.csc_id ?? "",
    cscTokenConfigured: Boolean(row?.csc_token_encrypted),
    emitirAutomaticoPdv: row?.emitir_automatico_pdv ?? false,
    emitirAutomaticoDelivery: row?.emitir_automatico_delivery ?? false,
    emitirAutomaticoMesas: row?.emitir_automatico_mesas ?? false,
    provider: row?.provider ?? "sefaz",
    certificado: {
      instalado: Boolean(row?.certificado_pfx_encrypted && row?.certificado_senha_encrypted),
      titular: row?.certificado_titular ?? null,
      cnpj: row?.certificado_cnpj ?? null,
      validoAte,
      instaladoEm: row?.certificado_instalado_em ?? null,
      diasRestantes,
    },
  };
}

async function ensureFiscalRows() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("empresa_fiscal").upsert({ id: "default" }, { onConflict: "id" });
  await supabaseAdmin.from("fiscal_config").upsert({ id: "default" }, { onConflict: "id" });
}

export async function fetchFiscalSettings(): Promise<FiscalSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await ensureFiscalRows();

  const [empresaResult, configResult] = await Promise.all([
    supabaseAdmin.from("empresa_fiscal").select("*").eq("id", "default").maybeSingle(),
    supabaseAdmin.from("fiscal_config").select("*").eq("id", "default").maybeSingle(),
  ]);

  if (empresaResult.error?.code === "42P01" || configResult.error?.code === "42P01") {
    throw new Error(
      "Tabelas fiscais ausentes. Rode scripts/production-fiscal-migrations.sql no Supabase.",
    );
  }
  if (empresaResult.error) throw empresaResult.error;
  if (configResult.error) throw configResult.error;

  const empresa = mapEmpresa(empresaResult.data as DbEmpresa | null);
  const config = mapConfigPublic(configResult.data as DbFiscalConfig | null);

  return {
    empresa,
    config,
    readiness: assessFiscalReadiness({
      empresa,
      config,
      encryptionKeyConfigured: Boolean(process.env.ENCRYPTION_KEY?.trim()),
    }),
  };
}

export async function saveEmpresaFiscal(empresa: EmpresaFiscal) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await ensureFiscalRows();

  const { error } = await supabaseAdmin
    .from("empresa_fiscal")
    .upsert(
      {
        id: "default",
        cnpj: onlyDigits(empresa.cnpj),
        razao_social: empresa.razaoSocial.trim(),
        nome_fantasia: empresa.nomeFantasia.trim(),
        inscricao_estadual: empresa.inscricaoEstadual.trim(),
        inscricao_municipal: empresa.inscricaoMunicipal.trim() || null,
        crt: empresa.crt,
        cnae: onlyDigits(empresa.cnae) || null,
        logradouro: empresa.logradouro.trim(),
        numero: empresa.numero.trim(),
        complemento: empresa.complemento.trim() || null,
        bairro: empresa.bairro.trim(),
        codigo_municipio_ibge: onlyDigits(empresa.codigoMunicipioIbge),
        municipio: empresa.municipio.trim(),
        uf: empresa.uf.trim().toUpperCase(),
        cep: onlyDigits(empresa.cep),
        telefone: onlyDigits(empresa.telefone) || null,
        email: empresa.email.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) throw error;
}

export type SaveFiscalConfigInput = {
  nfceHabilitada: boolean;
  nfeHabilitada: boolean;
  ambiente: FiscalAmbiente;
  serieNfce: number;
  proximoNumeroNfce: number;
  cscId: string;
  cscToken?: string;
  emitirAutomaticoPdv: boolean;
  emitirAutomaticoDelivery: boolean;
  emitirAutomaticoMesas: boolean;
};

export async function saveFiscalConfig(input: SaveFiscalConfigInput) {
  const { encryptSecret } = await import("@/lib/api/fiscal/fiscal-certificate.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await ensureFiscalRows();

  const { data: currentConfig } = await supabaseAdmin
    .from("fiscal_config")
    .select("ambiente")
    .eq("id", "default")
    .maybeSingle();

  const ambienteAtual: FiscalAmbiente =
    currentConfig?.ambiente === "producao" ? "producao" : "homologacao";

  const payload: Record<string, unknown> = {
    id: "default",
    nfce_habilitada: input.nfceHabilitada,
    nfe_habilitada: input.nfeHabilitada,
    ambiente: ambienteAtual,
    serie_nfce: input.serieNfce,
    proximo_numero_nfce: input.proximoNumeroNfce,
    csc_id: input.cscId.trim() || null,
    emitir_automatico_pdv: input.emitirAutomaticoPdv,
    emitir_automatico_delivery: input.emitirAutomaticoDelivery,
    emitir_automatico_mesas: input.emitirAutomaticoMesas,
    provider: "sefaz",
    updated_at: new Date().toISOString(),
  };

  if (input.cscToken?.trim()) {
    try {
      payload.csc_token_encrypted = encryptSecret(input.cscToken.trim());
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "ENCRYPTION_KEY ausente no servidor para salvar o CSC.",
      );
    }
  }

  const { error } = await supabaseAdmin.from("fiscal_config").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function setFiscalAmbiente(ambiente: FiscalAmbiente) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await ensureFiscalRows();

  const { error } = await supabaseAdmin
    .from("fiscal_config")
    .update({
      ambiente,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");

  if (error) throw error;
  return { ambiente };
}

export async function saveEncryptedCertificate(input: {
  pfxEncrypted: string;
  senhaEncrypted: string;
  titular: string;
  cnpj: string | null;
  validoAte: Date;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await ensureFiscalRows();

  const { error } = await supabaseAdmin
    .from("fiscal_config")
    .upsert(
      {
        id: "default",
        certificado_pfx_encrypted: input.pfxEncrypted,
        certificado_senha_encrypted: input.senhaEncrypted,
        certificado_titular: input.titular,
        certificado_cnpj: input.cnpj,
        certificado_valido_ate: input.validoAte.toISOString(),
        certificado_instalado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) throw error;
}

export async function removeStoredCertificate() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("fiscal_config")
    .update({
      certificado_pfx_encrypted: null,
      certificado_senha_encrypted: null,
      certificado_titular: null,
      certificado_cnpj: null,
      certificado_valido_ate: null,
      certificado_instalado_em: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (error) throw error;
}

export async function getFiscalSecretsForEmission() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptSecret, decryptCertificatePfx } = await import(
    "@/lib/api/fiscal/fiscal-certificate.server"
  );

  const { data, error } = await supabaseAdmin
    .from("fiscal_config")
    .select("*")
    .eq("id", "default")
    .single();
  if (error) throw error;

  const row = data as DbFiscalConfig;
  if (!row.certificado_pfx_encrypted || !row.certificado_senha_encrypted) {
    throw new Error("Certificado digital nao configurado.");
  }

  return {
    config: row,
    pfxBuffer: decryptCertificatePfx(row.certificado_pfx_encrypted),
    certPassword: decryptSecret(row.certificado_senha_encrypted),
    cscToken: row.csc_token_encrypted ? decryptSecret(row.csc_token_encrypted) : "",
  };
}

export async function incrementNfceNumber() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("fiscal_config")
      .select("proximo_numero_nfce")
      .eq("id", "default")
      .single();
    if (error) throw error;

    const numero = data.proximo_numero_nfce ?? 1;
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("fiscal_config")
      .update({
        proximo_numero_nfce: numero + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default")
      .eq("proximo_numero_nfce", numero)
      .select("proximo_numero_nfce")
      .maybeSingle();

    if (!updateError && updated) return numero;
    if (updateError) throw updateError;
  }

  throw new Error("Nao foi possivel reservar numero sequencial da NFC-e. Tente novamente.");
}
