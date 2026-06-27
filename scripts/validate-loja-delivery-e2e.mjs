#!/usr/bin/env node
/**
 * Validação ponta a ponta: loja delivery → painel → entregador → entrega finalizada.
 * Uso: node scripts/validate-loja-delivery-e2e.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { advanceMotoboyDelivery } from "./motoboy-delivery-fallback.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";
const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const TENANT_SLUG = "norfood";
const MARKER = "LOJA_DELIVERY_E2E";

const MANAGER_EMAIL = process.env.MANAGER_EMAIL ?? "gestor@norfood.local";
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD ?? "GestorNorfood2026!";
const CLIENT_EMAIL = process.env.CLIENT_TEST_EMAIL ?? "cliente-teste@norfood.local";
const CLIENT_PASSWORD = process.env.CLIENT_TEST_PASSWORD ?? "ClienteTest123!";
const RIDER_EMAIL = process.env.RIDER_TEST_EMAIL ?? "entregador-teste@norfood.local";
const RIDER_PASSWORD = process.env.RIDER_TEST_PASSWORD ?? "EntregadorTest123!";

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[trimmed.slice(0, eq).trim()] = value;
    }
  } catch {
    /* optional */
  }
  return env;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, "deploy/.env")) };
const SUPABASE_URL = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const ANON_KEY = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const passed = [];
const failed = [];

function ok(name, detail = "") {
  passed.push(name);
  console.log(`  OK   ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  failed.push(name);
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond, name, detail = "") {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

async function findUserByEmail(admin, email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function cleanupSeed(admin) {
  const { data: orders } = await admin
    .from("pedidos")
    .select("id")
    .ilike("observacoes", `%${MARKER}%`);
  const orderIds = (orders ?? []).map((o) => o.id);
  if (!orderIds.length) return;

  await admin.from("rotas_entrega").delete().in("pedido_id", orderIds);
  await admin.from("entregas").delete().in("pedido_id", orderIds);
  await admin.from("pedido_itens").delete().in("pedido_id", orderIds);
  await admin.from("lancamentos_financeiros").delete().in("pedido_id", orderIds);
  await admin.from("pedidos").delete().in("id", orderIds);
}

async function checkLojaWeb() {
  console.log("\n== 1. Loja web ==");

  const redirectRes = await fetch(`${BASE}/loja`, { redirect: "manual" });
  assert(
    [301, 302, 307, 200].includes(redirectRes.status),
    "Redirect /loja",
    `HTTP ${redirectRes.status}`,
  );

  const lojaRes = await fetch(`${BASE}/loja/${TENANT_SLUG}`);
  const html = await lojaRes.text();
  assert(lojaRes.ok, "Página /loja/norfood", `HTTP ${lojaRes.status}`);

  if (html.includes("Abelha") || html.includes("Brigadeiro Gold")) {
    fail("Rebrand loja", "textos Abelha & Mel ainda presentes");
  } else {
    ok("Rebrand loja", "sem referências Abelha & Mel");
  }

  const source = readFileSync(resolve(root, "src/components/app-abelha-mel.tsx"), "utf8");
  const carrinhoBlock = source.slice(source.indexOf("function Carrinho("));
  const carrinhoUsesBrand = carrinhoBlock.includes("useBrandName()");
  assert(carrinhoUsesBrand, "Fix carrinho brandName", "useBrandName() no componente Carrinho");
}

async function resolveCatalogProduct(admin) {
  const { data: prod } = await admin
    .from("produtos")
    .select("id,preco,ativo,nome")
    .eq("tenant_id", TENANT_ID)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (prod?.id) return { id: prod.id, preco: Number(prod.preco), nome: prod.nome };

  const { data: cat, error: catErr } = await admin
    .from("categorias")
    .insert({ nome: "E2E Loja Delivery", ordem: 99, ativo: true, tenant_id: TENANT_ID })
    .select("id")
    .single();
  if (catErr) throw catErr;

  const { data: created, error: prodErr } = await admin
    .from("produtos")
    .insert({
      tenant_id: TENANT_ID,
      categoria_id: cat.id,
      nome: "Produto E2E Loja Delivery",
      preco: 29.9,
      ativo: true,
      destaque: true,
    })
    .select("id,preco,nome")
    .single();
  if (prodErr) throw prodErr;
  return { id: created.id, preco: Number(created.preco), nome: created.nome };
}

async function runDeliveryFlow(admin, anon) {
  console.log("\n== 2. Fluxo delivery ponta a ponta ==");

  const client = await findUserByEmail(admin, CLIENT_EMAIL);
  const manager = await findUserByEmail(admin, MANAGER_EMAIL);
  const rider = await findUserByEmail(admin, RIDER_EMAIL);

  assert(Boolean(client), "Cliente teste existe", CLIENT_EMAIL);
  assert(Boolean(manager), "Gestor teste existe", MANAGER_EMAIL);
  assert(Boolean(rider), "Entregador teste existe", RIDER_EMAIL);
  if (!client || !manager || !rider) return;

  await cleanupSeed(admin);

  const product = await resolveCatalogProduct(admin);
  ok("Produto catálogo", `${product.nome} — R$ ${product.preco}`);

  let bairro = "Centro";
  let taxaEntrega = 6;
  const { data: bairroRow } = await admin
    .from("bairros_entrega")
    .select("nome,taxa")
    .eq("tenant_id", TENANT_ID)
    .limit(1)
    .maybeSingle();
  if (bairroRow) {
    bairro = bairroRow.nome;
    taxaEntrega = Number(bairroRow.taxa);
  }

  const subtotal = product.preco;
  const total = subtotal + taxaEntrega;

  // Etapa 1: cliente finaliza pedido (simula checkout da loja)
  const { data: order, error: orderErr } = await admin
    .from("pedidos")
    .insert({
      tenant_id: TENANT_ID,
      canal: "delivery",
      cliente_id: client.id,
      status: "aberto",
      subtotal,
      desconto: 0,
      taxa_entrega: taxaEntrega,
      total,
      forma_pagamento: "dinheiro",
      troco_para: 100,
      endereco: "Rua E2E Loja Delivery, 42",
      observacoes: `${MARKER} bairro=${bairro}`,
      latitude_cliente: -23.55052,
      longitude_cliente: -46.633308,
    })
    .select("*")
    .single();
  assert(!orderErr && order, "Pedido criado (loja)", orderErr?.message ?? `#${order?.numero}`);

  const { error: itemErr } = await admin.from("pedido_itens").insert({
    pedido_id: order.id,
    produto_id: product.id,
    quantidade: 1,
    preco_unitario: subtotal,
  });
  assert(!itemErr, "Item do pedido", itemErr?.message);

  const { data: delivery, error: delErr } = await admin
    .from("entregas")
    .insert({
      tenant_id: TENANT_ID,
      pedido_id: order.id,
      motoboy_id: null,
      status: "pendente",
      endereco: "Rua E2E Loja Delivery, 42",
      bairro,
      distancia_km: 3.2,
      taxa: taxaEntrega,
    })
    .select("*")
    .single();
  assert(!delErr && delivery, "Entrega pendente criada", delErr?.message);

  // Etapa 2: gestor aceita/prepara no painel
  const { data: managerSession, error: managerSignErr } = await anon.auth.signInWithPassword({
    email: MANAGER_EMAIL,
    password: MANAGER_PASSWORD,
  });
  assert(!managerSignErr && managerSession.session, "Login gestor painel", managerSignErr?.message);

  const managerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${managerSession.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: panelOrderErr } = await managerClient
    .from("pedidos")
    .update({ status: "pronto", updated_at: new Date().toISOString() })
    .eq("id", order.id);
  assert(!panelOrderErr, "Painel marca pedido pronto", panelOrderErr?.message);

  await anon.auth.signOut();

  // Etapa 3: entregador aceita a entrega (RPC)
  const { data: riderSession, error: riderSignErr } = await anon.auth.signInWithPassword({
    email: RIDER_EMAIL,
    password: RIDER_PASSWORD,
  });
  assert(!riderSignErr && riderSession.session, "Login entregador", riderSignErr?.message);

  const riderClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${riderSession.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: acceptErr } = await riderClient.rpc("motoboy_accept_entrega", {
    _entrega_id: delivery.id,
  });
  assert(!acceptErr, "Entregador aceita entrega (RPC)", acceptErr?.message);

  const { data: afterAccept } = await riderClient
    .from("entregas")
    .select("id,status,motoboy_id")
    .eq("id", delivery.id)
    .single();
  assert(
    afterAccept?.motoboy_id === rider.id && afterAccept?.status === "aceito",
    "Entrega atribuída ao entregador",
    `status=${afterAccept?.status}`,
  );

  const { error: routeErr } = await riderClient.from("rotas_entrega").upsert(
    {
      entregador_id: rider.id,
      pedido_id: order.id,
      ordem_entrega: 1,
      distancia_km: 3.2,
      tempo_estimado: 25,
      status: "pendente",
    },
    { onConflict: "pedido_id" },
  );
  assert(!routeErr, "Rota de entrega criada", routeErr?.message);

  // Etapa 4: entregador avança até finalizar
  const stages = ["arrived_store", "picked_up", "arrived_customer", "delivered"];
  let rpcCastGap = false;
  for (const stage of stages) {
    const result = await advanceMotoboyDelivery(riderClient, delivery.id, stage, admin);
    if (result.via === "admin_fallback_pedido_status_cast") rpcCastGap = true;
    ok(`Etapa entregador: ${stage}`, result.via);
  }
  if (rpcCastGap) {
    fail(
      "RPC motoboy_avancar_entrega",
      "bug pedido_status cast — aplicar migration 20260627210000_fix_motoboy_avancar_pedido_status_cast.sql",
    );
  }

  const [{ data: finalOrder }, { data: finalDelivery }, { data: finalRoute }] = await Promise.all([
    admin.from("pedidos").select("id,status,entregador_id").eq("id", order.id).single(),
    admin.from("entregas").select("id,status,entregue_em,motoboy_id").eq("id", delivery.id).single(),
    admin.from("rotas_entrega").select("status").eq("pedido_id", order.id).maybeSingle(),
  ]);

  assert(finalOrder?.status === "entregue", "Pedido finalizado", finalOrder?.status ?? "null");
  assert(finalDelivery?.status === "entregue", "Entrega finalizada", finalDelivery?.status ?? "null");
  assert(Boolean(finalDelivery?.entregue_em), "Timestamp entregue_em", finalDelivery?.entregue_em ?? "");
  assert(finalRoute?.status === "entregue", "Rota finalizada", finalRoute?.status ?? "null");

  await anon.auth.signOut();
}

async function main() {
  console.log("=== Validação E2E Loja Delivery NorFood ===");
  console.log(`Site: ${BASE}`);

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    fail("Config", "SUPABASE_URL, ANON_KEY ou SERVICE_KEY ausente em deploy/.env");
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await checkLojaWeb();
  await runDeliveryFlow(admin, anon);

  console.log(`\n=== Resultado: ${passed.length} OK, ${failed.length} FAIL ===`);
  if (failed.length) {
    console.error("\nFalhas:");
    for (const item of failed) console.error(`  - ${item}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nValidação abortada:", err?.message ?? err);
  process.exit(1);
});
