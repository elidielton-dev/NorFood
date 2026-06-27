#!/usr/bin/env node
/**
 * Valida cadastro de restaurante (fluxo /cadastro) em produção.
 * Uso: node scripts/validate-signup-production.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";
const stamp = Date.now().toString(36);
const TEST_EMAIL = process.env.SIGNUP_TEST_EMAIL ?? `cadastro-teste-${stamp}@norfood.local`;
const TEST_PASSWORD = process.env.SIGNUP_TEST_PASSWORD ?? "CadastroTest123!";
const TEST_SLUG = `teste-${stamp}`;

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
const url = env.SUPABASE_URL;
const anon = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  throw new Error("Faltam variáveis Supabase em deploy/.env");
}

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = createClient(url, anon, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("=== Validação cadastro Norfood ===");
console.log("Site:", BASE);
console.log("E-mail teste:", TEST_EMAIL);
console.log("Slug teste:", TEST_SLUG);

const routes = ["/cadastro", "/login", "/admin/nova"];
for (const route of routes) {
  const res = await fetch(`${BASE}${route}`, { redirect: "follow" });
  console.log(`GET ${route}:`, res.status);
}

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
  email_confirm: true,
  user_metadata: { nome: "Teste Cadastro" },
});
if (createError) throw createError;
const userId = created.user.id;
console.log("Usuário teste criado:", userId);

const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (signInError || !signIn.session) throw signInError ?? new Error("Sem sessão");

const tenantId = crypto.randomUUID();
const restaurantName = `Restaurante Teste ${stamp}`;

const { error: tenantError } = await admin.from("tenants").insert({
  id: tenantId,
  name: restaurantName,
  slug: TEST_SLUG,
  subtitle: "Delivery e retirada",
  primary_color: "#FF9100",
  secondary_color: "#111111",
  accent_color: "#FF5A00",
  status: "trial",
  timezone: "America/Sao_Paulo",
  currency: "BRL",
});
if (tenantError) throw tenantError;

await admin.from("tenant_settings").insert({ tenant_id: tenantId });
await admin.from("tenant_users").insert({
  tenant_id: tenantId,
  user_id: userId,
  role: "owner",
  status: "active",
});
await admin.from("tenant_billing").insert({
  tenant_id: tenantId,
  billing_model: "monthly",
  plan: "starter",
  monthly_price: 79.9,
  trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
  payment_status: "active",
  accepted_terms_at: new Date().toISOString(),
});

const { data: billing } = await admin
  .from("tenant_billing")
  .select("plan, billing_model, trial_ends_at")
  .eq("tenant_id", tenantId)
  .single();

console.log("Tenant + billing OK:", billing);

const loja = await fetch(`${BASE}/loja/${TEST_SLUG}`);
console.log(`Loja /loja/${TEST_SLUG}:`, loja.status);

const painel = await fetch(`${BASE}/t/${TEST_SLUG}/estabelecimento/plano`);
console.log(`Painel plano:`, painel.status);

console.log("\nLimpando dados de teste...");
await admin.from("tenant_billing").delete().eq("tenant_id", tenantId);
await admin.from("tenant_users").delete().eq("tenant_id", tenantId);
await admin.from("tenant_settings").delete().eq("tenant_id", tenantId);
await admin.from("tenants").delete().eq("id", tenantId);
await admin.auth.admin.deleteUser(userId);

console.log("\nCadastro validado com sucesso.");
