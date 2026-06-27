#!/usr/bin/env node
/**
 * Corrige billing produção: backfill, encerra trial demo para teste MP, regera faturas.
 * Uso: node scripts/fix-billing-production.mjs
 *      node scripts/fix-billing-production.mjs --end-trial-demo
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const endTrialDemo = process.argv.includes("--end-trial-demo");

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
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
const lastDay = new Date(year, month, 0).getDate();
const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

async function columnExists(table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return !error;
}

console.log("=== Fix billing produção ===\n");

if (!(await columnExists("tenant_billing_invoices", "mp_payment_id"))) {
  console.warn(
    "AVISO: colunas MP ausentes — rode scripts/production-billing-migrations.sql no Supabase SQL Editor.",
  );
  console.warn("Dashboard: https://supabase.com/dashboard/project/xrmfucimqrfvgvltnwei/sql/new\n");
} else {
  console.log("OK colunas MP");
}

const { data: tenants } = await admin.from("tenants").select("id, slug, name");
for (const tenant of tenants ?? []) {
  const { data: billing } = await admin
    .from("tenant_billing")
    .select("tenant_id")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!billing) {
    await admin.from("tenant_billing").insert({
      tenant_id: tenant.id,
      billing_model: "monthly",
      plan: "pro",
      monthly_price: 149.9,
      trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      accepted_terms_at: new Date().toISOString(),
    });
    console.log(`OK billing criado: ${tenant.slug}`);
  }
}

if (endTrialDemo) {
  const demo = tenants?.find((t) => t.slug === "demo-restaurante");
  if (demo) {
    await admin
      .from("tenant_billing")
      .update({
        trial_ends_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", demo.id);
    console.log("OK trial encerrado: demo-restaurante");
  }
}

const { data: billingRows } = await admin.from("tenant_billing").select("*");
let created = 0;
let updated = 0;

for (const tenant of tenants ?? []) {
  const billing = billingRows?.find((b) => b.tenant_id === tenant.id);
  if (!billing) continue;

  const trial =
    billing.trial_ends_at && new Date(billing.trial_ends_at).getTime() > Date.now();
  const finalAmount = trial ? 0 : Number(billing.monthly_price ?? 149.9);
  const status = trial ? "waived" : "pending";

  const payload = {
    tenant_id: tenant.id,
    period_start: periodStart,
    period_end: periodEnd,
    billing_model: billing.billing_model,
    plan: billing.plan,
    gross_sales: 0,
    order_count: 0,
    revenue_share_percent: null,
    calculated_amount: finalAmount,
    final_amount: finalAmount,
    status,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from("tenant_billing_invoices")
    .select("id, status")
    .eq("tenant_id", tenant.id)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (existing?.status === "paid") continue;

  if (existing?.id) {
    await admin.from("tenant_billing_invoices").update(payload).eq("id", existing.id);
    updated += 1;
  } else {
    await admin.from("tenant_billing_invoices").insert(payload);
    created += 1;
  }
  console.log(`  ${tenant.slug}: R$ ${finalAmount.toFixed(2)} (${status})`);
}

console.log(`\nFaturas: ${created} criada(s), ${updated} atualizada(s)`);
