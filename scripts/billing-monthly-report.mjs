#!/usr/bin/env node
/**
 * Relatório mensal de faturamento Norfood (MRR + % sobre vendas).
 * Uso: node scripts/billing-monthly-report.mjs
 *      node scripts/billing-monthly-report.mjs --year=2026 --month=6
 *      node scripts/billing-monthly-report.mjs --generate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PLANS = { starter: 79.9, pro: 149.9, business: 219.9 };
const REVENUE_SHARE = { percent: 2, min: 49, cap: 497 };
const BILLABLE_STATUSES = ["aberto", "preparando", "pronto", "saiu_entrega", "entregue", "finalizado"];

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

function parseArgs() {
  const args = process.argv.slice(2);
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let generate = false;
  let csv = false;

  for (const arg of args) {
    if (arg === "--generate") generate = true;
    if (arg === "--csv") csv = true;
    if (arg.startsWith("--year=")) year = Number(arg.split("=")[1]);
    if (arg.startsWith("--month=")) month = Number(arg.split("=")[1]);
  }

  return { year, month, generate, csv };
}

function getMonthPeriod(year, month) {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart, periodEnd };
}

function isInTrial(trialEndsAt) {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() > Date.now();
}

function calculateAmount(billing, gross, inTrial) {
  if (inTrial) return { calculated: 0, final: 0 };

  if (billing.billing_model === "monthly") {
    const amount = Number(billing.monthly_price ?? 0);
    return { calculated: amount, final: amount };
  }

  const percent = Number(billing.revenue_share_percent ?? REVENUE_SHARE.percent);
  const min = Number(billing.revenue_share_min ?? REVENUE_SHARE.min);
  const cap = Number(billing.revenue_share_cap ?? REVENUE_SHARE.cap);
  const calculated = Math.round(gross * (percent / 100) * 100) / 100;
  const withMin = Math.max(calculated, min);
  const final = Math.min(withMin, cap);
  return { calculated, final };
}

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function main() {
  const { year, month, generate, csv } = parseArgs();
  const { periodStart, periodEnd } = getMonthPeriod(year, month);

  const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, "deploy/.env")) };
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em deploy/.env");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tenants, error: tenantsError } = await admin
    .from("tenants")
    .select("id, name, slug, status")
    .order("name");
  if (tenantsError) throw tenantsError;

  console.log(`\n=== Norfood Billing — ${periodStart} a ${periodEnd} ===\n`);

  const rows = [];
  let totalMrr = 0;
  let totalRevenueShare = 0;
  let totalDue = 0;

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id;
    const { data: billing } = await admin
      .from("tenant_billing")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const startIso = `${periodStart}T00:00:00.000Z`;
    const endIso = `${periodEnd}T23:59:59.999Z`;
    const { data: orders } = await admin
      .from("pedidos")
      .select("total")
      .eq("tenant_id", tenantId)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .in("status", BILLABLE_STATUSES);

    const gross = (orders ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);
    const orderCount = (orders ?? []).length;
    const trial = billing ? isInTrial(billing.trial_ends_at) : false;
    const amounts = billing ? calculateAmount(billing, gross, trial) : { calculated: 0, final: 0 };

    if (billing?.billing_model === "monthly" && !trial) {
      totalMrr += amounts.final;
    }
    if (billing?.billing_model === "revenue_share" && !trial) {
      totalRevenueShare += amounts.final;
    }
    totalDue += amounts.final;

    const planLabel =
      billing?.billing_model === "monthly"
        ? `${billing.plan} (${formatBRL(Number(billing.monthly_price ?? PLANS[billing.plan] ?? 0))})`
        : billing?.billing_model === "revenue_share"
          ? "2% vendas"
          : "—";

    rows.push({
      tenantId,
      name: tenant.name,
      slug: tenant.slug,
      planLabel,
      gross,
      orderCount,
      due: amounts.final,
      trial,
      billing,
      amounts,
    });

    console.log(
      `${tenant.name.padEnd(28)} | ${planLabel.padEnd(22)} | vendas ${formatBRL(gross).padStart(10)} | devido ${formatBRL(amounts.final).padStart(10)}${trial ? " (trial)" : ""}`,
    );
  }

  console.log("\n--- Resumo ---");
  console.log(`MRR (mensal):        ${formatBRL(totalMrr)}`);
  console.log(`% sobre vendas:      ${formatBRL(totalRevenueShare)}`);
  console.log(`Total a receber:     ${formatBRL(totalDue)}`);
  console.log(`Restaurantes:        ${rows.length}`);

  if (generate) {
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      if (!row.billing) continue;
      const payload = {
        tenant_id: row.tenantId,
        period_start: periodStart,
        period_end: periodEnd,
        billing_model: row.billing.billing_model,
        plan: row.billing.plan,
        gross_sales: row.gross,
        order_count: row.orderCount,
        revenue_share_percent:
          row.billing.billing_model === "revenue_share"
            ? row.billing.revenue_share_percent
            : null,
        calculated_amount: row.amounts.calculated,
        final_amount: row.amounts.final,
        status: row.trial ? "waived" : "pending",
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await admin
        .from("tenant_billing_invoices")
        .select("id, status")
        .eq("tenant_id", row.tenantId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .maybeSingle();

      if (existing?.id) {
        if (existing.status === "paid") continue;
        const { error } = await admin
          .from("tenant_billing_invoices")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await admin.from("tenant_billing_invoices").insert(payload);
        if (error) throw error;
        created += 1;
      }
    }
    console.log(`\nFaturas: ${created} criada(s), ${updated} atualizada(s).`);
  }

  if (csv) {
    const lines = [
      "restaurante,slug,plano,vendas,pedidos,valor_devido,trial",
      ...rows.map(
        (r) =>
          `"${r.name}","${r.slug}","${r.planLabel}",${r.gross.toFixed(2)},${r.orderCount},${r.due.toFixed(2)},${r.trial}`,
      ),
    ];
    const outPath = resolve(root, `billing-report-${year}-${String(month).padStart(2, "0")}.csv`);
    writeFileSync(outPath, lines.join("\n"), "utf8");
    console.log(`\nCSV salvo: ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
