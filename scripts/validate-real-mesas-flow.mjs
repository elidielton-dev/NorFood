import { adminClient, ensureCategory, ensureProduct } from "./supabase-real-tracking-tools.mjs";

const marker = "SEED_VALIDATE_MESAS_REAL";
const mesaNumero = 998;
const mesaToken = "seed-mesa-real-998";

async function cleanupValidationRows() {
  const { data: orders, error: ordersError } = await adminClient
    .from("pedidos")
    .select("id")
    .ilike("observacoes", `%${marker}%`);
  if (ordersError) throw ordersError;

  const orderIds = (orders ?? []).map((item) => item.id);
  if (orderIds.length) {
    const { error: itemsError } = await adminClient.from("pedido_itens").delete().in("pedido_id", orderIds);
    if (itemsError) throw itemsError;

    const { error: financeError } = await adminClient
      .from("lancamentos_financeiros")
      .delete()
      .in("pedido_id", orderIds);
    if (financeError) throw financeError;

    const { error: ordersDeleteError } = await adminClient.from("pedidos").delete().in("id", orderIds);
    if (ordersDeleteError) throw ordersDeleteError;
  }

  const { error: mesaDeleteError } = await adminClient.from("mesas").delete().eq("qrcode_token", mesaToken);
  if (mesaDeleteError) throw mesaDeleteError;
}

async function ensureValidationMesa() {
  const { data: existing, error: existingError } = await adminClient
    .from("mesas")
    .select("*")
    .eq("qrcode_token", mesaToken)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: mesa, error: insertError } = await adminClient
    .from("mesas")
    .insert({
      numero: mesaNumero,
      capacidade: 4,
      status: "livre",
      qrcode_token: mesaToken,
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return mesa;
}

async function main() {
  await cleanupValidationRows();

  const categoriaId = await ensureCategory("Seed Mesas Real");
  const produtoId = await ensureProduct({
    categoriaId,
    nome: "Torta Mesa Validacao Real",
    preco: 24.9,
    destaque: false,
  });

  const mesa = await ensureValidationMesa();
  const subtotal = 49.8;

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
    .select("*")
    .single();
  if (pedidoError) throw pedidoError;

  const { error: itemError } = await adminClient.from("pedido_itens").insert([
    {
      pedido_id: pedido.id,
      produto_id: produtoId,
      quantidade: 2,
      preco_unitario: 24.9,
    },
  ]);
  if (itemError) throw itemError;

  const { error: mesaOccupyError } = await adminClient
    .from("mesas")
    .update({ status: "ocupada" })
    .eq("id", mesa.id);
  if (mesaOccupyError) throw mesaOccupyError;

  const { error: financeError } = await adminClient.from("lancamentos_financeiros").insert({
    tipo: "entrada",
    descricao: `Mesa #${mesa.numero} Pedido #${pedido.numero}`,
    categoria: "Vendas mesa",
    valor: subtotal,
    forma: "pix",
    pedido_id: pedido.id,
  });
  if (financeError) throw financeError;

  const { data: mesaOcupada, error: mesaOcupadaError } = await adminClient
    .from("mesas")
    .select("id,numero,status")
    .eq("id", mesa.id)
    .single();
  if (mesaOcupadaError) throw mesaOcupadaError;

  const { data: pedidoAberto, error: pedidoAbertoError } = await adminClient
    .from("pedidos")
    .select("id,numero,status,mesa_id,total,forma_pagamento")
    .eq("id", pedido.id)
    .single();
  if (pedidoAbertoError) throw pedidoAbertoError;

  const { data: financeiroAberto, error: financeiroAbertoError } = await adminClient
    .from("lancamentos_financeiros")
    .select("id,valor,forma,pedido_id")
    .eq("pedido_id", pedido.id)
    .limit(1)
    .maybeSingle();
  if (financeiroAbertoError) throw financeiroAbertoError;

  if (mesaOcupada.status !== "ocupada") {
    throw new Error(`Mesa ${mesa.numero} nao ficou ocupada.`);
  }
  if (pedidoAberto.status !== "aberto") {
    throw new Error(`Pedido da mesa nao ficou em aberto. Status atual: ${pedidoAberto.status}`);
  }
  if (!financeiroAberto || Number(financeiroAberto.valor) !== subtotal) {
    throw new Error("Lancamento financeiro da mesa nao foi registrado corretamente.");
  }

  const { error: pedidoFecharError } = await adminClient
    .from("pedidos")
    .update({ status: "entregue" })
    .eq("id", pedido.id);
  if (pedidoFecharError) throw pedidoFecharError;

  const { error: mesaLiberarError } = await adminClient
    .from("mesas")
    .update({ status: "livre" })
    .eq("id", mesa.id);
  if (mesaLiberarError) throw mesaLiberarError;

  const { data: mesaLivre, error: mesaLivreError } = await adminClient
    .from("mesas")
    .select("id,numero,status")
    .eq("id", mesa.id)
    .single();
  if (mesaLivreError) throw mesaLivreError;

  const { data: pedidoFechado, error: pedidoFechadoError } = await adminClient
    .from("pedidos")
    .select("id,numero,status")
    .eq("id", pedido.id)
    .single();
  if (pedidoFechadoError) throw pedidoFechadoError;

  if (mesaLivre.status !== "livre") {
    throw new Error(`Mesa ${mesa.numero} nao voltou para livre.`);
  }
  if (pedidoFechado.status !== "entregue") {
    throw new Error(`Pedido da mesa nao foi finalizado. Status atual: ${pedidoFechado.status}`);
  }

  console.log(
    JSON.stringify(
      {
        marker,
        mesaAntesFechamento: mesaOcupada,
        pedidoAntesFechamento: pedidoAberto,
        financeiroAberto,
        mesaDepoisFechamento: mesaLivre,
        pedidoDepoisFechamento: pedidoFechado,
      },
      null,
      2,
    ),
  );
  console.log("VALIDACAO_MESAS_REAL_OK");

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
