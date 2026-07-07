import type { SefazSecrets } from "@/lib/fiscal/fiscal-sefaz.types";
import type { SefazCertificateData } from "@/lib/api/fiscal/fiscal-certificate.server";
import {
  getSefazUrlForNfce,
  ibgeToUfFromChave,
  isNfceChave,
} from "@/lib/fiscal/fiscal-sefaz-urls";
import {
  buildCancelamentoXml,
  buildConsultaEnvelope,
  buildInutilizacaoNfceXml,
  CONSULTA_SOAP_ACTION,
  EVENTO_SOAP_ACTION,
  extractSoapBody,
  INUTILIZACAO_SOAP_ACTION,
  parseConsultaResponse,
  parseEventoResponse,
  parseInutilizacaoResponse,
  wrapEventoSoapEnvelope,
  wrapInutilizacaoSoapEnvelope,
} from "@/lib/fiscal/fiscal-nfce-soap";

export { isNfceChave };

async function loadSefazDeps(secrets: SefazSecrets) {
  const { ForgeA1CertificateProvider } = await import("@/lib/fiscal/forge-certificate-provider");
  const { DefaultXmlSigner, NodeHttpSefazTransport } = await import("@brasil-fiscal/core");

  const certificate = new ForgeA1CertificateProvider(secrets.pfxBuffer, secrets.certPassword);
  const cert = await certificate.load();
  return {
    cert,
    xmlSigner: new DefaultXmlSigner(),
    transport: new NodeHttpSefazTransport(),
  };
}

async function sendSoap(input: {
  url: string;
  soapAction: string;
  xml: string;
  cert: SefazCertificateData;
  transport: { send: (req: unknown) => Promise<{ xml: string }> };
}) {
  const response = await input.transport.send({
    url: input.url,
    soapAction: input.soapAction,
    xml: input.xml,
    pfx: input.cert.pfx,
    password: input.cert.password,
  });
  return extractSoapBody(response.xml);
}

export async function consultarProtocoloNfceSefaz(chaveAcesso: string, secrets: SefazSecrets) {
  const chave = chaveAcesso.replace(/\D/g, "");
  const uf = ibgeToUfFromChave(chave);
  const ambiente = secrets.ambiente;
  const tpAmb = ambiente === "producao" ? "1" : "2";

  const { cert, transport } = await loadSefazDeps(secrets);
  const url = getSefazUrlForNfce(uf, ambiente, "NFeConsultaProtocolo");
  const envelope = buildConsultaEnvelope(chave, tpAmb);
  const body = await sendSoap({
    url,
    soapAction: CONSULTA_SOAP_ACTION,
    xml: envelope,
    cert,
    transport,
  });
  return parseConsultaResponse(body);
}

export async function cancelarNfceEventoSefaz(
  input: {
    chaveAcesso: string;
    cnpj: string;
    protocolo: string;
    justificativa: string;
  },
  secrets: SefazSecrets,
) {
  const chave = input.chaveAcesso.replace(/\D/g, "");
  const uf = ibgeToUfFromChave(chave);
  const ambiente = secrets.ambiente;
  const tpAmb = ambiente === "producao" ? "1" : "2";
  const cOrgao = chave.substring(0, 2);

  const { formatDate } = await import("@brasil-fiscal/core");
  const { cert, xmlSigner, transport } = await loadSefazDeps(secrets);

  const eventoXml = buildCancelamentoXml(
    chave,
    input.cnpj.replace(/\D/g, ""),
    cOrgao,
    tpAmb,
    input.protocolo.trim(),
    input.justificativa.trim(),
    formatDate(new Date()),
  );
  const signedXml = xmlSigner.sign(eventoXml, cert);
  const envelope = wrapEventoSoapEnvelope(signedXml);
  const url = getSefazUrlForNfce(uf, ambiente, "RecepcaoEvento");
  const body = await sendSoap({
    url,
    soapAction: EVENTO_SOAP_ACTION,
    xml: envelope,
    cert,
    transport,
  });
  return parseEventoResponse(body);
}

export async function inutilizarNumeracaoNfceSefaz(
  input: {
    cnpj: string;
    uf: string;
    ano: number;
    serie: number;
    numeroInicial: number;
    numeroFinal: number;
    justificativa: string;
  },
  secrets: SefazSecrets,
) {
  const { UF_CODES } = await import("@brasil-fiscal/core");
  const cUF = UF_CODES[input.uf.trim().toUpperCase() as keyof typeof UF_CODES];
  if (!cUF) throw new Error(`UF desconhecida: ${input.uf}`);

  const ambiente = secrets.ambiente;
  const tpAmb = ambiente === "producao" ? "1" : "2";
  const ano = String(input.ano).slice(-2);

  const { cert, xmlSigner, transport } = await loadSefazDeps(secrets);

  const inutXml = buildInutilizacaoNfceXml(
    input.cnpj.replace(/\D/g, ""),
    cUF,
    tpAmb,
    ano,
    String(input.serie),
    String(input.numeroInicial),
    String(input.numeroFinal),
    input.justificativa.trim(),
  );
  const signedXml = xmlSigner.sign(inutXml, cert);
  const envelope = wrapInutilizacaoSoapEnvelope(signedXml);
  const url = getSefazUrlForNfce(input.uf.trim().toUpperCase(), ambiente, "NFeInutilizacao");
  const body = await sendSoap({
    url,
    soapAction: INUTILIZACAO_SOAP_ACTION,
    xml: envelope,
    cert,
    transport,
  });
  return parseInutilizacaoResponse(body);
}
