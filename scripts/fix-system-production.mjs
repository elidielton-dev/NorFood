#!/usr/bin/env node
/**
 * Prepara produção para validação E2E: bairros, gestor tenant, entregador.
 * Uso: node scripts/fix-system-production.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const MANAGER_EMAIL = process.env.MANAGER_EMAIL ?? "gestor@norfood.local";
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD ?? "GestorNorfood2026!";
const RIDER_EMAIL = process.env.RIDER_TEST_EMAIL ?? "entregador-teste@norfood.local";
const RIDER_PASSWORD = process.env.RIDER_TEST_PASSWORD ?? "EntregadorTest123!";

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    /* optional */
  }
  return env;
}

const env = { ...loadEnv(resolve(root, "deploy/.env")) };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("=== Fix sistema produção (norfood tenant) ===\n");

// 1. Bairros de entrega
const bairros = [
  { nome: "Centro", taxa: 6, ativo: true },
  { nome: "Jardins", taxa: 8, ativo: true },
  { nome: "Vila Nova", taxa: 7, ativo: true },
];

for (const b of bairros) {
  const { data: existingByTenant } = await admin
    .from("bairros_entrega")
    .select("id, tenant_id")
    .eq("tenant_id", TENANT_ID)
    .eq("nome", b.nome)
    .maybeSingle();

  if (existingByTenant?.id) {
    await admin.from("bairros_entrega").update({ taxa: b.taxa, ativo: true }).eq("id", existingByTenant.id);
    console.log(`  OK bairro ${b.nome} (atualizado)`);
    continue;
  }

  const { data: existingGlobal } = await admin
    .from("bairros_entrega")
    .select("id, tenant_id")
    .eq("nome", b.nome)
    .maybeSingle();

  if (existingGlobal?.id && !existingGlobal.tenant_id) {
    await admin
      .from("bairros_entrega")
      .update({ tenant_id: TENANT_ID, taxa: b.taxa, ativo: true })
      .eq("id", existingGlobal.id);
    console.log(`  OK bairro ${b.nome} (vinculado ao tenant)`);
    continue;
  }

  const { error } = await admin.from("bairros_entrega").insert({ ...b, tenant_id: TENANT_ID });
  if (error) console.error(`  FAIL bairro ${b.nome}:`, error.message);
  else console.log(`  OK bairro ${b.nome} (criado)`);
}

// 2. Gestor do restaurante (owner tenant norfood)
async function findUser(email) {
  let page = 1;
  while (true) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

let manager = await findUser(MANAGER_EMAIL);
if (!manager) {
  const { data, error } = await admin.auth.admin.createUser({
    email: MANAGER_EMAIL,
    password: MANAGER_PASSWORD,
    email_confirm: true,
    user_metadata: { nome: "Gestor Norfood" },
  });
  if (error) throw error;
  manager = data.user;
  console.log(`  OK gestor criado: ${MANAGER_EMAIL}`);
} else {
  await admin.auth.admin.updateUserById(manager.id, { password: MANAGER_PASSWORD, email_confirm: true });
  console.log(`  OK gestor existente: ${MANAGER_EMAIL}`);
}

await admin.from("profiles").upsert({
  id: manager.id,
  nome: "Gestor Norfood",
  telefone: "(11) 99999-0002",
  updated_at: new Date().toISOString(),
});

await admin.from("tenant_users").upsert(
  {
    tenant_id: TENANT_ID,
    user_id: manager.id,
    role: "owner",
    status: "active",
    updated_at: new Date().toISOString(),
  },
  { onConflict: "tenant_id,user_id,role" },
);

await admin.from("user_roles").upsert(
  { user_id: manager.id, role: "gerente" },
  { onConflict: "user_id,role" },
);

console.log(`  OK gestor owner tenant norfood`);

// 3. Entregador teste
let rider = await findUser(RIDER_EMAIL);
if (!rider) {
  const { data, error } = await admin.auth.admin.createUser({
    email: RIDER_EMAIL,
    password: RIDER_PASSWORD,
    email_confirm: true,
    user_metadata: { nome: "Entregador Teste" },
  });
  if (error) throw error;
  rider = data.user;
}

await admin.auth.admin.updateUserById(rider.id, { password: RIDER_PASSWORD, email_confirm: true });
await admin.from("profiles").upsert({
  id: rider.id,
  nome: "Entregador Teste Norfood",
  telefone: "(11) 98888-0001",
  updated_at: new Date().toISOString(),
});
await admin.from("user_roles").upsert({ user_id: rider.id, role: "motoboy" }, { onConflict: "user_id,role" });
await admin.from("tenant_users").upsert(
  {
    tenant_id: TENANT_ID,
    user_id: rider.id,
    role: "entregador",
    status: "active",
    updated_at: new Date().toISOString(),
  },
  { onConflict: "tenant_id,user_id,role" },
);
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
    updated_at: new Date().toISOString(),
  },
  { onConflict: "user_id" },
);
console.log(`  OK entregador: ${RIDER_EMAIL}`);

// 4. Produto mínimo se catálogo vazio
const { count: prodCount } = await admin
  .from("produtos")
  .select("id", { count: "exact", head: true })
  .eq("tenant_id", TENANT_ID)
  .eq("ativo", true);

if ((prodCount ?? 0) === 0) {
  let { data: cat } = await admin
    .from("categorias")
    .select("id")
    .eq("tenant_id", TENANT_ID)
    .limit(1)
    .maybeSingle();
  if (!cat) {
    const { data: newCat } = await admin
      .from("categorias")
      .insert({ nome: "Cardápio", ordem: 1, ativo: true, tenant_id: TENANT_ID })
      .select("id")
      .single();
    cat = newCat;
  }
  await admin.from("produtos").insert({
    tenant_id: TENANT_ID,
    categoria_id: cat.id,
    nome: "Produto Norfood",
    preco: 25.9,
    ativo: true,
    destaque: true,
  });
  console.log("  OK produto seed criado");
} else {
  console.log(`  OK catálogo: ${prodCount} produto(s) ativo(s)`);
}

// 5. Backfill tenant_id em registros legados (sem tenant)
for (const table of ["pedidos", "entregas", "categorias", "produtos"]) {
  const { data, error } = await admin.from(table).update({ tenant_id: TENANT_ID }).is("tenant_id", null).select("id");
  if (error) {
    console.warn(`  AVISO backfill ${table}:`, error.message);
  } else if (data?.length) {
    console.log(`  OK backfill ${table}: ${data.length} registro(s)`);
  }
}

console.log("\n=== Concluído ===");
console.log(`Gestor painel: ${MANAGER_EMAIL} / ${MANAGER_PASSWORD}`);
console.log(`Entregador app: ${RIDER_EMAIL} / ${RIDER_PASSWORD}`);
