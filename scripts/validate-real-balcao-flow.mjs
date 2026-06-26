import { adminClient, ensureCategory, ensureProduct } from "./supabase-real-tracking-tools.mjs";

const marker = "SEED_VALIDATE_BALCAO_FLOW";

async function cleanupValidationRows() {
  const { data: orders, error: ordersError } = await adminClient
    .from("pedidos")
    .select("id")
    .ilike("observacoes", `%${marker}%`);
  if (ordersError) throw ordersError;

  const orderIds = (orders ?? []).map((item) => item.id);
  if (!orderIds.length) return;

  await adminClient.from("pedido_itens").delete().in("pedido_id", orderIds);
  await adminClient.from("lancamentos_financeiros").delete().in("pedido_id", orderIds);
  await adminClient.from("pedidos").delete().in("id", orderIds);
}

async function main() {
  await cleanupValidationRows();

  const categoriaId = await ensureCategory("Seed Balcao Validacao");
  const produtoId = await ensureProduct({
    categoriaId,
    nome: "Brigadeiro Balcao Validacao",
    preco: 6.5,
    destaque: false,
  });

  const subtotal = 13;
  const { data: pedido, error: pedidoError } = await adminClient
    .from("pedidos")
    .insert({
      canal: "balcao",
      status: "aberto",
      subtotal,
      desconto: 0,
      taxa_entrega: 0,
      total: subtotal,
      forma_pagamento: "pix",
      observacoes: `${marker}; validacao balcao`,
    })
    .select("id,numero,status,canal,total")
    .single();
  if (pedidoError) throw pedidoError;

  const { error: itemError } = await adminClient.from("pedido_itens").insert({
    pedido_id: pedido.id,
    produto_id: produtoId,
    quantidade: 2,
    preco_unitario: 6.5,
  });
  if (itemError) throw itemError;

  const { error: financeError } = await adminClient.from("lancamentos_financeiros").insert({
    tipo: "entrada",
    descricao: `Balcão Pedido #${pedido.numero}`,
    categoria: "Vendas balcão",
    valor: subtotal,
    forma: "pix",
    pedido_id: pedido.id,
  });
  if (financeError) throw financeError;

  const { data: loaded, error: loadedError } = await adminClient
    .from("pedidos")
    .select("id,canal,status,total,pedido_itens(id,quantidade,preco_unitario)")
    .eq("id", pedido.id)
    .single();
  if (loadedError) throw loadedError;

  if (loaded.canal !== "balcao") throw new Error("Canal do pedido de balcao invalido.");
  if (loaded.status !== "aberto") throw new Error("Status inicial do balcao invalido.");
  if (Number(loaded.total) !== subtotal) throw new Error("Total do balcao invalido.");
  if ((loaded.pedido_itens ?? []).length !== 1) throw new Error("Itens do balcao invalidos.");

  console.log("VALIDACAO_BALCAO_REAL_OK");
  await cleanupValidationRows();
}

main().catch((error) => {
  console.error("Falha na validacao do balcao:");
  console.error(error?.message ?? error);
  process.exit(1);
});
