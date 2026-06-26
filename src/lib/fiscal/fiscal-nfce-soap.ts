const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";

export const EVENTO_SOAP_ACTION = `${NFE_NAMESPACE}/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento`;
export const INUTILIZACAO_SOAP_ACTION = `${NFE_NAMESPACE}/wsdl/NFeInutilizacao4/nfeInutilizacaoNF`;
export const CONSULTA_SOAP_ACTION = `${NFE_NAMESPACE}/wsdl/NFeConsultaProtocolo4/nfeConsultaNF`;

function extractTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match?.[1] ?? null;
}

export function extractSoapBody(soapXml: string) {
  const match = soapXml.match(
    /<(?:soap12|soapenv|soap):Body[^>]*>([\s\S]*?)<\/(?:soap12|soapenv|soap):Body>/i,
  );
  if (!match) throw new Error("Resposta SOAP invalida: Body nao encontrado");
  return match[1].trim();
}

export function buildConsultaEnvelope(chaveAcesso: string, tpAmb: string) {
  return [
    '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
    "<soap:Body>",
    `<nfeDadosMsg xmlns="${NFE_NAMESPACE}/wsdl/NFeConsultaProtocolo4">`,
    `<consSitNFe versao="4.00" xmlns="${NFE_NAMESPACE}">`,
    `<tpAmb>${tpAmb}</tpAmb>`,
    "<xServ>CONSULTAR</xServ>",
    `<chNFe>${chaveAcesso}</chNFe>`,
    "</consSitNFe>",
    "</nfeDadosMsg>",
    "</soap:Body>",
    "</soap:Envelope>",
  ].join("");
}

export function parseConsultaResponse(body: string) {
  const protNFe = body.match(/<protNFe[^>]*>([\s\S]*?)<\/protNFe>/);
  const source = protNFe?.[1] ?? body;
  const cStat = extractTag(source, "cStat");
  if (!cStat) throw new Error("Resposta de consulta sem cStat");
  return {
    cStat,
    xMotivo: extractTag(source, "xMotivo") ?? "Motivo desconhecido",
    nProt: extractTag(source, "nProt") ?? undefined,
    dhRecbto: extractTag(source, "dhRecbto") ?? undefined,
  };
}

export function buildCancelamentoXml(
  chNFe: string,
  cnpj: string,
  cOrgao: string,
  tpAmb: string,
  nProt: string,
  xJust: string,
  dhEvento: string,
) {
  const id = `ID110111${chNFe}01`;
  return [
    `<evento versao="1.00" xmlns="${NFE_NAMESPACE}">`,
    `<infEvento Id="${id}">`,
    `<cOrgao>${cOrgao}</cOrgao>`,
    `<tpAmb>${tpAmb}</tpAmb>`,
    `<CNPJ>${cnpj}</CNPJ>`,
    `<chNFe>${chNFe}</chNFe>`,
    `<dhEvento>${dhEvento}</dhEvento>`,
    "<tpEvento>110111</tpEvento>",
    "<nSeqEvento>1</nSeqEvento>",
    "<verEvento>1.00</verEvento>",
    "<detEvento versao=\"1.00\">",
    "<descEvento>Cancelamento</descEvento>",
    `<nProt>${nProt}</nProt>`,
    `<xJust>${xJust}</xJust>`,
    "</detEvento>",
    "</infEvento>",
    "</evento>",
  ].join("");
}

export function wrapEventoSoapEnvelope(signedEventoXml: string) {
  const inner = signedEventoXml.replace(/<\?xml[^?]*\?>\s*/g, "");
  return [
    '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
    "<soap:Body>",
    `<nfeDadosMsg xmlns="${NFE_NAMESPACE}/wsdl/NFeRecepcaoEvento4">`,
    `<envEvento versao="1.00" xmlns="${NFE_NAMESPACE}">`,
    "<idLote>1</idLote>",
    inner,
    "</envEvento>",
    "</nfeDadosMsg>",
    "</soap:Body>",
    "</soap:Envelope>",
  ].join("");
}

export function wrapInutilizacaoSoapEnvelope(signedInutXml: string) {
  const inner = signedInutXml.replace(/<\?xml[^?]*\?>\s*/g, "");
  return [
    '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
    "<soap:Body>",
    `<nfeDadosMsg xmlns="${NFE_NAMESPACE}/wsdl/NFeInutilizacao4">`,
    inner,
    "</nfeDadosMsg>",
    "</soap:Body>",
    "</soap:Envelope>",
  ].join("");
}

export function parseEventoResponse(body: string) {
  const retEvento = body.match(/<retEvento[^>]*>([\s\S]*?)<\/retEvento>/);
  const source = retEvento?.[1] ?? body;
  const cStat = extractTag(source, "cStat");
  if (!cStat) throw new Error("Resposta de evento sem cStat");
  return {
    cStat,
    xMotivo: extractTag(source, "xMotivo") ?? "Motivo desconhecido",
    nProt: extractTag(source, "nProt") ?? undefined,
  };
}

export function parseInutilizacaoResponse(body: string) {
  const infInut = body.match(/<infInut[^>]*>([\s\S]*?)<\/infInut>/);
  const source = infInut?.[1] ?? body;
  const cStat = extractTag(source, "cStat");
  if (!cStat) throw new Error("Resposta de inutilizacao sem cStat");
  return {
    cStat,
    xMotivo: extractTag(source, "xMotivo") ?? "Motivo desconhecido",
    nProt: extractTag(source, "nProt") ?? undefined,
  };
}

export function buildInutilizacaoNfceXml(
  cnpj: string,
  cUF: string,
  tpAmb: string,
  ano: string,
  serie: string,
  nNFIni: string,
  nNFFin: string,
  xJust: string,
) {
  const id = `ID${cUF}${ano}${cnpj}65${serie.padStart(3, "0")}${nNFIni.padStart(9, "0")}${nNFFin.padStart(9, "0")}`;
  return [
    `<inutNFe versao="4.00" xmlns="${NFE_NAMESPACE}">`,
    `<infInut Id="${id}">`,
    `<tpAmb>${tpAmb}</tpAmb>`,
    "<xServ>INUTILIZAR</xServ>",
    `<cUF>${cUF}</cUF>`,
    `<ano>${ano}</ano>`,
    `<CNPJ>${cnpj}</CNPJ>`,
    "<mod>65</mod>",
    `<serie>${serie}</serie>`,
    `<nNFIni>${nNFIni}</nNFIni>`,
    `<nNFFin>${nNFFin}</nNFFin>`,
    `<xJust>${xJust}</xJust>`,
    "</infInut>",
    "</inutNFe>",
  ].join("");
}
