import type { FiscalAmbiente } from "@/lib/fiscal/fiscal-types";

export type SefazEmissionResult = {
  autorizada: boolean;
  protocolo?: string;
  chaveAcesso?: string;
  codigoStatus: string;
  motivo: string;
  xmlProtocolado?: string;
  qrcodeUrl?: string;
};

export type SefazConsultaResult = {
  sucesso: boolean;
  codigoStatus: string;
  motivo: string;
  protocolo?: string;
};

export type SefazEventoResult = {
  sucesso: boolean;
  codigoStatus: string;
  motivo: string;
  protocolo?: string;
};

export type SefazSecrets = {
  pfxBuffer: Buffer;
  certPassword: string;
  cscId: string;
  cscToken: string;
  uf: string;
  ambiente: FiscalAmbiente;
  respTecEmpresa: {
    cnpj: string;
    razaoSocial: string;
    email: string;
    telefone: string;
  };
};
