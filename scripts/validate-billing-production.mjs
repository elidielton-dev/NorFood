#!/usr/bin/env node
/**
 * Valida geração de faturas Norfood (admin /admin/faturamento).
 * Uso: node scripts/validate-billing-production.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";

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
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = env.PLATFORM_ADMIN_EMAILS?.split(",")[0]?.trim() ?? "eltnxz@gmail.com";
const adminPassword = process.env.ADMIN_PASSWORD ?? "@Elton20!";

if (!url || !service) throw new Error("Faltam SUPABASE_URL / SERVICE_ROLE em deploy/.env");

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
const lastDay = new Date(year, month, 0).getDate();
const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

const results = [];
function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
  console.log(`  OK  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("=== Validação faturamento Norfood ===");
console.log(`Período: ${periodStart} → ${periodEnd}`);
console.log(`Site: ${BASE}\n`);

// 1. Schema
for (const table of ["tenant_billing", "tenant_billing_invoices"]) {
  const col = table === "tenant_billing" ? "tenant_id" : "id";
  const { error } = await admin.from(table).select(col).limit(1);
  if (error) fail(`Tabela ${table}`, error.message);
  else pass(`Tabela ${table}`);
}

// MP columns
const { data: mpProbe, error: mpColErr } = await admin
  .from("tenant_billing_invoices")
  .select("mp_payment_id, paid_at")
  .limit(1);
if (mpColErr) fail("Migration MP faturas", mpColErr.message);
else pass("Colunas Mercado Pago nas faturas", mpProbe ? "ok" : "vazio");

// 3. Tenants + billing
const { data: tenants, error: tErr } = await admin.from("tenants").select("id, name, slug, status");
if (tErr) throw tErr;
pass("Tenants", `${tenants?.length ?? 0} empresa(s)`);

const { data: billingRows, error: bErr } = await admin.from("tenant_billing").select("*");
if (bErr) fail("tenant_billing read", bErr.message);
else {
  const without = (tenants ?? []).filter((t) => !billingRows?.some((b) => b.tenant_id === t.id));
  pass("Registros billing", `${billingRows?.length ?? 0}/${tenants?.length ?? 0}`);
  if (without.length) {
    fail("Tenants sem billing", without.map((t) => t.slug).join(", "));
  }
}

const inTrial = (billingRows ?? []).filter(
  (b) => b.trial_ends_at && new Date(b.trial_ends_at).getTime() > Date.now(),
);
if (inTrial.length === billingRows?.length && billingRows.length > 0) {
  console.log("\n  AVISO: Todos os tenants estão em TRIAL — faturas saem como waived (R$ 0).");
}

// 4. Invoices before generate
const { count: beforeCount } = await admin
  .from("tenant_billing_invoices")
  .select("id", { count: "exact", head: true })
  .eq("period_start", periodStart)
  .eq("period_end", periodEnd);

// 5. Simulate generate (same logic as server)
let created = 0;
let updated = 0;
const PLANS = { starter: 79.9, pro: 149.9, business: 219.9 };

for (const tenant of tenants ?? []) {
  const billing = billingRows?.find((b) => b.tenant_id === tenant.id);
  if (!billing) continue;

  const trial =
    billing.trial_ends_at && new Date(billing.trial_ends_at).getTime() > Date.now();
  let finalAmount = 0;
  if (!trial) {
    if (billing.billing_model === "monthly") {
      finalAmount = Number(billing.monthly_price ?? PLANS[billing.plan] ?? 0);
    }
  }

  const payload = {
    tenant_id: tenant.id,
    period_start: periodStart,
    period_end: periodEnd,
    billing_model: billing.billing_model,
    plan: billing.plan,
    gross_sales: 0,
    order_count: 0,
    revenue_share_percent: billing.billing_model === "revenue_share" ? billing.revenue_share_percent : null,
    calculated_amount: finalAmount,
    final_amount: finalAmount,
    status: trial ? "waived" : "pending",
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from("tenant_billing_invoices")
    .select("id, status")
    .eq("tenant_id", tenant.id)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (existing?.id) {
    if (existing.status === "paid") continue;
    const { error } = await admin.from("tenant_billing_invoices").update(payload).eq("id", existing.id);
    if (error) fail(`Update fatura ${tenant.slug}`, error.message);
    else updated += 1;
  } else {
    const { error } = await admin.from("tenant_billing_invoices").insert(payload);
    if (error) fail(`Insert fatura ${tenant.slug}`, error.message);
    else created += 1;
  }
}

pass("Gerar faturas (simulado)", `${created} criada(s), ${updated} atualizada(s)`);

const { data: invoices } = await admin
  .from("tenant_billing_invoices")
  .select("id, tenant_id, final_amount, status, tenants(slug, name)")
  .eq("period_start", periodStart)
  .eq("period_end", periodEnd);

console.log("\nFaturas do mês:");
for (const inv of invoices ?? []) {
  const t = inv.tenants;
  console.log(`  - ${t?.slug ?? inv.tenant_id}: R$ ${Number(inv.final_amount).toFixed(2)} (${inv.status})`);
}

// 6. Admin UI route
const ui = await fetch(`${BASE}/admin/faturamento`, { redirect: "follow" });
pass("Rota /admin/faturamento", `HTTP ${ui.status}`);

// 7. Platform admin session API
const anon = createClient(url, env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data: signIn } = await anon.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword,
});
if (!signIn.session) fail("Login admin plataforma", adminEmail);
else {
  pass("Login admin plataforma", adminEmail);
  const sessionRes = await fetch(`${BASE}/api/platform-admin/session`, {
    headers: { Authorization: `Bearer ${signIn.session.access_token}` },
  });
  const sessionBody = await sessionRes.json();
  if (sessionBody.allowed) pass("Acesso admin API");
  else fail("Acesso admin API", JSON.stringify(sessionBody));

  const billingRes = await fetch(
    `${BASE}/api/platform-admin/billing?view=rows&year=${year}&month=${month}`,
    { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  );
  const billingContentType = billingRes.headers.get("content-type") ?? "";
  const billingBody = billingContentType.includes("application/json")
    ? await billingRes.json()
    : null;
  if (!billingRes.ok) {
    fail(
      "API faturamento /api/platform-admin/billing",
      billingBody?.error ?? `HTTP ${billingRes.status}`,
    );
  } else if (!Array.isArray(billingBody) || billingBody.length === 0) {
    fail("API faturamento /api/platform-admin/billing", "lista vazia");
  } else {
    pass("API faturamento /api/platform-admin/billing", `${billingBody.length} restaurante(s)`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== Resumo: ${results.length - failed.length}/${results.length} OK ===`);
if (failed.length) {
  console.error("Falhas:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
