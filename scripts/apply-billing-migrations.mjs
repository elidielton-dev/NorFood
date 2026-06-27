#!/usr/bin/env node
/**
 * Aplica migrations de billing + correções produção.
 * Uso: node scripts/apply-billing-migrations.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const projectRef = env.SUPABASE_PROJECT_ID;

if (!url || !key) throw new Error("SUPABASE_URL e SERVICE_ROLE obrigatórios");

async function columnExists(admin, table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return !error;
}

async function applySql(sql) {
  const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (response.ok) return "exec_sql";

  if (accessToken && projectRef) {
    const mgmt = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (mgmt.ok) return "management_api";
    throw new Error(`management_api: ${mgmt.status} ${await mgmt.text()}`);
  }

  throw new Error(`exec_sql: ${response.status} ${await response.text()}`);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const mpMigration = readFileSync(
  resolve(root, "supabase/migrations/20260627120000_tenant_billing_mercadopago.sql"),
  "utf8",
);

if (await columnExists(admin, "tenant_billing_invoices", "mp_payment_id")) {
  console.log("SKIP MP migration: colunas já existem.");
} else {
  console.log("Aplicando migration Mercado Pago...");
  const via = await applySql(mpMigration);
  console.log(`OK migration MP (${via})`);
  if (!(await columnExists(admin, "tenant_billing_invoices", "mp_payment_id"))) {
    throw new Error(
      "Migration MP não aplicada. Rode supabase/migrations/20260627120000_tenant_billing_mercadopago.sql no SQL Editor.",
    );
  }
}

// Backfill billing teste01
const { data: teste01 } = await admin.from("tenants").select("id").eq("slug", "teste01").maybeSingle();
if (teste01?.id) {
  const { data: existing } = await admin
    .from("tenant_billing")
    .select("tenant_id")
    .eq("tenant_id", teste01.id)
    .maybeSingle();
  if (!existing) {
    await admin.from("tenant_billing").insert({
      tenant_id: teste01.id,
      billing_model: "monthly",
      plan: "pro",
      monthly_price: 149.9,
      trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      accepted_terms_at: new Date().toISOString(),
    });
    console.log("OK billing backfill teste01");
  }
}

console.log("Billing migrations concluídas.");
