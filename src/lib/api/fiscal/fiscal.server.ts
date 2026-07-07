import type { FiscalAmbiente } from "@/lib/fiscal/fiscal-types";
import type { SefazEmissionResult, SefazSecrets } from "@/lib/fiscal/fiscal-sefaz.types";
import { buildNfceNFeProps, type NfceItemInput } from "@/lib/fiscal/fiscal-nfe-builder";
import { validateEmpresaFiscal, onlyDigits } from "@/lib/fiscal/fiscal-validation";
import {
  encryptCertificatePfx,
  encryptSecret,
  parsePfxCertificate,
  validateCertificateMatchesCnpj,
} from "@/lib/api/fiscal/fiscal-certificate.server";
import {
  fetchFiscalSettings,
  getFiscalSecretsForEmission,
  incrementNfceNumber,
  removeStoredCertificate,
  saveEmpresaFiscal,
  saveEncryptedCertificate,
  saveFiscalConfig,
  setFiscalAmbiente,
  type SaveFiscalConfigInput,
} from "@/lib/api/fiscal/fiscal-store.server";

async function emitNfceViaSefaz(
  ...args: Parameters<(typeof import("@/lib/api/fiscal/fiscal-sefaz.server"))["emitNfceViaSefaz"]>
) {
  const { emitNfceViaSefaz: emit } = await import("@/lib/api/fiscal/fiscal-sefaz.server");
  return emit(...args);
}

async function checkSefazStatus(secrets: SefazSecrets) {
  const { checkSefazStatus: check } = await import("@/lib/api/fiscal/fiscal-sefaz.server");
  return check(secrets);
}

export async function installFiscalCertificate(input: {
  pfxBase64: string;
  password: string;
  empresaCnpj: string;
}) {
  const buffer = Buffer.from(input.pfxBase64, "base64");
  if (buffer.length < 100) {
    throw new Error("Arquivo de certificado invalido ou vazio.");
  }

  const parsed = parsePfxCertificate(buffer, input.password);
  validateCertificateMatchesCnpj(parsed, input.empresaCnpj);

  const pfxEncrypted = encryptCertificatePfx(buffer);
  const senhaEncrypted = encryptSecret(parsed.resolvedPassword);

  await saveEncryptedCertificate({
    pfxEncrypted,
    senhaEncrypted,
    titular: parsed.titular,
    cnpj: parsed.cnpj,
    validoAte: parsed.validoAte,
  });

  return {
    titular: parsed.titular,
    cnpj: parsed.cnpj,
    validoAte: parsed.validoAte.toISOString(),
  };
}

export async function assertFiscalReadyForEmission() {
  const settings = await fetchFiscalSettings();
  if (!settings.config.nfceHabilitada) {
    throw new Error("NFC-e nao esta habilitada nas configuracoes fiscais.");
  }
  if (!settings.readiness.empresaCompleta) {
    throw new Error(`Dados da empresa incompletos: ${settings.readiness.camposPendentes.join(" ")}`);
  }
  if (!settings.readiness.certificadoValido) {
    throw new Error("Certificado digital ausente ou vencido.");
  }
  if (!settings.readiness.cscConfigurado) {
    throw new Error("Configure o CSC (ID + token) da SEFAZ para NFC-e.");
  }
  if (!settings.readiness.sefazDireto) {
    throw new Error("Integracao SEFAZ nao pronta. Verifique ENCRYPTION_KEY e certificado.");
  }
  return settings;
}

async function loadSefazSecrets(ambiente: FiscalAmbiente): Promise<SefazSecrets> {
  const settings = await fetchFiscalSettings();
  const secrets = await getFiscalSecretsForEmission();
  const uf = settings.empresa.uf.trim().toUpperCase() || "PE";

  if (!secrets.cscToken || !settings.config.cscId.trim()) {
    throw new Error("CSC (ID + token) nao configurado.");
  }

  return {
    pfxBuffer: secrets.pfxBuffer,
    certPassword: secrets.certPassword,
    cscId: settings.config.cscId,
    cscToken: secrets.cscToken,
    uf,
    ambiente,
  };
}

type PedidoEmissao = {
  id: string;
  numero: number;
  total: number;
  forma_pagamento: string | null;
  canal: string;
};

type ItemEmissao = {
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  produtos: {
    nome: string;
    ncm: string | null;
    cfop: string | null;
    csosn: string | null;
    origem: number | null;
    gtin: string | null;
    unidade: string | null;
  } | null;
};

function mapItensToNfceInput(itens: ItemEmissao[]): NfceItemInput[] {
  return itens.map((item, index) => ({
    produtoId: item.produto_id,
    nome: item.produtos?.nome ?? `Item ${index + 1}`,
    ncm: onlyDigits(item.produtos?.ncm ?? ""),
    cfop: item.produtos?.cfop ?? "5102",
    csosn: item.produtos?.csosn ?? "102",
    origem: item.produtos?.origem ?? 0,
    gtin: item.produtos?.gtin || "SEM GTIN",
    unidade: item.produtos?.unidade ?? "UN",
    quantidade: item.quantidade,
    precoUnitario: item.preco_unitario,
  }));
}

export async function buildNfceForPedido(pedidoId: string, consumidorCpf?: string) {
  const settings = await assertFiscalReadyForEmission();
  const empresaErrors = validateEmpresaFiscal(settings.empresa);
  if (empresaErrors.length > 0) {
    throw new Error(empresaErrors.join(" "));
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: pedido, error: pedidoError } = await supabaseAdmin
    .from("pedidos")
    .select("id, numero, total, taxa_entrega, forma_pagamento, canal")
    .eq("id", pedidoId)
    .single();
  if (pedidoError || !pedido) throw new Error("Pedido nao encontrado.");

  const { data: itens, error: itensError } = await supabaseAdmin
    .from("pedido_itens")
    .select(
      "produto_id, quantidade, preco_unitario, produtos(nome, ncm, cfop, csosn, origem, gtin, unidade)",
    )
    .eq("pedido_id", pedidoId);
  if (itensError) throw itensError;
  if (!itens?.length) throw new Error("Pedido sem itens para emissao.");

  const missingNcm = (itens as ItemEmissao[]).filter((item) => !item.produtos?.ncm?.trim());
  if (missingNcm.length > 0) {
    throw new Error("Existem produtos sem NCM. Preencha na aba Fiscal do catalogo.");
  }

  const numeroNota = await incrementNfceNumber();
  const ambiente = settings.config.ambiente;

  const nfeProps = buildNfceNFeProps({
    empresa: settings.empresa,
    ambiente,
    serie: settings.config.serieNfce,
    numero: numeroNota,
    itens: mapItensToNfceInput(itens as ItemEmissao[]),
    total: Number(pedido.total),
    taxaEntrega: Number(pedido.taxa_entrega ?? 0),
    formaPagamento: pedido.forma_pagamento,
    consumidorCpf,
  });

  return {
    nfeProps,
    pedido: pedido as PedidoEmissao,
    numeroNota,
    ambiente,
    serie: settings.config.serieNfce,
  };
}

async function persistNotaFiscal(input: {
  pedidoId: string | null;
  status: string;
  response: SefazEmissionResult;
  pedidoTotal: number;
  numeroNota: number;
  serie: number;
  ambiente: FiscalAmbiente;
  consumidorCpf?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const autorizada = input.response.autorizada;

  const { data: nota, error } = await supabaseAdmin
    .from("notas_fiscais")
    .insert({
      pedido_id: input.pedidoId,
      tipo: "NFC-e",
      status: autorizada
        ? input.ambiente === "homologacao"
          ? "autorizada_homologacao"
          : "autorizada"
        : "rejeitada",
      chave_acesso: input.response.chaveAcesso ?? null,
      numero: String(input.numeroNota),
      serie: String(input.serie),
      valor: Number(input.pedidoTotal),
      xml_url: null,
      danfe_url: null,
      qrcode_url: input.response.qrcodeUrl ?? null,
      protocolo_sefaz: input.response.protocolo ?? null,
      codigo_status: input.response.codigoStatus ? Number(input.response.codigoStatus) : null,
      motivo_rejeicao: autorizada ? null : input.response.motivo,
      consumidor_cpf: input.consumidorCpf ? onlyDigits(input.consumidorCpf) : null,
      xml_autorizado: input.response.xmlProtocolado ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return nota;
}

export async function emitNfceForPedido(pedidoId: string, consumidorCpf?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: pedidoRow } = await supabaseAdmin
    .from("pedidos")
    .select("tenant_id")
    .eq("id", pedidoId)
    .maybeSingle();
  if (pedidoRow?.tenant_id) {
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(pedidoRow.tenant_id, "fiscal");
  }

  const { data: existing } = await supabaseAdmin
    .from("notas_fiscais")
    .select("*")
    .eq("pedido_id", pedidoId)
    .in("status", ["autorizada", "autorizada_homologacao"])
    .maybeSingle();

  if (existing) {
    return { nota: existing, ambiente: (await fetchFiscalSettings()).config.ambiente, sefaz: null };
  }

  const { nfeProps, pedido, numeroNota, ambiente, serie } = await buildNfceForPedido(
    pedidoId,
    consumidorCpf,
  );
  const secrets = await loadSefazSecrets(ambiente);
  const response = await emitNfceViaSefaz(nfeProps, secrets);

  if (!response.autorizada) {
    const nota = await persistNotaFiscal({
      pedidoId,
      status: "rejeitada",
      response,
      pedidoTotal: Number(pedido.total),
      numeroNota,
      serie,
      ambiente,
      consumidorCpf,
    });
    throw new Error(`SEFAZ rejeitou NFC-e: [${response.codigoStatus}] ${response.motivo}`);
  }

  const nota = await persistNotaFiscal({
    pedidoId,
    status: "autorizada",
    response,
    pedidoTotal: Number(pedido.total),
    numeroNota,
    serie,
    ambiente,
    consumidorCpf,
  });

  return { nota, ambiente, sefaz: response };
}

export async function emitNfceHomologacaoTest() {
  const settings = await assertFiscalReadyForEmission();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: produto } = await supabaseAdmin
    .from("produtos")
    .select("id, nome, ncm, cfop, csosn, origem, gtin, unidade, preco")
    .not("ncm", "is", null)
    .limit(1)
    .maybeSingle();

  if (!produto?.ncm) {
    throw new Error("Cadastre ao menos um produto com NCM para o teste de homologacao.");
  }

  const numeroNota = await incrementNfceNumber();
  const valor = Number(produto.preco) || 1;
  const ambiente = settings.config.ambiente;

  const nfeProps = buildNfceNFeProps({
    empresa: settings.empresa,
    ambiente,
    serie: settings.config.serieNfce,
    numero: numeroNota,
    itens: [
      {
        produtoId: produto.id,
        nome: produto.nome,
        ncm: onlyDigits(produto.ncm),
        cfop: produto.cfop ?? "5102",
        csosn: produto.csosn ?? "102",
        origem: produto.origem ?? 0,
        gtin: produto.gtin || "SEM GTIN",
        unidade: produto.unidade ?? "UN",
        quantidade: 1,
        precoUnitario: valor,
      },
    ],
    total: valor,
    formaPagamento: "dinheiro",
    homologacao: true,
  });

  const secrets = await loadSefazSecrets(ambiente);
  const response = await emitNfceViaSefaz(nfeProps, secrets);

  const nota = await persistNotaFiscal({
    pedidoId: null,
    status: response.autorizada ? "autorizada_homologacao" : "rejeitada",
    response,
    pedidoTotal: valor,
    numeroNota,
    serie: settings.config.serieNfce,
    ambiente,
  });

  if (!response.autorizada) {
    throw new Error(`SEFAZ rejeitou teste: [${response.codigoStatus}] ${response.motivo}`);
  }

  return { nota, sefaz: response };
}

export async function testSefazConnection() {
  await assertFiscalReadyForEmission();
  const settings = await fetchFiscalSettings();
  const secrets = await loadSefazSecrets(settings.config.ambiente);
  return checkSefazStatus(secrets);
}

async function assertFiscalCertificateForSefazOps() {
  const settings = await fetchFiscalSettings();
  if (!settings.readiness.certificadoValido) {
    throw new Error("Certificado digital ausente ou vencido.");
  }
  if (!settings.readiness.encryptionKey) {
    throw new Error("ENCRYPTION_KEY ausente no servidor.");
  }
  return settings;
}

async function getNotaFiscalOrThrow(notaId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("notas_fiscais").select("*").eq("id", notaId).single();
  if (error || !data) throw new Error("Nota fiscal nao encontrada.");
  return data;
}

export async function consultarStatusNotaFiscal(notaId: string) {
  const settings = await assertFiscalCertificateForSefazOps();
  const nota = await getNotaFiscalOrThrow(notaId);
  if (!nota.chave_acesso?.trim()) {
    throw new Error("Nota sem chave de acesso para consulta na SEFAZ.");
  }

  const secrets = await loadSefazSecrets(settings.config.ambiente);
  const { consultarProtocoloSefaz } = await import("@/lib/api/fiscal/fiscal-sefaz.server");
  const result = await consultarProtocoloSefaz(nota.chave_acesso, secrets);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("notas_fiscais")
    .update({
      codigo_status: Number(result.codigoStatus) || null,
      motivo_rejeicao: result.sucesso ? null : result.motivo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notaId);

  return { notaId, result };
}

export async function cancelarNotaFiscal(notaId: string, justificativa: string) {
  const settings = await assertFiscalCertificateForSefazOps();
  const nota = await getNotaFiscalOrThrow(notaId);

  if (!["autorizada", "autorizada_homologacao"].includes(nota.status)) {
    throw new Error("Somente notas autorizadas podem ser canceladas.");
  }
  if (!nota.chave_acesso?.trim()) throw new Error("Nota sem chave de acesso.");
  if (!nota.protocolo_sefaz?.trim()) throw new Error("Nota sem protocolo de autorizacao.");
  if (justificativa.trim().length < 15) {
    throw new Error("Justificativa deve ter no minimo 15 caracteres.");
  }

  const secrets = await loadSefazSecrets(settings.config.ambiente);
  const { cancelarNfceSefaz } = await import("@/lib/api/fiscal/fiscal-sefaz.server");
  const result = await cancelarNfceSefaz(
    {
      chaveAcesso: nota.chave_acesso,
      cnpj: settings.empresa.cnpj,
      protocolo: nota.protocolo_sefaz,
      justificativa: justificativa.trim(),
    },
    secrets,
  );

  if (!result.sucesso) {
    throw new Error(`SEFAZ rejeitou cancelamento: [${result.codigoStatus}] ${result.motivo}`);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: updated, error } = await supabaseAdmin
    .from("notas_fiscais")
    .update({
      status: "cancelada",
      codigo_status: Number(result.codigoStatus) || 101,
      motivo_rejeicao: null,
      protocolo_sefaz: result.protocolo ?? nota.protocolo_sefaz,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notaId)
    .select("*")
    .single();

  if (error) throw error;
  return { nota: updated, result };
}

export async function inutilizarNumeracaoFiscal(input: {
  serie: number;
  numeroInicial: number;
  numeroFinal: number;
  justificativa: string;
  ano?: number;
}) {
  const settings = await assertFiscalCertificateForSefazOps();
  if (input.justificativa.trim().length < 15) {
    throw new Error("Justificativa deve ter no minimo 15 caracteres.");
  }
  if (input.numeroInicial < 1 || input.numeroFinal < input.numeroInicial) {
    throw new Error("Faixa de numeracao invalida.");
  }

  const secrets = await loadSefazSecrets(settings.config.ambiente);
  const { inutilizarNumeracaoSefaz } = await import("@/lib/api/fiscal/fiscal-sefaz.server");
  const result = await inutilizarNumeracaoSefaz(
    {
      cnpj: settings.empresa.cnpj,
      serie: input.serie,
      numeroInicial: input.numeroInicial,
      numeroFinal: input.numeroFinal,
      justificativa: input.justificativa.trim(),
      ano: input.ano,
    },
    secrets,
  );

  if (!result.sucesso) {
    throw new Error(`SEFAZ rejeitou inutilizacao: [${result.codigoStatus}] ${result.motivo}`);
  }

  return { result, serie: input.serie, numeroInicial: input.numeroInicial, numeroFinal: input.numeroFinal };
}

export {
  fetchFiscalSettings,
  saveEmpresaFiscal,
  saveFiscalConfig,
  setFiscalAmbiente,
  removeStoredCertificate,
  type SaveFiscalConfigInput,
};

export async function tryAutoEmitNfceForPedido(pedidoId: string, canal: string) {
  try {
    const settings = await fetchFiscalSettings();
    if (!settings.config.nfceHabilitada) return null;

    const canalNorm = canal.toLowerCase();
    const shouldEmit =
      (canalNorm === "balcao" && settings.config.emitirAutomaticoPdv) ||
      (canalNorm === "delivery" && settings.config.emitirAutomaticoDelivery) ||
      (canalNorm === "mesas" && settings.config.emitirAutomaticoMesas);

    if (!shouldEmit) return null;
    if (!settings.readiness.empresaCompleta || !settings.readiness.certificadoValido) return null;
    if (!settings.readiness.cscConfigurado || !settings.readiness.sefazDireto) return null;

    return await emitNfceForPedido(pedidoId);
  } catch (error) {
    console.error("[fiscal] auto-emissao falhou:", error);
    return null;
  }
}
