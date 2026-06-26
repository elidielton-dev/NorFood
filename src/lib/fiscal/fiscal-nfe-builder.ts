import type { NFeProps } from "@brasil-fiscal/nfe";
import type { EmpresaFiscal, FiscalAmbiente } from "@/lib/fiscal/fiscal-types";
import { onlyDigits } from "@/lib/fiscal/fiscal-validation";

export function mapFormaPagamentoSefaz(forma: string | null | undefined) {
  const value = (forma ?? "").toLowerCase();
  if (value.includes("pix")) return "17";
  if (value.includes("credito") || value.includes("cartao_credito")) return "03";
  if (value.includes("debito") || value.includes("cartao_debito")) return "04";
  if (value.includes("dinheiro")) return "01";
  return "99";
}

export type NfceItemInput = {
  produtoId: string;
  nome: string;
  ncm: string;
  cfop: string;
  csosn: string;
  origem: number;
  gtin: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
};

export type BuildNfceInput = {
  empresa: EmpresaFiscal;
  ambiente: FiscalAmbiente;
  serie: number;
  numero: number;
  itens: NfceItemInput[];
  total: number;
  taxaEntrega?: number;
  formaPagamento: string | null;
  consumidorCpf?: string;
  homologacao?: boolean;
};

function empresaEndereco(empresa: EmpresaFiscal) {
  return {
    logradouro: empresa.logradouro.trim(),
    numero: empresa.numero.trim(),
    complemento: empresa.complemento.trim() || undefined,
    bairro: empresa.bairro.trim(),
    codigoMunicipio: onlyDigits(empresa.codigoMunicipioIbge),
    municipio: empresa.municipio.trim(),
    uf: empresa.uf.trim().toUpperCase(),
    cep: onlyDigits(empresa.cep),
    telefone: onlyDigits(empresa.telefone) || undefined,
  };
}

function defaultPisCofins() {
  return {
    pis: { cst: "07" as const },
    cofins: { cst: "07" as const },
  };
}

function normalizeUnidade(unidade: string | null | undefined) {
  const raw = (unidade ?? "UN").trim().toUpperCase();
  const aliases: Record<string, string> = {
    UNIDADE: "UN",
    UN: "UN",
    PC: "PC",
    PECA: "PC",
    L: "L",
    LT: "L",
    LITRO: "L",
    ML: "ML",
    KG: "KG",
    CX: "CX",
  };
  return aliases[raw] ?? (raw.length <= 6 ? raw : "UN");
}

export function buildNfceNFeProps(input: BuildNfceInput): NFeProps {
  const uf = input.empresa.uf.trim().toUpperCase() || "PE";
  const tpAmb = input.ambiente === "producao" ? 1 : 2;
  const isHomolog = input.homologacao ?? input.ambiente === "homologacao";

  const produtos = input.itens.map((item, index) => {
    const valorTotal = Number((item.quantidade * item.precoUnitario).toFixed(2));
    const tax = defaultPisCofins();
    const descricao =
      isHomolog && index === 0
        ? "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
        : item.nome.slice(0, 120);
    return {
      numero: index + 1,
      codigo: item.produtoId.slice(0, 60),
      descricao,
      ncm: onlyDigits(item.ncm),
      cfop: item.cfop || "5102",
      unidade: normalizeUnidade(item.unidade),
      quantidade: item.quantidade,
      valorUnitario: item.precoUnitario,
      valorTotal,
      ean: item.gtin && item.gtin !== "SEM GTIN" ? item.gtin : undefined,
      eanTributavel: item.gtin && item.gtin !== "SEM GTIN" ? item.gtin : undefined,
      icms: {
        origem: (item.origem ?? 0) as 0,
        csosn: item.csosn || "102",
      },
      ...tax,
    };
  });

  const taxaEntrega = Number((input.taxaEntrega ?? 0).toFixed(2));
  if (taxaEntrega > 0) {
    const refNcm = onlyDigits(input.itens[0]?.ncm ?? "22021000");
    produtos.push({
      numero: produtos.length + 1,
      codigo: "TAXA-ENTREGA",
      descricao: "Taxa de entrega",
      ncm: refNcm,
      cfop: input.itens[0]?.cfop || "5102",
      unidade: "UN",
      quantidade: 1,
      valorUnitario: taxaEntrega,
      valorTotal: taxaEntrega,
      icms: { origem: 0 as const, csosn: input.itens[0]?.csosn || "102" },
      ...defaultPisCofins(),
    });
  }

  const destinatario =
    input.consumidorCpf?.trim()
      ? {
          cpf: onlyDigits(input.consumidorCpf),
          nome: "CONSUMIDOR",
          indicadorIE: 9 as const,
          endereco: empresaEndereco(input.empresa),
        }
      : isHomolog
        ? {
            nome: "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL",
            indicadorIE: 9 as const,
          }
        : undefined;

  return {
    identificacao: {
      naturezaOperacao: "Venda de mercadoria",
      tipoOperacao: 1,
      destinoOperacao: 1,
      finalidade: 1,
      consumidorFinal: 1,
      presencaComprador: 1,
      uf,
      municipio: onlyDigits(input.empresa.codigoMunicipioIbge),
      serie: input.serie,
      numero: input.numero,
      dataEmissao: new Date(),
      tipoEmissao: 1,
      tipoImpressao: 4,
      ambiente: tpAmb,
      modelo: "65",
    },
    emitente: {
      cnpj: onlyDigits(input.empresa.cnpj),
      razaoSocial: input.empresa.razaoSocial.trim(),
      nomeFantasia: input.empresa.nomeFantasia.trim() || input.empresa.razaoSocial.trim(),
      inscricaoEstadual: input.empresa.inscricaoEstadual.trim(),
      inscricaoMunicipal: input.empresa.inscricaoMunicipal.trim() || undefined,
      regimeTributario: input.empresa.crt,
      endereco: empresaEndereco(input.empresa),
    },
    destinatario,
    produtos,
    transporte: { modalidadeFrete: 9 },
    pagamento: {
      pagamentos: [
        {
          formaPagamento: mapFormaPagamentoSefaz(input.formaPagamento),
          valor: Number(input.total.toFixed(2)),
        },
      ],
    },
    informacoesComplementares: isHomolog
      ? "Documento emitido em ambiente de homologacao sem valor fiscal."
      : undefined,
  };
}
