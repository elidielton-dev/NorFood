import { tag, tagGroup } from "@brasil-fiscal/core";
import { onlyDigits } from "@/lib/fiscal/fiscal-validation";

export type RespTecConfig = {
  cnpj: string;
  contato: string;
  email: string;
  fone: string;
};

export function buildInfRespTecXml(config: RespTecConfig) {
  const fone = onlyDigits(config.fone);
  if (fone.length < 10) {
    throw new Error("Telefone do responsavel tecnico invalido (minimo 10 digitos).");
  }

  return tagGroup(
    "infRespTec",
    tag("CNPJ", onlyDigits(config.cnpj)) +
      tag("xContato", config.contato.slice(0, 60)) +
      tag("email", config.email.slice(0, 60)) +
      tag("fone", fone),
  );
}

export async function createNfceXmlBuilder(respTecXml: string) {
  const { DefaultXmlBuilder } = await import("@brasil-fiscal/nfe");
  const Base = DefaultXmlBuilder as {
    new (): { build: (nfe: unknown) => string };
  };

  return class NfceXmlBuilderWithRespTec extends Base {
    build(nfe: unknown) {
      const xml = super.build(nfe);
      if (!respTecXml) return xml;
      return xml.replace("</infNFe>", `${respTecXml}</infNFe>`);
    }
  };
}

export function resolveRespTecFromEnv(empresa: {
  cnpj: string;
  razaoSocial: string;
  email: string;
  telefone: string;
}): RespTecConfig {
  return {
    cnpj: process.env.FISCAL_RESP_TEC_CNPJ?.trim() || empresa.cnpj,
    contato:
      process.env.FISCAL_RESP_TEC_CONTATO?.trim() ||
      process.env.FISCAL_RESP_TEC_NOME?.trim() ||
      "Suporte Abelha e Mel",
    email: process.env.FISCAL_RESP_TEC_EMAIL?.trim() || empresa.email,
    fone: process.env.FISCAL_RESP_TEC_FONE?.trim() || empresa.telefone || "81999999999",
  };
}
