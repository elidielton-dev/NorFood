/**
 * E2E fiscal: 3 vendas (mesa, balcão, delivery) com NFC-e + cancelamento + inutilização.
 * Uso: npm run nfce:tres-canais
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const MARKER = "NFCE_E2E_TRES_CANAIS";
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatorios no .env");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type PedidoRef = { id: string; numero: number; canal: string };

async function ensureFiscalAutoEmit() {
  const { data, error } = await sb
    .from("fiscal_config")
    .select("*")
    .eq("id", "default")
    .single();
  if (error) throw error;

  const { error: upd } = await sb
    .from("fiscal_config")
    .update({
      nfce_habilitada: true,
      emitir_automatico_pdv: true,
      emitir_automatico_delivery: true,
      emitir_automatico_mesas: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (upd) throw upd;

  return data;
}

async function findProductWithNcm() {
  const { data, error } = await sb
    .from("produtos")
    .select("id, nome, preco, ncm")
    .not("ncm", "is", null)
    .neq("ncm", "")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.ncm) throw new Error("Nenhum produto com NCM cadastrado.");
  return data;
}

async function insertItem(pedidoId: string, produto: { id: string; preco: number }) {
  const preco = Number(produto.preco) || 3.5;
  const { error } = await sb.from("pedido_itens").insert({
    pedido_id: pedidoId,
    produto_id: produto.id,
    quantidade: 1,
    preco_unitario: preco,
  });
  if (error) throw error;
  return preco;
}

async function kdsAdvanceToEntregue(pedidoId: string, isDelivery: boolean) {
  const steps = isDelivery
    ? (["em_preparo", "pronto", "em_entrega", "entregue"] as const)
    : (["em_preparo", "pronto", "em_entrega", "entregue"] as const);

  for (const status of steps) {
    const { error } = await sb.from("pedidos").update({ status }).eq("id", pedidoId);
    if (error) throw error;
  }

  if (isDelivery) {
    const deliveredAt = new Date().toISOString();
    await sb
      .from("entregas")
      .update({ status: "entregue", entregue_em: deliveredAt })
      .eq("pedido_id", pedidoId);
    await sb.from("rotas_entrega").update({ status: "entregue" }).eq("pedido_id", pedidoId);
  }
}

async function emitForPedido(pedido: PedidoRef) {
  const { tryAutoEmitNfceForPedido, emitNfceForPedido } = await import(
    "../src/lib/api/fiscal.server.ts"
  );

  const canal =
    pedido.canal === "mesa" ? "mesas" : pedido.canal === "balcao" ? "balcao" : "delivery";

  let result = await tryAutoEmitNfceForPedido(pedido.id, canal);
  if (!result) {
    console.log(`  auto-emissao nao disparou (${canal}); emitindo manualmente...`);
    result = await emitNfceForPedido(pedido.id);
  }
  return result;
}

async function createBalcaoPedido(produto: { id: string; preco: number }) {
  const preco = Number(produto.preco) || 3.5;
  const { data: pedido, error } = await sb
    .from("pedidos")
    .insert({
      canal: "balcao",
      status: "aberto",
      subtotal: preco,
      desconto: 0,
      taxa_entrega: 0,
      total: preco,
      forma_pagamento: "dinheiro",
      observacoes: `${MARKER} balcao`,
    })
    .select("id, numero, canal")
    .single();
  if (error) throw error;

  await insertItem(pedido.id, produto);
  await sb.from("lancamentos_financeiros").insert({
    tipo: "entrada",
    descricao: `Balcão Pedido #${pedido.numero}`,
    categoria: "Vendas balcão",
    valor: preco,
    forma: "dinheiro",
    pedido_id: pedido.id,
  });

  console.log(`Balcão #${pedido.numero}: aberto → KDS → entregue`);
  await kdsAdvanceToEntregue(pedido.id, false);
  return pedido as PedidoRef;
}

async function createMesaPedido(produto: { id: string; preco: number }) {
  const { data: mesa, error: mesaError } = await sb
    .from("mesas")
    .select("id, numero, status")
    .eq("status", "livre")
    .order("numero")
    .limit(1)
    .maybeSingle();
  if (mesaError) throw mesaError;
  if (!mesa) throw new Error("Nenhuma mesa livre disponivel.");

  const preco = Number(produto.preco) || 3.5;
  const { data: pedido, error } = await sb
    .from("pedidos")
    .insert({
      canal: "mesa",
      mesa_id: mesa.id,
      status: "aberto",
      subtotal: preco,
      desconto: 0,
      taxa_entrega: 0,
      total: preco,
      forma_pagamento: "dinheiro",
      observacoes: `${MARKER} mesa ${mesa.numero}`,
    })
    .select("id, numero, canal")
    .single();
  if (error) throw error;

  await insertItem(pedido.id, produto);
  await sb.from("mesas").update({ status: "ocupada" }).eq("id", mesa.id);
  await sb.from("lancamentos_financeiros").insert({
    tipo: "entrada",
    descricao: `Mesa #${mesa.numero} Pedido #${pedido.numero}`,
    categoria: "Vendas mesa",
    valor: preco,
    forma: "dinheiro",
    pedido_id: pedido.id,
  });

  console.log(`Mesa ${mesa.numero} / pedido #${pedido.numero}: finalizando conta`);
  await sb.from("pedidos").update({ status: "entregue" }).eq("id", pedido.id);
  await sb.from("mesas").update({ status: "livre" }).eq("id", mesa.id);

  return pedido as PedidoRef;
}

async function createDeliveryPedido(produto: { id: string; preco: number }) {
  const preco = Number(produto.preco) || 3.5;
  const taxa = 5;
  const total = preco + taxa;

  const { data: pedido, error } = await sb
    .from("pedidos")
    .insert({
      canal: "delivery",
      status: "aberto",
      subtotal: preco,
      desconto: 0,
      taxa_entrega: taxa,
      total,
      forma_pagamento: "dinheiro",
      endereco: "Rua Jose Estrela, 21",
      observacoes: `${MARKER} delivery Centro`,
      latitude_cliente: -8.0874,
      longitude_cliente: -37.6392,
    })
    .select("id, numero, canal")
    .single();
  if (error) throw error;

  await insertItem(pedido.id, produto);
  await sb.from("entregas").insert({
    pedido_id: pedido.id,
    status: "pendente",
    endereco: "Rua Jose Estrela, 21",
    bairro: "Centro",
    taxa,
  });
  await sb.from("lancamentos_financeiros").insert({
    tipo: "entrada",
    descricao: `Pedido #${pedido.numero}`,
    categoria: "Vendas delivery",
    valor: total,
    forma: "dinheiro",
    pedido_id: pedido.id,
  });

  console.log(`Delivery #${pedido.numero}: preparo → entrega → entregue`);
  await kdsAdvanceToEntregue(pedido.id, true);
  return pedido as PedidoRef;
}

async function fetchNotaByPedido(pedidoId: string) {
  const { data, error } = await sb
    .from("notas_fiscais")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function printNotaSummary(label: string, nota: NonNullable<Awaited<ReturnType<typeof fetchNotaByPedido>>>) {
  console.log(
    `  ${label}: NFC-e nº ${nota.numero} | ${nota.status} | cStat ${nota.codigo_status ?? "-"} | chave ${nota.chave_acesso?.slice(0, 12)}...`,
  );
}

async function main() {
  const { ensureBrasilFiscalUrlPatches } = await import(
    "../src/lib/fiscal/fiscal-sefaz-url-patch.ts"
  );
  await ensureBrasilFiscalUrlPatches();

  const config = await ensureFiscalAutoEmit();
  const produto = await findProductWithNcm();
  console.log(`\n=== NFC-e E2E tres canais (ambiente: ${config.ambiente ?? "homologacao"}) ===`);
  console.log(`Produto: ${produto.nome} (NCM ${produto.ncm}) R$ ${Number(produto.preco).toFixed(2)}\n`);

  const pedidos: PedidoRef[] = [];

  console.log("1/3 BALCÃO");
  pedidos.push(await createBalcaoPedido(produto));

  console.log("2/3 MESA");
  pedidos.push(await createMesaPedido(produto));

  console.log("3/3 DELIVERY");
  pedidos.push(await createDeliveryPedido(produto));

  console.log("\n--- Emitindo NFC-e ---");
  const notas = [];
  for (const pedido of pedidos) {
    console.log(`Pedido #${pedido.numero} (${pedido.canal})`);
    const emitted = await emitForPedido(pedido);
    const nota = emitted.nota;
    notas.push(nota);
    printNotaSummary(pedido.canal, nota);
    if (!["autorizada", "autorizada_homologacao"].includes(nota.status)) {
      throw new Error(`NFC-e nao autorizada para pedido #${pedido.numero}: ${nota.status}`);
    }
  }

  console.log("\n--- Verificacao ---");
  for (const pedido of pedidos) {
    const nota = await fetchNotaByPedido(pedido.id);
    if (!nota || !["autorizada", "autorizada_homologacao"].includes(nota.status)) {
      throw new Error(`Pedido #${pedido.numero} (${pedido.canal}) SEM NFC-e autorizada.`);
    }
    printNotaSummary(`OK ${pedido.canal}`, nota);
  }

  const { cancelarNotaFiscal, inutilizarNumeracaoFiscal } = await import(
    "../src/lib/api/fiscal.server.ts"
  );

  const cancelTarget = notas[0];
  console.log(`\n--- Cancelamento NFC-e nº ${cancelTarget.numero} (balcão) ---`);
  const cancel = await cancelarNotaFiscal(
    cancelTarget.id,
    "Cancelamento teste E2E homologacao tres canais",
  );
  console.log(`  Cancelada: cStat ${cancel.result.codigoStatus} — ${cancel.result.motivo}`);

  const serie = config.serie_nfce ?? 1;
  const inutIni = 999999940;
  const inutFim = 999999942;
  console.log(`\n--- Inutilizacao serie ${serie} numeros ${inutIni}-${inutFim} ---`);
  const inut = await inutilizarNumeracaoFiscal({
    serie,
    numeroInicial: inutIni,
    numeroFinal: inutFim,
    justificativa: "Inutilizacao teste E2E homologacao numeracao reservada",
  });
  console.log(`  Inutilizada: cStat ${inut.result.codigoStatus} — ${inut.result.motivo}`);

  console.log("\n=== RESUMO ===");
  console.log(`Balcão #${pedidos[0].numero}: NFC-e ${cancelTarget.numero} → CANCELADA`);
  console.log(`Mesa #${pedidos[1].numero}: NFC-e ${notas[1].numero} → AUTORIZADA`);
  console.log(`Delivery #${pedidos[2].numero}: NFC-e ${notas[2].numero} → AUTORIZADA`);
  console.log(`Inutilizacao: ${inutIni}-${inutFim} homologada`);
  console.log("\nNFCE_E2E_TRES_CANAIS_OK");
}

main().catch((error) => {
  console.error("\nFalha:", error instanceof Error ? error.message : error);
  process.exit(1);
});
