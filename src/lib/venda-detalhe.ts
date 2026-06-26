import { labelCanal, type RelatorioPedido } from "@/lib/relatorios-inteligencia";

export type VendaDetalheItem = {
  id: string;
  nome: string;
  categoria?: string;
  quantidade: number;
  precoUnitario: number;
  observacao?: string | null;
  imagemUrl?: string | null;
};

export type VendaDetalheNota = {
  id: string;
  numero: string | null;
  serie: string | null;
  chaveAcesso: string | null;
  status: string;
  protocolo: string | null;
  codigoStatus: number | null;
  motivoRejeicao: string | null;
  valor: number;
  qrcodeUrl: string | null;
  createdAt: string;
};

export type VendaDetalhe = {
  id: string;
  numero: number;
  data: string;
  canal: string;
  status: string;
  formaPagamento: string;
  clienteNome: string;
  clienteTelefone?: string | null;
  mesa?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  subtotal: number;
  desconto: number;
  taxaEntrega: number;
  total: number;
  trocoPara?: number | null;
  observacoes?: string | null;
  referencia?: string | null;
  itens: VendaDetalheItem[];
  notaFiscal?: VendaDetalheNota | null;
};

export function labelFormaPagamento(forma: string | null | undefined) {
  const map: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "Pix",
    cartao: "Cartao",
    credito: "Credito",
    debito: "Debito",
    online: "Online",
    vale: "Vale",
  };
  if (!forma) return "Nao informado";
  return map[forma] ?? forma;
}

export function labelStatusVenda(status: string) {
  const map: Record<string, string> = {
    concluido: "Concluido",
    cancelado: "Cancelado",
    em_preparo: "Em preparo",
    entregue: "Entregue",
    aberto: "Aberto",
    pronto: "Pronto",
    em_entrega: "Em entrega",
    autorizada: "Autorizada",
    autorizada_homologacao: "Autorizada",
    rejeitada: "Rejeitada",
    pendente: "Pendente",
  };
  return map[status] ?? status;
}

export function statusVendaTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "info" {
  if (status === "entregue" || status === "concluido" || status === "autorizada" || status === "autorizada_homologacao") return "success";
  if (status === "cancelado" || status === "cancelada") return "warning";
  if (status === "rejeitada") return "danger";
  if (status === "em_preparo" || status === "pronto" || status === "em_entrega") return "info";
  return "neutral";
}

export function relatorioPedidoToVendaDetalhe(pedido: RelatorioPedido): VendaDetalhe {
  return {
    id: pedido.id,
    numero: pedido.numero,
    data: pedido.data,
    canal: labelCanal(pedido.canal),
    status: pedido.status,
    formaPagamento: pedido.pagamento,
    clienteNome: pedido.clienteNome,
    mesa: pedido.mesa,
    bairro: pedido.bairro || null,
    subtotal: pedido.subtotal,
    desconto: Math.max(0, pedido.subtotal + pedido.taxaEntrega - pedido.total),
    taxaEntrega: pedido.taxaEntrega,
    total: pedido.total,
    itens: pedido.itens.map((item, index) => ({
      id: `${pedido.id}-${item.produtoId}-${index}`,
      nome: item.nome,
      categoria: item.categoria,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
    })),
    notaFiscal: null,
  };
}
