export type FiscalAmbiente = "homologacao" | "producao";

export type FiscalCrt = 1 | 2 | 3;

export type EmpresaFiscal = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  inscricaoEstadual: string;
  inscricaoMunicipal: string;
  crt: FiscalCrt;
  cnae: string;
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
};

export type FiscalConfigPublic = {
  nfceHabilitada: boolean;
  nfeHabilitada: boolean;
  ambiente: FiscalAmbiente;
  serieNfce: number;
  proximoNumeroNfce: number;
  cscId: string;
  cscTokenConfigured: boolean;
  emitirAutomaticoPdv: boolean;
  emitirAutomaticoDelivery: boolean;
  emitirAutomaticoMesas: boolean;
  provider: string;
  certificado: {
    instalado: boolean;
    titular: string | null;
    cnpj: string | null;
    validoAte: string | null;
    instaladoEm: string | null;
    diasRestantes: number | null;
  };
};

export type FiscalSettings = {
  empresa: EmpresaFiscal;
  config: FiscalConfigPublic;
  readiness: FiscalReadiness;
};

export type FiscalReadiness = {
  empresaCompleta: boolean;
  certificadoValido: boolean;
  cscConfigurado: boolean;
  sefazDireto: boolean;
  encryptionKey: boolean;
  camposPendentes: string[];
};

export type NotaFiscalRow = {
  id: string;
  pedido_id: string | null;
  tipo: string;
  status: string;
  chave_acesso: string | null;
  numero: string | null;
  serie: string | null;
  valor: number;
  xml_url: string | null;
  danfe_url: string | null;
  qrcode_url: string | null;
  protocolo_sefaz: string | null;
  codigo_status: number | null;
  motivo_rejeicao: string | null;
  consumidor_cpf: string | null;
  xml_enviado_contabilidade: boolean;
  xml_autorizado?: string | null;
  created_at: string;
  updated_at: string;
};

export const CRT_OPTIONS: Array<{ value: FiscalCrt; label: string }> = [
  { value: 1, label: "1 — Simples Nacional" },
  { value: 2, label: "2 — Simples (excesso sublimite)" },
  { value: 3, label: "3 — Regime Normal" },
];

export const UF_OPTIONS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export const ORIGEM_MERCADORIA_OPTIONS = [
  { value: 0, label: "0 — Nacional" },
  { value: 1, label: "1 — Estrangeira (importação direta)" },
  { value: 2, label: "2 — Estrangeira (adquirida no mercado interno)" },
] as const;
