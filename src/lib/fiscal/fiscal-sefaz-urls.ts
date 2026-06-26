import type { FiscalAmbiente } from "@/lib/fiscal/fiscal-types";
import nfceAutorizadorUrls from "@/lib/fiscal/fiscal-nfce-autorizador-urls.json";

/** NFC-e mod 65 — PE autoriza via SVRS. Fonte: nfephp autorizadores.json */
export const UF_AUTORIZADOR_NFCE: Record<string, string> = {
  AC: "SVRS",
  AL: "SVRS",
  AM: "AM",
  AP: "SVRS",
  BA: "SVRS",
  CE: "SVRS",
  DF: "SVRS",
  ES: "SVRS",
  GO: "GO",
  MA: "SVRS",
  MG: "MG",
  MS: "MS",
  MT: "MT",
  PA: "SVRS",
  PB: "SVRS",
  PE: "SVRS",
  PI: "SVRS",
  PR: "PR",
  RJ: "SVRS",
  RN: "SVRS",
  RO: "SVRS",
  RR: "SVRS",
  RS: "RS",
  SC: "SVRS",
  SE: "SVRS",
  SP: "SP",
  TO: "SVRS",
  SVRS: "SVRS",
};

const IBGE_TO_UF: Record<string, string> = {
  "12": "AC",
  "27": "AL",
  "13": "AM",
  "16": "AP",
  "29": "BA",
  "23": "CE",
  "53": "DF",
  "32": "ES",
  "52": "GO",
  "21": "MA",
  "31": "MG",
  "50": "MS",
  "51": "MT",
  "15": "PA",
  "25": "PB",
  "26": "PE",
  "22": "PI",
  "41": "PR",
  "33": "RJ",
  "24": "RN",
  "11": "RO",
  "14": "RR",
  "43": "RS",
  "42": "SC",
  "28": "SE",
  "35": "SP",
  "17": "TO",
};

export function ibgeToUfFromChave(chaveAcesso: string) {
  const code = chaveAcesso.replace(/\D/g, "").substring(0, 2);
  const uf = IBGE_TO_UF[code];
  if (!uf) throw new Error(`Codigo IBGE de UF desconhecido: ${code}`);
  return uf;
}

export function isNfceChave(chaveAcesso: string) {
  const chave = chaveAcesso.replace(/\D/g, "");
  return chave.length === 44 && chave.substring(20, 22) === "65";
}

type AutorizadorUrls = Record<FiscalAmbiente, Record<string, string>>;

const AUTORIZADOR_URLS = nfceAutorizadorUrls as Record<string, AutorizadorUrls>;

/** Resolve webservice NFC-e pelo autorizador correto (ex.: PE → SVRS). */
export function getSefazUrlForNfce(
  uf: string,
  environment: FiscalAmbiente,
  service: string,
) {
  const autorizador = UF_AUTORIZADOR_NFCE[uf.trim().toUpperCase()];
  if (!autorizador) {
    throw new Error(`UF desconhecida para NFC-e: ${uf}`);
  }

  const allUrls = AUTORIZADOR_URLS;
  const urls = allUrls[autorizador];
  if (!urls) {
    throw new Error(`SEFAZ NFC-e nao configurada para UF: ${uf} (autorizador: ${autorizador})`);
  }

  const resolvedService =
    service === "NFeConsultaProtocolo"
      ? "NFCeConsultaProtocolo"
      : service === "RecepcaoEvento"
        ? "NFCeRecepcaoEvento"
        : service === "NFeInutilizacao"
          ? "NFCeInutilizacao"
          : service;
  const url = urls[environment]?.[resolvedService];
  if (!url) {
    throw new Error(
      `Servico ${resolvedService} nao configurado para ${autorizador} em ${environment}`,
    );
  }
  return url;
}
