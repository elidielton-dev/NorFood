/**
 * Corrige URLs da @brasil-fiscal/nfe para PE (SVRS + QR/urlChave) na emissao.
 * Em Node local faz patch nos modulos CJS internos; em bundle ESM tenta patch no entry.
 */
import { UF_AUTORIZADOR_NFCE } from "@/lib/fiscal/fiscal-sefaz-urls";

const PE_NFCE_QR_HOMOLOG = "http://nfcehomolog.sefaz.pe.gov.br/nfce/consulta";
const PE_NFCE_QR_PRODUCAO = "http://nfce.sefaz.pe.gov.br/nfce/consulta";
const PE_NFCE_URL_CHAVE = "nfce.sefaz.pe.gov.br/nfce/consulta";

let patched = false;

type SefazUrlsModule = {
  getSefazUrl: (uf: string, environment: string, service: string) => string;
  AUTORIZADOR_URLS: Record<string, Record<string, Record<string, string>>>;
};

type NfceUrlsModule = {
  getNFCeQRCodeUrl: (uf: string, environment: string) => string;
  getNFCeConsultaUrl: (uf: string, environment: string) => string;
};

function patchSefazUrls(mod: SefazUrlsModule) {
  const original = mod.getSefazUrl.bind(mod);
  mod.getSefazUrl = (uf, environment, service) => {
    if (service.startsWith("NFCe")) {
      const autorizador = UF_AUTORIZADOR_NFCE[uf.trim().toUpperCase()];
      if (!autorizador) throw new Error(`UF desconhecida para NFC-e: ${uf}`);
      const urls = mod.AUTORIZADOR_URLS[autorizador];
      if (!urls) throw new Error(`SEFAZ NFC-e nao configurada para UF: ${uf}`);
      const url = urls[environment]?.[service];
      if (!url) {
        throw new Error(`Servico ${service} nao configurado para ${autorizador} em ${environment}`);
      }
      return url;
    }
    return original(uf, environment, service);
  };
}

function patchNfceUrls(mod: NfceUrlsModule) {
  const originalQr = mod.getNFCeQRCodeUrl.bind(mod);
  const originalConsulta = mod.getNFCeConsultaUrl.bind(mod);

  mod.getNFCeQRCodeUrl = (uf, environment) => {
    if (uf.trim().toUpperCase() === "PE") {
      return environment === "homologacao" ? PE_NFCE_QR_HOMOLOG : PE_NFCE_QR_PRODUCAO;
    }
    return originalQr(uf, environment);
  };

  mod.getNFCeConsultaUrl = (uf, environment) => {
    if (uf.trim().toUpperCase() === "PE") return PE_NFCE_URL_CHAVE;
    return originalConsulta(uf, environment);
  };
}

async function patchInternalNodeModules() {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  patchSefazUrls(
    require("@brasil-fiscal/nfe/dist/shared/constants/sefaz-urls.js") as SefazUrlsModule,
  );
  patchNfceUrls(
    require("@brasil-fiscal/nfe/dist/shared/constants/nfce-urls.js") as NfceUrlsModule,
  );
}

async function patchPackageExports() {
  const mod = (await import("@brasil-fiscal/nfe")) as SefazUrlsModule & NfceUrlsModule;
  patchSefazUrls(mod);
  patchNfceUrls(mod);
}

/** Aplica patches uma vez (idempotente). Necessario antes de emitir NFC-e em PE. */
export async function ensureBrasilFiscalUrlPatches() {
  if (patched) return;
  try {
    await patchInternalNodeModules();
  } catch {
    try {
      await patchPackageExports();
    } catch {
      // Bundle somente-leitura — emissao PE pode falhar sem deploy atualizado.
    }
  }
  patched = true;
}

/** @deprecated use ensureBrasilFiscalUrlPatches */
export async function ensureNfceSefazUrlPatch() {
  await ensureBrasilFiscalUrlPatches();
}

/** @deprecated use ensureBrasilFiscalUrlPatches */
export async function ensureNfcePeUrlPatch() {
  await ensureBrasilFiscalUrlPatches();
}
