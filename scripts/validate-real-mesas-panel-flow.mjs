import { adminClient, ensureCategory, ensureProduct } from "./supabase-real-tracking-tools.mjs";

const marker = "SEED_VALIDATE_MESAS_PANEL_FLOW";
const mesaNumero = 1;

async function cleanupValidationRows() {
  const { data: orders, error: ordersError } = await adminClient
    .from("pedidos")
    .select("id,mesa_id")
    .ilike("observacoes", `%${marker}%`);
  if (ordersError) throw ordersError;

  const orderIds = (orders ?? []).map((item) => item.id);
  if (orderIds.length) {
    const { error: itemsError } = await adminClient
      .from("pedido_itens")
      .delete()
      .in("pedido_id", orderIds);
    if (itemsError) throw itemsError;

    const { error: financeError } = await adminClient
      .from("lancamentos_financeiros")
      .delete()
      .in("pedido_id", orderIds);
    if (financeError) throw financeError;

    const { error: ordersDeleteError } = await adminClient
      .from("pedidos")
      .delete()
      .in("id", orderIds);
    if (ordersDeleteError) throw ordersDeleteError;
  }

  const { data: mesa, error: mesaError } = await adminClient
    .from("mesas")
    .select("id")
    .eq("numero", mesaNumero)
    .maybeSingle();
  if (mesaError) throw mesaError;

  if (mesa?.id) {
    const { error: mesaResetError } = await adminClient
      .from("mesas")
      .update({ status: "livre" })
      .eq("id", mesa.id);
    if (mesaResetError) throw mesaResetError;
  }
}

async function main() {
  await cleanupValidationRows();

  const { data: mesa, error: mesaError } = await adminClient
    .from("mesas")
    .select("id,numero,status")
    .eq("numero", mesaNumero)
    .single();
  if (mesaError)
    throw new Error(`Mesa ${mesaNumero} nao encontrada. Rode primeiro o seed das mesas.`);

  const categoriaId = await ensureCategory("Seed Mesas Painel");
  const produtoId = await ensureProduct({
    categoriaId,
    nome: "Brownie Painel Mesa",
    preco: 18.5,
    destaque: false,
  });

  const subtotal = 37;
  const { data: pedido, error: pedidoError } = await adminClient
    .from("pedidos")
    .insert({
      canal: "mesa",
      mesa_id: mesa.id,
      status: "aberto",
      subtotal,
      desconto: 0,
      taxa_entrega: 0,
      total: subtotal,
      forma_pagamento: "pix",
      observacoes: `${marker}; mesa=${mesa.numero}`,
      endereco: null,
    })
    .select("id,numero,status,mesa_id,total,forma_pagamento")
    .single();
  if (pedidoError) throw pedidoError;

  const { error: itemError } = await adminClient.from("pedido_itens").insert([
    {
      pedido_id: pedido.id,
      produto_id: produtoId,
      quantidade: 2,
      preco_unitario: 18.5,
    },
  ]);
  if (itemError) throw itemError;

  const { error: ocuparMesaError } = await adminClient
    .from("mesas")
    .update({ status: "ocupada" })
    .eq("id", mesa.id);
  if (ocuparMesaError) throw ocuparMesaError;

  const { error: financeiroError } = await adminClient.from("lancamentos_financeiros").insert({
    tipo: "entrada",
    descricao: `Mesa #${mesa.numero} Pedido #${pedido.numero}`,
    categoria: "Vendas mesa",
    valor: subtotal,
    forma: "pix",
    pedido_id: pedido.id,
  });
  if (financeiroError) throw financeiroError;

  const { data: mesaOcupada, error: mesaOcupadaError } = await adminClient
    .from("mesas")
    .select("id,numero,status")
    .eq("id", mesa.id)
    .single();
  if (mesaOcupadaError) throw mesaOcupadaError;

  if (mesaOcupada.status !== "ocupada") {
    throw new Error(`Mesa ${mesa.numero} nao ficou ocupada apos abertura.`);
  }

  const { error: fecharPedidoError } = await adminClient
    .from("pedidos")
    .update({ status: "entregue" })
    .eq("id", pedido.id);
  if (fecharPedidoError) throw fecharPedidoError;

  const { error: liberarMesaError } = await adminClient
    .from("mesas")
    .update({ status: "livre" })
    .eq("id", mesa.id);
  if (liberarMesaError) throw liberarMesaError;

  const { data: mesaLivre, error: mesaLivreError } = await adminClient
    .from("mesas")
    .select("id,numero,status")
    .eq("id", mesa.id)
    .single();
  if (mesaLivreError) throw mesaLivreError;

  const { data: pedidoEntregue, error: pedidoEntregueError } = await adminClient
    .from("pedidos")
    .select("id,numero,status")
    .eq("id", pedido.id)
    .single();
  if (pedidoEntregueError) throw pedidoEntregueError;

  if (mesaLivre.status !== "livre") {
    throw new Error(`Mesa ${mesa.numero} nao voltou para livre apos fechamento.`);
  }
  if (pedidoEntregue.status !== "entregue") {
    throw new Error(`Pedido ${pedido.numero} nao foi finalizado corretamente.`);
  }

  console.log(
    JSON.stringify(
      {
        mesaAntesPagamento: mesaOcupada,
        pedidoAberto: pedido,
        mesaDepoisPagamento: mesaLivre,
        pedidoFinalizado: pedidoEntregue,
      },
      null,
      2,
    ),
  );
  console.log("VALIDACAO_MESAS_PANEL_REAL_OK");

  await cleanupValidationRows();
}

main().catch(async (error) => {
  try {
    await cleanupValidationRows();
  } catch {
    // noop
  }
  console.error(error);
  process.exit(1);
});
