#!/usr/bin/env node
/**
 * Valida MP Checkout/Pix para fatura pending (demo-restaurante).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
const lastDay = new Date(year, month, 0).getDate();
const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

console.log("=== Validação MP fatura pending ===\n");

const { data: tenant } = await admin
  .from("tenants")
  .select("id, slug, name")
  .eq("slug", "demo-restaurante")
  .single();
if (!tenant) throw new Error("Tenant demo-restaurante não encontrado");

const { data: invoice } = await admin
  .from("tenant_billing_invoices")
  .select("*")
  .eq("tenant_id", tenant.id)
  .eq("period_start", periodStart)
  .eq("period_end", periodEnd)
  .maybeSingle();

if (!invoice) throw new Error("Fatura pending não encontrada");
console.log("Fatura:", invoice.id);
console.log("Valor:", invoice.final_amount, "Status:", invoice.status);

if (invoice.status !== "pending" || Number(invoice.final_amount) <= 0) {
  throw new Error("Esperava fatura pending com valor > 0");
}

const token = env.MP_ACCESS_TOKEN?.trim();
if (!token) throw new Error("MP_ACCESS_TOKEN ausente");

const me = await fetch("https://api.mercadopago.com/users/me", {
  headers: { Authorization: `Bearer ${token}` },
});
console.log("\nMP /users/me:", me.status, me.ok ? (await me.json()).nickname : await me.text());

const preference = await fetch("https://api.mercadopago.com/checkout/preferences", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Idempotency-Key": randomUUID(),
  },
  body: JSON.stringify({
    external_reference: `norfood-billing:${invoice.id}`,
    notification_url: `${BASE}/api/mercado-pago/webhook`,
    statement_descriptor: "NORFOOD",
    items: [
      {
        id: invoice.id,
        title: "Norfood Pro — teste validação",
        quantity: 1,
        unit_price: Number(invoice.final_amount),
        currency_id: "BRL",
      },
    ],
    payer: { email: "eltnxz@gmail.com" },
  }),
});

const prefBody = await preference.json();
if (!preference.ok) {
  console.error("MP preference FAIL:", preference.status, prefBody);
  process.exit(1);
}

console.log("\nMP Checkout preference: OK");
console.log("  preference_id:", prefBody.id);
console.log("  init_point:", prefBody.init_point ? "sim" : "não");

const pix = await fetch("https://api.mercadopago.com/v1/payments", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Idempotency-Key": randomUUID(),
  },
  body: JSON.stringify({
    transaction_amount: Number(invoice.final_amount),
    description: "Norfood validação Pix",
    payment_method_id: "pix",
    external_reference: `norfood-billing:${invoice.id}`,
    notification_url: `${BASE}/api/mercado-pago/webhook`,
    payer: { email: "eltnxz@gmail.com" },
  }),
});

const pixBody = await pix.json();
if (!pix.ok) {
  console.error("MP Pix FAIL:", pix.status, pixBody);
  process.exit(1);
}

console.log("\nMP Pix payment: OK");
console.log("  payment_id:", pixBody.id);
console.log("  status:", pixBody.status);
console.log("  qr_code:", pixBody.point_of_interaction?.transaction_data?.qr_code ? "sim" : "não");

console.log("\n=== Validação MP fatura: OK ===");
console.log("No admin: demo-restaurante deve mostrar MP Checkout / MP Pix.");
