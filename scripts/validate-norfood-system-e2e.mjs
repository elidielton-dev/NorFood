#!/usr/bin/env node
/**
 * Validação ponta a ponta NorFood (produção) — pedido, entregador, catálogo, integrações.
 * Uso: node scripts/validate-norfood-system-e2e.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";
const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const TENANT_SLUG = "norfood";
const MARKER = "NORFOOD_E2E_VALIDATION";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "eltnxz@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "@Elton20!";
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
const SUPABASE_URL = env.SUPABASE_URL;
const ANON_KEY = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const passed = [];
const failed = [];
const gaps = [];

function ok(section, name, detail = "") {
  passed.push({ section, name, detail });
  console.log(`  OK   [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(section, name, detail = "") {
  failed.push({ section, name, detail });
  console.error(`  FAIL [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function gap(section, item, detail = "") {
  gaps.push({ section, item, detail });
  console.log(`  GAP  [${section}] ${item}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond, section, name, detail = "") {
  if (cond) ok(section, name, detail);
  else fail(section, name, detail);
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

async function ensureUser(admin, { email, password, name, phone, role, tenantRole }) {
  let user = await findUserByEmail(admin, email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome: name, telefone: phone },
    });
    if (error) throw error;
    user = data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  }

  await admin.from("profiles").upsert({
    id: user.id,
    nome: name,
    telefone: phone,
    updated_at: new Date().toISOString(),
  });

  if (role) {
    await admin.from("user_roles").upsert({ user_id: user.id, role }, { onConflict: "user_id,role" });
  }

  if (tenantRole) {
    await admin.from("tenant_users").upsert(
      {
        tenant_id: TENANT_ID,
        user_id: user.id,
        role: tenantRole,
        status: "active",
      },
      { onConflict: "tenant_id,user_id,role" },
    );
  }

  return user;
}

async function cleanupSeed(admin) {
  const { data: orders } = await admin
    .from("pedidos")
    .select("id")
    .ilike("observacoes", `%${MARKER}%`);
  const ids = (orders ?? []).map((o) => o.id);
  if (!ids.length) return;

  for (const table of ["rotas_entrega", "entregas", "pedido_itens", "lancamentos_financeiros"]) {
    await admin.from(table).delete().in("pedido_id", ids);
  }
  await admin.from("pedidos").delete().in("id", ids);
}

async function checkHttpRoutes() {
  console.log("\n== 1. Rotas HTTP ==");
  const routes = [
    "/api/health",
    "/",
    "/login",
    "/cadastro",
    "/admin",
    `/loja/${TENANT_SLUG}`,
    `/t/${TENANT_SLUG}/dashboard`,
    `/t/${TENANT_SLUG}/pedidos`,
    `/t/${TENANT_SLUG}/produtos`,
    `/t/${TENANT_SLUG}/entregas`,
    `/t/${TENANT_SLUG}/kds`,
    `/t/${TENANT_SLUG}/configuracoes`,
    "/entregador",
  ];

  for (const route of routes) {
    try {
      const res = await fetch(`${BASE}${route}`, { redirect: "follow" });
      assert(res.status >= 200 && res.status < 400, "HTTP", route, `HTTP ${res.status}`);
    } catch (e) {
      fail("HTTP", route, e.message);
    }
  }
}

async function checkEnvIntegrations() {
  console.log("\n== 2. Variáveis de integração (deploy/.env) ==");
  const checks = [
    ["SUPABASE_URL", SUPABASE_URL],
    ["SUPABASE_PUBLISHABLE_KEY", ANON_KEY],
    ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
    ["PLATFORM_ADMIN_EMAILS", env.PLATFORM_ADMIN_EMAILS ?? env.VITE_PLATFORM_ADMIN_EMAILS],
    ["PUBLIC_APP_URL", env.PUBLIC_APP_URL],
    ["MP_ACCESS_TOKEN", env.MP_ACCESS_TOKEN],
    ["VITE_MP_PUBLIC_KEY", env.VITE_MP_PUBLIC_KEY],
    ["META_APP_ID", env.META_APP_ID],
    ["META_APP_SECRET", env.META_APP_SECRET],
    ["WABA_VERIFY_TOKEN", env.WABA_VERIFY_TOKEN],
    ["EVOLUTION_API_URL", env.EVOLUTION_API_URL],
  ];

  for (const [key, val] of checks) {
    if (val && String(val).length > 3) ok("ENV", key, "configurado");
    else if (["MP_ACCESS_TOKEN", "VITE_MP_PUBLIC_KEY", "META_APP_ID", "META_APP_SECRET", "WABA_VERIFY_TOKEN", "EVOLUTION_API_URL"].includes(key)) {
      gap("ENV", key, "não configurado — pagamento online / WhatsApp indisponível");
    } else {
      fail("ENV", key, "obrigatório ausente");
    }
  }

  const appUrl = env.PUBLIC_APP_URL ?? "";
  if (appUrl && !appUrl.includes("norfood.com.br")) {
    gap("ENV", "PUBLIC_APP_URL", `valor=${appUrl} — webhooks podem apontar para URL errada`);
  }
}

async function checkDatabaseInventory(admin) {
  console.log("\n== 3. Inventário Supabase (tenant norfood) ==");

  const { data: tenant, error: tErr } = await admin
    .from("tenants")
    .select("id,slug,status")
    .eq("slug", TENANT_SLUG)
    .maybeSingle();
  assert(!tErr && tenant?.status === "active", "DB", "tenant norfood ativo", tenant?.slug);

  const { data: settings } = await admin
    .from("tenant_settings")
    .select("loja_aberta,pedido_minimo,delivery_fee_default,payment_methods")
    .eq("tenant_id", TENANT_ID)
    .maybeSingle();
  assert(settings?.loja_aberta !== false, "DB", "loja aberta", settings ? "sim" : "sem settings");
  if (!settings) gap("DB", "tenant_settings", "registro ausente para norfood");

  const tables = [
    "categorias",
    "produtos",
    "bairros_entrega",
    "pedidos",
    "entregas",
    "entregador_perfis",
    "entregadores_localizacao",
    "rotas_entrega",
    "empresa_fiscal",
    "fiscal_config",
    "waba_config",
    "whatsapp_config",
    "config_operacional",
    "horarios_funcionamento",
  ];

  for (const table of tables) {
    const { error } = await admin.from(table).select("*").limit(1);
    if (error) {
      fail("DB", `tabela ${table}`, error.message);
      continue;
    }
    ok("DB", `tabela ${table}`, "existe");
  }

  const counts = {};
  for (const [table, filter] of [
    ["categorias", (q) => q.eq("tenant_id", TENANT_ID)],
    ["produtos", (q) => q.eq("tenant_id", TENANT_ID)],
    ["produtos", (q) => q.eq("tenant_id", TENANT_ID).eq("ativo", true)],
    ["bairros_entrega", (q) => q.eq("tenant_id", TENANT_ID)],
    ["pedidos", (q) => q.eq("tenant_id", TENANT_ID)],
    ["entregador_perfis", (q) => q],
  ]) {
    let q = admin.from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) continue;
    const key = table === "produtos" && filter.toString().includes("ativo") ? "produtos_ativos" : table;
    counts[key] = count ?? 0;
  }

  console.log(`  INFO catálogo norfood: categorias=${counts.categorias ?? 0}, produtos=${counts.produtos ?? 0}, ativos=${counts.produtos_ativos ?? 0}, bairros=${counts.bairros_entrega ?? 0}`);

  if ((counts.produtos_ativos ?? 0) === 0) {
    gap("DB", "catálogo de produtos", "nenhum produto ativo com tenant_id=norfood — loja não permite pedido real");
  }
  if ((counts.bairros_entrega ?? 0) === 0) {
    gap("DB", "bairros de entrega", "tabela vazia — checkout delivery não calcula taxa por bairro");
  }

  const { count: pedidosSemTenant } = await admin
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .is("tenant_id", null);
  if ((pedidosSemTenant ?? 0) > 0) {
    gap("DB", "pedidos sem tenant_id", `${pedidosSemTenant} pedido(s) legado(s) sem tenant`);
  }

  const { data: fiscal } = await admin.from("empresa_fiscal").select("*").eq("tenant_id", TENANT_ID).limit(1);
  if (!fiscal?.length) gap("DB", "empresa_fiscal", "CNPJ/certificado não cadastrado — NFC-e indisponível");

  const { data: waba } = await admin.from("waba_config").select("*").eq("tenant_id", TENANT_ID).limit(1);
  if (!waba?.length) gap("DB", "waba_config", "WhatsApp Meta não configurado no tenant");
}

async function checkUsers(admin) {
  console.log("\n== 4. Usuários e papéis ==");

  const platformAdmins = (env.PLATFORM_ADMIN_EMAILS ?? env.VITE_PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const adminUser = await findUserByEmail(admin, ADMIN_EMAIL);
  assert(Boolean(adminUser?.email_confirmed_at), "AUTH", "admin plataforma confirmado", ADMIN_EMAIL);

  const { data: adminMembership } = await admin
    .from("tenant_users")
    .select("role,status")
    .eq("user_id", adminUser?.id)
    .eq("tenant_id", TENANT_ID)
    .maybeSingle();

  if (platformAdmins.includes(ADMIN_EMAIL.toLowerCase()) && !adminMembership) {
    ok("AUTH", "admin plataforma sem vínculo tenant", "correto para /admin");
  } else {
    assert(adminMembership?.role === "owner", "AUTH", "admin owner norfood", adminMembership?.role);
  }

  const manager = await ensureUser(admin, {
    email: MANAGER_EMAIL,
    password: MANAGER_PASSWORD,
    name: "Gestor Norfood",
    phone: "(11) 99999-0002",
    role: "gerente",
    tenantRole: "owner",
  });
  ok("AUTH", "gestor tenant norfood", MANAGER_EMAIL);

  const client = await findUserByEmail(admin, CLIENT_EMAIL);
  assert(Boolean(client), "AUTH", "cliente teste existe", CLIENT_EMAIL);

  const rider = await ensureUser(admin, {
    email: RIDER_EMAIL,
    password: RIDER_PASSWORD,
    name: "Entregador Teste Norfood",
    phone: "(11) 98888-0001",
    role: "motoboy",
    tenantRole: "entregador",
  });
  ok("AUTH", "entregador teste pronto", RIDER_EMAIL);

  await admin.from("entregador_perfis").upsert(
    {
      user_id: rider.id,
      tenant_id: TENANT_ID,
      online: true,
      vehicle: "Moto",
      plate: "NRF1E23",
      city: "São Paulo",
      state: "SP",
      neighborhood: "Centro",
      cep: "01310-100",
      address: "Av. Paulista, 1000",
    },
    { onConflict: "user_id" },
  );

  await admin.from("entregadores_localizacao").upsert(
    {
      entregador_id: rider.id,
      tenant_id: TENANT_ID,
      latitude: -23.561414,
      longitude: -46.655881,
      speed: 0,
      heading: 0,
      accuracy: 8,
      battery: 88,
      status: "online",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entregador_id" },
  );

  return { adminUser, manager, client, rider };
}

async function runDeliveryE2E(admin, anon, users) {
  console.log("\n== 5. Fluxo pedido + entregador (E2E) ==");

  await cleanupSeed(admin);

  let categoriaId;
  let productId;
  let productPrice = 25.9;

  const { data: existingCat } = await admin
    .from("categorias")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .limit(1)
    .maybeSingle();

  if (existingCat?.id) {
    categoriaId = existingCat.id;
    const { data: existingProd } = await admin
      .from("produtos")
      .select("id,preco,ativo")
      .eq("tenant_id", TENANT_ID)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    if (existingProd?.id) {
      productId = existingProd.id;
      productPrice = Number(existingProd.preco);
      ok("E2E", "usa produto existente do catálogo", `R$ ${productPrice}`);
    }
  }

  if (!productId) {
    gap("E2E", "seed produto temporário", "catálogo vazio — criando produto só para teste");
    const { data: cat, error: catErr } = await admin
      .from("categorias")
      .insert({ nome: "E2E Norfood", ordem: 99, ativo: true, tenant_id: TENANT_ID })
      .select("id")
      .single();
    if (catErr) {
      fail("E2E", "criar categoria", catErr.message);
      return;
    }
    categoriaId = cat.id;

    const { data: prod, error: prodErr } = await admin
      .from("produtos")
      .insert({
        categoria_id: categoriaId,
        nome: "Produto E2E Norfood",
        preco: productPrice,
        ativo: true,
        destaque: true,
        tenant_id: TENANT_ID,
      })
      .select("id,preco")
      .single();
    if (prodErr) {
      fail("E2E", "criar produto", prodErr.message);
      return;
    }
    productId = prod.id;
  }

  let bairro = "Centro";
  let taxaEntrega = Number((await admin.from("tenant_settings").select("delivery_fee_default").eq("tenant_id", TENANT_ID).maybeSingle()).data?.delivery_fee_default ?? 6);

  const { data: bairroRow } = await admin
    .from("bairros_entrega")
    .select("nome,taxa")
    .eq("tenant_id", TENANT_ID)
    .limit(1)
    .maybeSingle();
  if (bairroRow) {
    bairro = bairroRow.nome;
    taxaEntrega = Number(bairroRow.taxa);
  } else {
    gap("E2E", "bairro", "usando bairro fictício Centro — cadastre bairros_entrega no painel");
  }

  const subtotal = productPrice;
  const total = subtotal + taxaEntrega;

  const { data: order, error: orderErr } = await admin
    .from("pedidos")
    .insert({
      tenant_id: TENANT_ID,
      canal: "delivery",
      cliente_id: users.client.id,
      status: "aberto",
      subtotal,
      desconto: 0,
      taxa_entrega: taxaEntrega,
      total,
      forma_pagamento: "dinheiro",
      troco_para: 50,
      endereco: "Rua Teste E2E, 100",
      observacoes: `${MARKER} pedido automatizado bairro=${bairro}`,
      latitude_cliente: -23.55052,
      longitude_cliente: -46.633308,
    })
    .select("*")
    .single();

  if (orderErr) {
    fail("E2E", "criar pedido", orderErr.message);
    return;
  }
  ok("E2E", "pedido criado", `#${order.numero}`);

  const { error: itemErr } = await admin.from("pedido_itens").insert({
    pedido_id: order.id,
    produto_id: productId,
    quantidade: 1,
    preco_unitario: subtotal,
  });
  assert(!itemErr, "E2E", "item do pedido", itemErr?.message);

  const { data: delivery, error: delErr } = await admin
    .from("entregas")
    .insert({
      tenant_id: TENANT_ID,
      pedido_id: order.id,
      motoboy_id: null,
      status: "pendente",
      endereco: "Rua Teste E2E, 100",
      bairro,
      distancia_km: 3.5,
      taxa: taxaEntrega,
    })
    .select("*")
    .single();
  assert(!delErr, "E2E", "entrega criada", delErr?.message);

  const { error: signInErr, data: managerSession } = await anon.auth.signInWithPassword({
    email: MANAGER_EMAIL,
    password: MANAGER_PASSWORD,
  });
  assert(!signInErr && managerSession.session, "E2E", "gestor login Supabase", signInErr?.message);

  const managerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${managerSession.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: assignOrderErr } = await managerClient
    .from("pedidos")
    .update({
      entregador_id: users.rider.id,
      ordem_na_rota: 1,
      status: "pronto",
    })
    .eq("id", order.id);
  assert(!assignOrderErr, "E2E", "gestor marca pedido pronto + entregador", assignOrderErr?.message);

  const { error: assignDelErr, data: assignedRows } = await managerClient
    .from("entregas")
    .update({ motoboy_id: users.rider.id, status: "aceito" })
    .eq("id", delivery.id)
    .select("id, motoboy_id, status");
  assert(!assignDelErr, "E2E", "gestor atribui entrega ao motoboy", assignDelErr?.message);
  assert(
    assignedRows?.[0]?.motoboy_id === users.rider.id,
    "E2E",
    "motoboy_id persistido na entrega",
    assignedRows?.[0]?.motoboy_id ?? "null",
  );

  await anon.auth.signOut();

  const { error: riderSignErr, data: riderSession } = await anon.auth.signInWithPassword({
    email: RIDER_EMAIL,
    password: RIDER_PASSWORD,
  });
  assert(!riderSignErr && riderSession.session, "E2E", "entregador login Supabase", riderSignErr?.message);

  const riderClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${riderSession.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: riderDeliveries, error: riderDelErr } = await riderClient
    .from("entregas")
    .select("id,pedido_id,status,bairro,motoboy_id")
    .eq("motoboy_id", users.rider.id);
  assert(!riderDelErr && (riderDeliveries?.length ?? 0) > 0, "E2E", "app entregador vê entregas", `${riderDeliveries?.length ?? 0} entrega(s)`);

  const activeDelivery = riderDeliveries.find((d) => d.pedido_id === order.id);
  assert(Boolean(activeDelivery), "E2E", "entrega E2E visível no app", activeDelivery?.id);

  const { error: startErr } = await riderClient
    .from("entregas")
    .update({ status: "em_rota", saiu_em: new Date().toISOString() })
    .eq("id", delivery.id);
  assert(!startErr, "E2E", "entregador inicia rota", startErr?.message);

  const { error: locErr } = await riderClient.from("entregadores_localizacao").upsert(
    {
      entregador_id: users.rider.id,
      tenant_id: TENANT_ID,
      latitude: -23.5489,
      longitude: -46.6388,
      speed: 25,
      heading: 90,
      accuracy: 5,
      battery: 85,
      status: "em_rota",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entregador_id" },
  );
  assert(!locErr, "E2E", "entregador envia GPS", locErr?.message);

  const { error: finishErr } = await riderClient
    .from("entregas")
    .update({ status: "entregue", entregue_em: new Date().toISOString() })
    .eq("id", delivery.id);
  assert(!finishErr, "E2E", "entregador finaliza entrega", finishErr?.message);

  const { error: finishOrderErr } = await riderClient
    .from("pedidos")
    .update({ status: "entregue" })
    .eq("id", order.id);
  if (finishOrderErr) {
    gap("E2E", "entregador atualizar pedido", finishOrderErr.message + " — RLS pode restringir motoboy");
  } else {
    ok("E2E", "pedido marcado entregue");
  }

  await anon.auth.signOut();
}

async function checkLojaPage() {
  console.log("\n== 6. Loja web (conteúdo) ==");
  try {
    const res = await fetch(`${BASE}/loja/${TENANT_SLUG}`);
    const html = await res.text();
    assert(res.ok, "LOJA", "página carrega", `HTTP ${res.status}`);
    if (html.includes("demo") || html.includes("Demo Mode")) {
      gap("LOJA", "modo demo", "VITE_DEMO_MODE pode estar true no build");
    }
    if (!html.match(/R\$\s*[\d.,]+/)) {
      gap("LOJA", "preços na loja", "nenhum preço renderizado — catálogo provavelmente vazio");
    }
  } catch (e) {
    fail("LOJA", "fetch loja", e.message);
  }
}

async function main() {
  console.log("=== Validação E2E NorFood ===");
  console.log(`Site: ${BASE}`);
  console.log(`Tenant: ${TENANT_SLUG}`);

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    throw new Error("Faltam credenciais Supabase em deploy/.env");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await checkHttpRoutes();
  await checkEnvIntegrations();
  await checkDatabaseInventory(admin);
  const users = await checkUsers(admin);
  await checkLojaPage();
  await runDeliveryE2E(admin, anon, users);

  console.log("\n========================================");
  console.log("RESUMO");
  console.log("========================================");
  console.log(`Passou:  ${passed.length}`);
  console.log(`Falhou:  ${failed.length}`);
  console.log(`Gaps:    ${gaps.length}`);

  if (gaps.length) {
    console.log("\n--- O QUE FALTA / PENDÊNCIAS ---");
    const bySection = {};
    for (const g of gaps) {
      bySection[g.section] ??= [];
      bySection[g.section].push(g);
    }
    for (const [section, items] of Object.entries(bySection)) {
      console.log(`\n[${section}]`);
      for (const g of items) {
        console.log(`  • ${g.item}${g.detail ? `: ${g.detail}` : ""}`);
      }
    }
  }

  if (failed.length) {
    console.log("\n--- FALHAS CRÍTICAS ---");
    for (const f of failed) {
      console.log(`  • [${f.section}] ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
    }
    process.exit(1);
  }

  console.log("\nCredenciais teste:");
  console.log(`  Admin plataforma: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Gestor painel:    ${MANAGER_EMAIL} / ${MANAGER_PASSWORD}`);
  console.log(`  Cliente:          ${CLIENT_EMAIL} / ${CLIENT_PASSWORD}`);
  console.log(`  Entregador:       ${RIDER_EMAIL} / ${RIDER_PASSWORD}`);
  console.log(`  App mobile: configure EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY e login entregador`);
}

main().catch((err) => {
  console.error("\nValidação abortada:", err?.message ?? err);
  process.exit(1);
});
