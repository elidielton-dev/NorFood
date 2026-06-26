import { getOrderMetadataValue, getOrderNeighborhood } from "@/lib/db";
import {
  getOrderAddressForDisplay,
  getOrderFreeNotes,
  getOrderPhoneForDisplay,
  getOrderReferenceForDisplay,
} from "@/lib/order-display";
import type { VendaDetalhe, VendaDetalheItem, VendaDetalheNota } from "@/lib/venda-detalhe";
import { labelCanal } from "@/lib/relatorios-inteligencia";

function mapCanal(canal: string) {
  if (canal === "balcao") return labelCanal("pdv");
  if (canal === "mesa") return labelCanal("mesas");
  return labelCanal(canal);
}

function mapNota(
  nota: {
    id: string;
    numero: string | null;
    serie: string | null;
    chave_acesso: string | null;
    status: string;
    protocolo_sefaz: string | null;
    codigo_status: number | null;
    motivo_rejeicao: string | null;
    valor: number;
    qrcode_url: string | null;
    created_at: string;
  } | null,
): VendaDetalheNota | null {
  if (!nota) return null;
  return {
    id: nota.id,
    numero: nota.numero,
    serie: nota.serie,
    chaveAcesso: nota.chave_acesso,
    status: nota.status,
    protocolo: nota.protocolo_sefaz,
    codigoStatus: nota.codigo_status,
    motivoRejeicao: nota.motivo_rejeicao,
    valor: Number(nota.valor),
    qrcodeUrl: nota.qrcode_url,
    createdAt: nota.created_at,
  };
}

export async function fetchVendaDetalhe(pedidoId: string): Promise<VendaDetalhe> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [pedidoResult, itensResult, notaResult, entregaResult] = await Promise.all([
    supabaseAdmin.from("pedidos").select("*").eq("id", pedidoId).maybeSingle(),
    supabaseAdmin
      .from("pedido_itens")
      .select(
        "id, pedido_id, produto_id, quantidade, preco_unitario, observacao, produtos(nome, imagem_url, categorias(nome))",
      )
      .eq("pedido_id", pedidoId),
    supabaseAdmin
      .from("notas_fiscais")
      .select("*")
      .eq("pedido_id", pedidoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin.from("entregas").select("bairro, endereco").eq("pedido_id", pedidoId).maybeSingle(),
  ]);

  if (pedidoResult.error) throw pedidoResult.error;
  if (itensResult.error) throw itensResult.error;
  if (notaResult.error) throw notaResult.error;
  if (entregaResult.error) throw entregaResult.error;

  const pedido = pedidoResult.data;
  if (!pedido) throw new Error("Pedido nao encontrado.");

  let mesaLabel: string | null = null;
  if (pedido.mesa_id) {
    const mesaResult = await supabaseAdmin
      .from("mesas")
      .select("numero")
      .eq("id", pedido.mesa_id)
      .maybeSingle();
    if (mesaResult.error) throw mesaResult.error;
    mesaLabel = mesaResult.data ? `Mesa ${mesaResult.data.numero}` : "Mesa";
  }

  let clienteNome = getOrderMetadataValue(pedido.observacoes, "cliente");
  let clienteTelefone = getOrderPhoneForDisplay(null, pedido.observacoes);
  if (pedido.cliente_id) {
    const clienteResult = await supabaseAdmin
      .from("profiles")
      .select("nome, telefone")
      .eq("id", pedido.cliente_id)
      .maybeSingle();
    if (clienteResult.error) throw clienteResult.error;
    clienteNome = clienteResult.data?.nome ?? clienteNome;
    clienteTelefone = getOrderPhoneForDisplay(clienteResult.data?.telefone ?? null, pedido.observacoes);
  }
  if (!clienteNome) {
    if (pedido.canal === "mesa") clienteNome = "Cliente da mesa";
    else if (pedido.canal === "balcao") clienteNome = "Cliente do balcao";
    else clienteNome = "Cliente";
  }

  const itens: VendaDetalheItem[] = (itensResult.data ?? []).map((item) => {
    const produto = item.produtos as {
      nome: string;
      imagem_url: string | null;
      categorias: { nome: string } | null;
    } | null;
    return {
      id: item.id,
      nome: produto?.nome ?? "Produto",
      categoria: produto?.categorias?.nome ?? undefined,
      quantidade: item.quantidade,
      precoUnitario: Number(item.preco_unitario),
      observacao: item.observacao,
      imagemUrl: produto?.imagem_url,
    };
  });

  const trocoMeta = getOrderMetadataValue(pedido.observacoes, "troco_para");
  const trocoPara =
    pedido.troco_para ??
    (trocoMeta && !Number.isNaN(Number(trocoMeta)) ? Number(trocoMeta) : null);

  const bairro = getOrderNeighborhood(pedido, entregaResult.data?.bairro ?? null);
  const endereco = getOrderAddressForDisplay(
    pedido.endereco,
    pedido.observacoes,
    entregaResult.data?.endereco,
  );
  const referencia = getOrderReferenceForDisplay(pedido.observacoes);
  const observacoesCliente = getOrderFreeNotes(pedido.observacoes);

  return {
    id: pedido.id,
    numero: pedido.numero,
    data: pedido.created_at,
    canal: mapCanal(pedido.canal),
    status: pedido.status,
    formaPagamento: pedido.forma_pagamento ?? "dinheiro",
    clienteNome,
    clienteTelefone,
    mesa: mesaLabel,
    bairro,
    endereco,
    subtotal: Number(pedido.subtotal),
    desconto: Number(pedido.desconto),
    taxaEntrega: Number(pedido.taxa_entrega),
    total: Number(pedido.total),
    trocoPara,
    observacoes: observacoesCliente,
    referencia,
    itens,
    notaFiscal: mapNota(notaResult.data),
  };
}
