#!/usr/bin/env node
/**
 * Suspende tenants com trial expirado e fatura em aberto.
 * Uso: node scripts/enforce-trial-billing.mjs
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

function isInTrial(trialEndsAt) {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() > Date.now();
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, "deploy/.env")) };
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SERVICE_ROLE ausente");

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("=== Enforce trial / billing suspensions ===");
const now = new Date().toISOString();

const { data: billings, error } = await admin
  .from("tenant_billing")
  .select("tenant_id, trial_ends_at, payment_status, signup_payment_verified_at")
  .lt("trial_ends_at", now);
if (error) throw error;

let suspended = 0;
let markedOverdue = 0;

for (const billing of billings ?? []) {
  if (isInTrial(billing.trial_ends_at)) continue;

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, status")
    .eq("id", billing.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.status === "suspended") continue;

  const { data: paidInvoice } = await admin
    .from("tenant_billing_invoices")
    .select("id")
    .eq("tenant_id", billing.tenant_id)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();

  const needsPayment = !paidInvoice && billing.payment_status !== "active";

  if (needsPayment || billing.payment_status === "overdue") {
    await admin
      .from("tenant_billing")
      .update({ payment_status: "overdue", updated_at: now })
      .eq("tenant_id", billing.tenant_id);
    markedOverdue += 1;

    await admin
      .from("tenants")
      .update({ status: "suspended", updated_at: now })
      .eq("id", billing.tenant_id);
    suspended += 1;
  }
}

console.log(`Suspensos: ${suspended}, marcados overdue: ${markedOverdue}`);
