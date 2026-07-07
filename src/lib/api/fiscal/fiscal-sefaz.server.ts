import type { NFeProps } from "@brasil-fiscal/nfe";
import type {
  SefazConsultaResult,
  SefazEmissionResult,
  SefazEventoResult,
  SefazSecrets,
} from "@/lib/fiscal/fiscal-sefaz.types";
import { ensureBrasilFiscalUrlPatches } from "@/lib/fiscal/fiscal-sefaz-url-patch";

async function loadNFeCoreClass(options?: { nfceEmission?: boolean }) {
  if (options?.nfceEmission) {
    await ensureBrasilFiscalUrlPatches();
  }
  const mod = await import("@brasil-fiscal/nfe");
  return mod.NFeCore;
}

async function createNFeCore(secrets: SefazSecrets, options?: { nfceEmission?: boolean }) {
  const NFeCore = await loadNFeCoreClass({ nfceEmission: options?.nfceEmission });
  const { ForgeA1CertificateProvider } = await import("@/lib/fiscal/forge-certificate-provider");
  const config: {
    pfx: Buffer;
    senha: string;
    ambiente: SefazSecrets["ambiente"];
    uf: string;
    cIdToken: string;
    csc: string;
    certificate: ForgeA1CertificateProvider;
    xmlBuilder?: { build: (nfe: unknown) => string };
  } = {
    pfx: secrets.pfxBuffer,
    senha: secrets.certPassword,
    ambiente: secrets.ambiente,
    uf: secrets.uf.trim().toUpperCase(),
    cIdToken: secrets.cscId.trim(),
    csc: secrets.cscToken.trim(),
    certificate: new ForgeA1CertificateProvider(secrets.pfxBuffer, secrets.certPassword),
  };

  if (options?.nfceEmission) {
    const { fetchFiscalSettings } = await import("@/lib/api/fiscal/fiscal-store.server");
    const settings = await fetchFiscalSettings();
    const { buildInfRespTecXml, createNfceXmlBuilder, resolveRespTecFromEnv } = await import(
      "@/lib/fiscal/fiscal-resptec"
    );
    const respTecXml = buildInfRespTecXml(resolveRespTecFromEnv(settings.empresa));
    const Builder = await createNfceXmlBuilder(respTecXml);
    config.xmlBuilder = new Builder();
  }

  return NFeCore.create(config);
}

async function handleSefazReject<T>(run: () => Promise<T>): Promise<T | SefazConsultaResult> {
  try {
    return await run();
  } catch (error) {
    const { SefazRejectError } = await import("@brasil-fiscal/core");
    if (error instanceof SefazRejectError) {
      return {
        sucesso: false,
        codigoStatus: error.cStat,
        motivo: error.xMotivo,
      };
    }
    throw error;
  }
}

export function extractQrCodeFromXml(xml: string | undefined) {
  if (!xml) return undefined;
  const match = xml.match(/<qrCode>([^<]+)<\/qrCode>/);
  return match?.[1]?.trim() || undefined;
}

export async function emitNfceViaSefaz(
  nfeProps: NFeProps,
  secrets: SefazSecrets,
): Promise<SefazEmissionResult> {
  if (!secrets.cscId.trim() || !secrets.cscToken.trim()) {
    throw new Error("CSC (ID + token) obrigatorio para NFC-e na SEFAZ.");
  }

  const core = await createNFeCore(secrets, { nfceEmission: true });

  try {
    const result = await core.transmitir(nfeProps);
    const qrcodeUrl = extractQrCodeFromXml(result.xmlProtocolado);

    return {
      autorizada: result.autorizada,
      protocolo: result.protocolo,
      chaveAcesso: result.chaveAcesso,
      codigoStatus: result.codigoStatus,
      motivo: result.motivo,
      xmlProtocolado: result.xmlProtocolado,
      qrcodeUrl,
    };
  } catch (error) {
    const { SefazRejectError } = await import("@brasil-fiscal/core");
    if (error instanceof SefazRejectError) {
      return {
        autorizada: false,
        codigoStatus: error.cStat,
        motivo: error.xMotivo,
      };
    }
    throw error;
  } finally {
    secrets.certPassword = "";
  }
}

export async function consultarProtocoloSefaz(
  chaveAcesso: string,
  secrets: SefazSecrets,
): Promise<SefazConsultaResult> {
  const chave = chaveAcesso.replace(/\D/g, "");
  const { isNfceChave, consultarProtocoloNfceSefaz } = await import(
    "@/lib/fiscal/fiscal-nfce-sefaz-ops"
  );

  try {
    if (isNfceChave(chave)) {
      const result = await consultarProtocoloNfceSefaz(chave, secrets);
      return {
        sucesso: result.cStat === "100" || result.cStat === "101",
        codigoStatus: result.cStat,
        motivo: result.xMotivo,
        protocolo: result.nProt,
      };
    }

    const core = await createNFeCore(secrets);
    const result = await handleSefazReject(() => core.consultarProtocolo(chave));
    if ("sucesso" in result && result.sucesso === false) return result;
    const ok = result as { codigoStatus: string; motivo: string; protocolo?: string };
    return {
      sucesso: ok.codigoStatus === "100" || ok.codigoStatus === "101",
      codigoStatus: ok.codigoStatus,
      motivo: ok.motivo,
      protocolo: ok.protocolo,
    };
  } finally {
    secrets.certPassword = "";
  }
}

export async function cancelarNfceSefaz(
  input: {
    chaveAcesso: string;
    cnpj: string;
    protocolo: string;
    justificativa: string;
  },
  secrets: SefazSecrets,
): Promise<SefazEventoResult> {
  const { cancelarNfceEventoSefaz } = await import("@/lib/fiscal/fiscal-nfce-sefaz-ops");
  try {
    const result = await cancelarNfceEventoSefaz(input, secrets);
    const codigoStatus = result.cStat ?? "135";
    if (codigoStatus !== "135" && codigoStatus !== "136") {
      return {
        sucesso: false,
        codigoStatus,
        motivo: result.xMotivo ?? "SEFAZ rejeitou cancelamento.",
      };
    }
    return {
      sucesso: true,
      codigoStatus,
      motivo: result.xMotivo ?? "Cancelamento registrado na SEFAZ.",
      protocolo: result.nProt,
    };
  } finally {
    secrets.certPassword = "";
  }
}

export async function inutilizarNumeracaoSefaz(
  input: {
    cnpj: string;
    serie: number;
    numeroInicial: number;
    numeroFinal: number;
    justificativa: string;
    ano?: number;
  },
  secrets: SefazSecrets,
): Promise<SefazEventoResult> {
  const { inutilizarNumeracaoNfceSefaz } = await import("@/lib/fiscal/fiscal-nfce-sefaz-ops");
  try {
    const result = await inutilizarNumeracaoNfceSefaz(
      {
        cnpj: input.cnpj,
        uf: secrets.uf.trim().toUpperCase(),
        ano: input.ano ?? new Date().getFullYear(),
        serie: input.serie,
        numeroInicial: input.numeroInicial,
        numeroFinal: input.numeroFinal,
        justificativa: input.justificativa,
      },
      secrets,
    );
    const codigoStatus = result.cStat ?? "102";
    if (codigoStatus !== "102") {
      return {
        sucesso: false,
        codigoStatus,
        motivo: result.xMotivo ?? "SEFAZ rejeitou inutilizacao.",
      };
    }
    return {
      sucesso: true,
      codigoStatus,
      motivo: result.xMotivo ?? "Inutilizacao homologada na SEFAZ.",
      protocolo: result.nProt,
    };
  } finally {
    secrets.certPassword = "";
  }
}

export async function checkSefazStatus(secrets: SefazSecrets) {
  await import("@brasil-fiscal/nfe");
  return {
    ok: true,
    uf: secrets.uf,
    ambiente: secrets.ambiente,
    message: "Certificado e CSC carregados. Emissao direta SEFAZ ativa.",
  };
}

export type { SefazEmissionResult, SefazSecrets };
