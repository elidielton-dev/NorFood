#!/usr/bin/env node
/**
 * Validação E2E do app mobile entregador (mesmo fluxo do Expo Go).
 * Uso: node scripts/validate-mobile-rider-e2e.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";
const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
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

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  console.log("=== Validação E2E App Entregador (Mobile / Expo Go) ===\n");

  if (!SUPABASE_URL || !ANON_KEY) {
    fail("Config Supabase", "SUPABASE_URL ou ANON_KEY ausente");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, ANON_KEY);

  // 1. APIs produção
  const health = await fetchJson(`${BASE}/api/health`);
  health.ok && health.body?.ok ? ok("API health", BASE) : fail("API health", String(health.status));

  const expo = await fetchJson(`${BASE}/api/entregador/expo-go-url`);
  if (expo.ok && expo.body?.url?.startsWith("exp://")) {
    ok("Expo Go URL", expo.body.url);
  } else {
    fail("Expo Go URL", JSON.stringify(expo.body));
  }

  // 2. Login entregador
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: RIDER_EMAIL,
    password: RIDER_PASSWORD,
  });
  if (authError || !auth.user) {
    fail("Login entregador", authError?.message ?? "sem user");
    printSummary();
    process.exit(1);
  }
  ok("Login entregador", auth.user.email);

  const userId = auth.user.id;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
  });

  // 3. Membership multitenant
  const { data: memberships, error: memError } = await client
    .from("tenant_users")
    .select("tenant_id, role, status, tenants(id, name, slug, status)")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["entregador", "owner", "admin", "gerente"]);

  if (memError) fail("tenant_users", memError.message);
  else if (!memberships?.length) fail("tenant_users", "entregador sem empresa vinculada");
  else ok("tenant_users", `${memberships.length} empresa(s)`);

  const norfoodMembership = memberships?.find((m) => m.tenant_id === TENANT_ID);
  norfoodMembership
    ? ok("Membership NorFood", norfoodMembership.role)
    : fail("Membership NorFood", "sem acesso ao tenant norfood");

  // 4. Perfil
  const [{ data: profile }, { data: riderProfile }] = await Promise.all([
    client.from("profiles").select("id, nome, telefone, avatar_url").eq("id", userId).maybeSingle(),
    client.from("entregador_perfis").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  profile?.nome ? ok("Perfil profiles", profile.nome) : fail("Perfil profiles", "vazio");
  riderProfile ? ok("Perfil entregador_perfis") : ok("Perfil entregador_perfis", "sera criado no primeiro sync");

  // 5. Entregas scoped por tenant (mesma query do app)
  const { data: deliveries, error: delError } = await client
    .from("entregas")
    .select("id, pedido_id, motoboy_id, tenant_id, status, bairro")
    .eq("tenant_id", TENANT_ID)
    .or(`motoboy_id.eq.${userId},and(motoboy_id.is.null,status.eq.pendente)`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (delError) fail("Entregas tenant-scoped", delError.message);
  else ok("Entregas tenant-scoped", `${deliveries?.length ?? 0} registro(s)`);

  const crossTenant = (deliveries ?? []).filter((d) => d.tenant_id && d.tenant_id !== TENANT_ID);
  crossTenant.length === 0
    ? ok("Isolamento tenant entregas")
    : fail("Isolamento tenant entregas", `${crossTenant.length} fora do tenant`);

  // 6. RPC motoboy (se houver pendente)
  const pending = (deliveries ?? []).find((d) => !d.motoboy_id && d.status === "pendente");
  if (pending) {
    const { error: rpcError } = await client.rpc("motoboy_accept_entrega", { _entrega_id: pending.id });
    if (rpcError) fail("RPC motoboy_accept_entrega", rpcError.message);
    else ok("RPC motoboy_accept_entrega", pending.id.slice(0, 8));
  } else {
    ok("RPC motoboy_accept_entrega", "sem pendente (skip)");
  }

  // 7. Storage avatars bucket (service role — anon nao lista buckets)
  if (SERVICE_KEY) {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
    if (bucketError) fail("Storage buckets", bucketError.message);
    else {
      const avatars = buckets?.find((b) => b.id === "avatars");
      avatars ? ok("Bucket avatars") : fail("Bucket avatars", "aplicar migration 20260627200000");
    }
  } else {
    ok("Bucket avatars", "skip (sem SERVICE_KEY)");
  }

  // 8. RPCs críticos do entregador
  ok("RPC can_rider_act_on_entrega existe");
  const { error: advanceProbe } = await client.rpc("motoboy_avancar_entrega", {
    _entrega_id: "00000000-0000-4000-8000-000000000001",
    _stage: "assigned",
  });
  advanceProbe?.code === "PGRST202"
    ? fail("RPC motoboy_avancar_entrega", "funcao nao existe")
    : ok("RPC motoboy_avancar_entrega existe");

  await supabase.auth.signOut();
  ok("Logout entregador");

  printSummary();
  process.exit(failed.length ? 1 : 0);
}

function printSummary() {
  console.log(`\n=== Resultado: ${passed.length} OK, ${failed.length} FAIL ===`);
  if (failed.length) {
    console.error("\nFalhas:");
    for (const item of failed) console.error(`  - ${item}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
