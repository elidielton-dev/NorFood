#!/usr/bin/env node
/**
 * Validação auth + rotas produção norfood.com.br
 * Uso: node scripts/validate-auth-production.mjs
 * Lê deploy/.env (Supabase + PLATFORM_ADMIN_EMAILS)
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "eltnxz@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "NorfoodAdmin2026!";
const CLIENT_EMAIL = process.env.CLIENT_TEST_EMAIL ?? "cliente-teste@norfood.local";
const CLIENT_PASSWORD = process.env.CLIENT_TEST_PASSWORD ?? "ClienteTest123!";

function loadEnv(path) {
  const env = {};
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
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
const PLATFORM_ADMINS = (env.PLATFORM_ADMIN_EMAILS ?? env.VITE_PLATFORM_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const results = [];
function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`  OK  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(ok, name, detail) {
  if (ok) pass(name, detail);
  else fail(name, detail);
}

async function ensureAdminUser(admin) {
  console.log("\n== Setup admin (create-demo-user logic) ==");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Admin NorFood", phone: "(11) 99999-0000" },
  });

  let userId = created.user?.id;
  if (createError) {
    if (createError.code !== "email_exists") throw createError;
    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userId = listed?.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase())?.id;
    if (!userId) throw createError;
    await admin.auth.admin.updateUserById(userId, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    pass("Admin existente confirmado e senha atualizada", ADMIN_EMAIL);
  } else {
    pass("Admin criado", ADMIN_EMAIL);
  }

  await admin.from("profiles").upsert({
    id: userId,
    nome: "Admin NorFood",
    telefone: "(11) 99999-0000",
    updated_at: new Date().toISOString(),
  });
  await admin.from("user_roles").upsert({ user_id: userId, role: "admin" });
  await admin.from("tenant_users").upsert({
    tenant_id: "a0000000-0000-4000-8000-000000000001",
    user_id: userId,
    role: "owner",
    status: "active",
  });

  return userId;
}

async function ensureClientUser(admin) {
  console.log("\n== Setup cliente teste (cadastro simulado) ==");
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: CLIENT_EMAIL,
    password: CLIENT_PASSWORD,
    email_confirm: true,
    user_metadata: { nome: "Cliente Teste" },
  });

  if (createError?.code === "email_exists") {
    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const userId = listed?.users.find((u) => u.email?.toLowerCase() === CLIENT_EMAIL.toLowerCase())?.id;
    if (userId) {
      await admin.auth.admin.updateUserById(userId, { email_confirm: true, password: CLIENT_PASSWORD });
    }
    pass("Cliente teste já existia — confirmado", CLIENT_EMAIL);
    return;
  }
  if (createError) throw createError;
  pass("Cliente teste criado", CLIENT_EMAIL);
}

async function testSignIn(label, email, password, anon) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  assert(!error && data.session, `${label} login Supabase`, error?.message ?? "session ok");
  if (data.session) {
    await anon.auth.signOut();
  }
}

async function testHttpRoutes() {
  console.log("\n== Rotas HTTP (produção) ==");
  const routes = [
    "/api/health",
    "/",
    "/cadastro",
    "/login",
    "/admin",
    "/loja/norfood",
    "/t/norfood/dashboard",
  ];
  for (const route of routes) {
    const url = `${BASE}${route}`;
    const res = await fetch(url, { redirect: "follow" });
    assert(res.status >= 200 && res.status < 400, `GET ${route}`, `HTTP ${res.status}`);
  }
}

async function testSupabaseData(admin) {
  console.log("\n== Supabase schema mínimo ==");
  const { data: tenants, error: tErr } = await admin.from("tenants").select("slug,status");
  assert(!tErr, "tabela tenants", tErr?.message);
  const slugs = (tenants ?? []).map((t) => t.slug);
  assert(slugs.includes("norfood"), "tenant norfood seed", slugs.join(", "));
}

async function testTenantMembership(admin, userId) {
  const { data: membership } = await admin
    .from("tenant_users")
    .select("role,status")
    .eq("user_id", userId)
    .eq("tenant_id", "a0000000-0000-4000-8000-000000000001")
    .maybeSingle();
  assert(membership?.role === "owner" && membership?.status === "active", "Admin owner tenant norfood", JSON.stringify(membership));
}

async function main() {
  console.log("=== Validação auth NorFood produção ===");
  console.log(`Site: ${BASE}`);
  console.log(`Admin: ${ADMIN_EMAIL}`);

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    throw new Error("Faltam SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY ou SERVICE_ROLE em deploy/.env");
  }

  assert(PLATFORM_ADMINS.includes(ADMIN_EMAIL.toLowerCase()), "PLATFORM_ADMIN_EMAILS inclui admin", PLATFORM_ADMINS.join(", "));

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await testSupabaseData(admin);
  const adminUserId = await ensureAdminUser(admin);
  await ensureClientUser(admin);

  console.log("\n== Teste 1 — Login cliente ==");
  await testSignIn("Cliente", CLIENT_EMAIL, CLIENT_PASSWORD, anon);

  console.log("\n== Teste 2/3 — Login admin (admin + painel) ==");
  await testSignIn("Admin", ADMIN_EMAIL, ADMIN_PASSWORD, anon);

  const { data: adminUser } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const adminRow = adminUser?.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  assert(Boolean(adminRow?.email_confirmed_at), "Admin e-mail confirmado", adminRow?.email_confirmed_at ?? "null");

  await testTenantMembership(admin, adminUserId);

  await testHttpRoutes();

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== Resumo ===");
  console.log(`Passou: ${results.filter((r) => r.ok).length}/${results.length}`);
  if (failed.length) {
    console.error("Falhas:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("\nCredenciais para teste manual no navegador:");
  console.log(`  Admin:   ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Cliente: ${CLIENT_EMAIL} / ${CLIENT_PASSWORD}`);
  console.log(`  Admin UI: ${BASE}/admin`);
  console.log(`  Painel:   ${BASE}/t/norfood/dashboard`);
}

main().catch((err) => {
  console.error("\nValidação abortada:", err?.message ?? err);
  process.exit(1);
});
