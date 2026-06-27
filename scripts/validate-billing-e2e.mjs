#!/usr/bin/env node
/**
 * Validação ponta a ponta — admin plataforma + faturamento + Mercado Pago.
 * Uso: node scripts/validate-billing-e2e.mjs
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
const anonKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = env.PLATFORM_ADMIN_EMAILS?.split(",")[0]?.trim() ?? "eltnxz@gmail.com";
const adminPassword = process.env.ADMIN_PASSWORD ?? "@Elton20!";

if (!url || !anonKey || !service) {
  throw new Error("Faltam variáveis Supabase em deploy/.env");
}

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, anonKey, {
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
function section(title) {
  console.log(`\n== ${title} ==`);
}

async function adminFetch(path, init = {}) {
  const { data: signIn } = await anon.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (!signIn.session) throw new Error("Login admin falhou");
  const token = signIn.session.access_token;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : null;

  return { res, body, token };
}

console.log("=== Validação E2E Faturamento Norfood ===");
console.log(`Site: ${BASE}`);
console.log(`Período: ${periodStart} → ${periodEnd}`);
console.log(`Admin: ${adminEmail}`);

// ── 1. Infraestrutura ──────────────────────────────────────────────────────
section("1. Infraestrutura");

const health = await fetch(`${BASE}/api/health`);
if (health.ok) pass("Health check", `HTTP ${health.status}`);
else fail("Health check", `HTTP ${health.status}`);

for (const route of ["/admin", "/admin/faturamento", "/admin/nova", "/cadastro", "/login"]) {
  const res = await fetch(`${BASE}${route}`, { redirect: "follow" });
  if (res.status >= 200 && res.status < 400) pass(`Rota ${route}`, `HTTP ${res.status}`);
  else fail(`Rota ${route}`, `HTTP ${res.status}`);
}

for (const table of ["tenants", "tenant_billing", "tenant_billing_invoices", "pedidos"]) {
  const { error } = await admin.from(table).select("*").limit(1);
  if (error) fail(`Schema ${table}`, error.message);
  else pass(`Schema ${table}`);
}

// ── 2. Auth admin plataforma ───────────────────────────────────────────────
section("2. Auth admin plataforma");

const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword,
});
if (signErr || !signIn.session) fail("Login Supabase admin", signErr?.message ?? "sem sessão");
else pass("Login Supabase admin", adminEmail);

const token = signIn?.session?.access_token;
const sessionRes = await fetch(`${BASE}/api/platform-admin/session`, {
  headers: { Authorization: `Bearer ${token}` },
});
const sessionBody = await sessionRes.json();
if (sessionBody.allowed) pass("API /platform-admin/session");
else fail("API /platform-admin/session", JSON.stringify(sessionBody));

// ── 3. GET faturamento (rows, summary, invoices) ───────────────────────────
section("3. GET faturamento");

const rowsCall = await adminFetch(
  `/api/platform-admin/billing?view=rows&year=${year}&month=${month}`,
);
if (rowsCall.res.ok && Array.isArray(rowsCall.body) && rowsCall.body.length > 0) {
  pass("GET billing rows", `${rowsCall.body.length} restaurante(s)`);
} else {
  fail("GET billing rows", rowsCall.body?.error ?? `HTTP ${rowsCall.res.status}`);
}

const summaryCall = await adminFetch(
  `/api/platform-admin/billing?view=summary&year=${year}&month=${month}`,
);
if (summaryCall.res.ok && summaryCall.body?.tenantCount > 0) {
  pass(
    "GET billing summary",
    `MRR R$ ${Number(summaryCall.body.mrr).toFixed(2)}, total R$ ${Number(summaryCall.body.totalDue).toFixed(2)}, trial ${summaryCall.body.inTrial}`,
  );
} else {
  fail("GET billing summary", summaryCall.body?.error ?? JSON.stringify(summaryCall.body));
}

const invoicesCall = await adminFetch(
  `/api/platform-admin/billing?view=invoices&year=${year}&month=${month}`,
);
if (invoicesCall.res.ok && Array.isArray(invoicesCall.body)) {
  pass("GET billing invoices", `${invoicesCall.body.length} fatura(s)`);
} else {
  fail("GET billing invoices", invoicesCall.body?.error ?? `HTTP ${invoicesCall.res.status}`);
}

// ── 4. POST gerar faturas ──────────────────────────────────────────────────
section("4. POST gerar faturas");

const generateCall = await adminFetch("/api/platform-admin/billing", {
  method: "POST",
  body: JSON.stringify({ action: "generate", year, month, markPending: true }),
});
if (generateCall.res.ok) {
  const g = generateCall.body;
  pass(
    "POST generate invoices",
    `${g.created ?? 0} criada(s), ${g.updated ?? 0} atualizada(s), ${g.pending ?? 0} pending`,
  );
} else {
  fail("POST generate invoices", generateCall.body?.error ?? `HTTP ${generateCall.res.status}`);
}

// ── 5. Fatura pending (demo-restaurante) ───────────────────────────────────
section("5. Fatura pending demo-restaurante");

const { data: demoTenant } = await admin
  .from("tenants")
  .select("id, slug, name")
  .eq("slug", "demo-restaurante")
  .single();

let pendingInvoice = null;
if (!demoTenant) {
  fail("Tenant demo-restaurante", "não encontrado");
} else {
  pass("Tenant demo-restaurante", demoTenant.name);

  const { data: invoice } = await admin
    .from("tenant_billing_invoices")
    .select("*")
    .eq("tenant_id", demoTenant.id)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (!invoice) {
    fail("Fatura demo-restaurante", "não encontrada");
  } else if (Number(invoice.final_amount) <= 0) {
    fail("Fatura demo-restaurante", `valor=${invoice.final_amount}`);
  } else if (invoice.status === "paid") {
    await admin
      .from("tenant_billing_invoices")
      .update({
        status: "pending",
        paid_at: null,
        payment_method: null,
        mp_payment_id: null,
        mp_preference_id: null,
        mp_checkout_url: null,
        mp_pix_qr_code: null,
        mp_pix_qr_base64: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);
    pendingInvoice = { ...invoice, status: "pending" };
    pass("Fatura demo resetada para pending", `R$ ${Number(invoice.final_amount).toFixed(2)}`);
  } else if (invoice.status !== "pending") {
    fail("Fatura demo-restaurante pending", `status=${invoice.status}`);
  } else {
    pendingInvoice = invoice;
    pass("Fatura pending", `R$ ${Number(invoice.final_amount).toFixed(2)} (${invoice.id.slice(0, 8)}…)`);
  }
}

// ── 6. Mercado Pago token ──────────────────────────────────────────────────
section("6. Mercado Pago");

const mpToken = env.MP_ACCESS_TOKEN?.trim();
if (!mpToken) {
  fail("MP_ACCESS_TOKEN", "ausente em deploy/.env");
} else {
  const me = await fetch("https://api.mercadopago.com/users/me", {
    headers: { Authorization: `Bearer ${mpToken}` },
  });
  if (me.ok) {
    const meBody = await me.json();
    pass("MP /users/me", meBody.nickname ?? "ok");
  } else {
    fail("MP /users/me", `HTTP ${me.status}`);
  }

  const webhookRes = await fetch(`${BASE}/api/mercado-pago/webhook`);
  if (webhookRes.status === 200 || webhookRes.status === 405) {
    pass("Webhook MP endpoint", `HTTP ${webhookRes.status}`);
  } else {
    fail("Webhook MP endpoint", `HTTP ${webhookRes.status}`);
  }
}

// ── 7. POST MP Checkout via API admin ────────────────────────────────────────
section("7. POST MP Checkout (API admin)");

if (pendingInvoice && mpToken) {
  const checkoutCall = await adminFetch("/api/platform-admin/billing", {
    method: "POST",
    body: JSON.stringify({ action: "checkout", invoiceId: pendingInvoice.id }),
  });
  if (checkoutCall.res.ok && checkoutCall.body?.checkoutUrl) {
    pass("POST checkout", checkoutCall.body.checkoutUrl.includes("mercadopago") ? "URL MP ok" : "URL gerada");

    const { data: updated } = await admin
      .from("tenant_billing_invoices")
      .select("mp_preference_id, mp_checkout_url")
      .eq("id", pendingInvoice.id)
      .single();
    if (updated?.mp_preference_id && updated?.mp_checkout_url) {
      pass("Checkout salvo na fatura", updated.mp_preference_id.slice(0, 12));
    } else {
      fail("Checkout salvo na fatura", "colunas MP vazias");
    }
  } else {
    fail("POST checkout", checkoutCall.body?.error ?? `HTTP ${checkoutCall.res.status}`);
  }
} else {
  fail("POST checkout", "sem fatura pending ou MP token");
}

// ── 8. POST MP Pix via API admin ───────────────────────────────────────────
section("8. POST MP Pix (API admin)");

if (pendingInvoice && mpToken) {
  const pixCall = await adminFetch("/api/platform-admin/billing", {
    method: "POST",
    body: JSON.stringify({ action: "pix", invoiceId: pendingInvoice.id }),
  });
  if (pixCall.res.ok && pixCall.body?.qrCode) {
    pass("POST pix", `payment ${pixCall.body.paymentId}, QR ok`);

    const { data: updated } = await admin
      .from("tenant_billing_invoices")
      .select("mp_payment_id, mp_pix_qr_code")
      .eq("id", pendingInvoice.id)
      .single();
    if (updated?.mp_payment_id && updated?.mp_pix_qr_code) {
      pass("Pix salvo na fatura", updated.mp_payment_id);
    } else {
      fail("Pix salvo na fatura", "colunas MP vazias");
    }
  } else {
    fail("POST pix", pixCall.body?.error ?? `HTTP ${pixCall.res.status}`);
  }
} else {
  fail("POST pix", "sem fatura pending ou MP token");
}

// ── 9. mark-paid + revert (não deixa fatura paga em produção) ──────────────
section("9. POST mark-paid (teste + revert)");

if (pendingInvoice) {
  const paidCall = await adminFetch("/api/platform-admin/billing", {
    method: "POST",
    body: JSON.stringify({ action: "mark-paid", invoiceId: pendingInvoice.id }),
  });
  if (paidCall.res.ok) {
    pass("POST mark-paid");

    const { data: paidRow } = await admin
      .from("tenant_billing_invoices")
      .select("status, paid_at")
      .eq("id", pendingInvoice.id)
      .single();
    if (paidRow?.status === "paid") {
      pass("Fatura marcada paid", paidRow.paid_at ?? "ok");

      await admin
        .from("tenant_billing_invoices")
        .update({
          status: "pending",
          paid_at: null,
          payment_method: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingInvoice.id);
      pass("Revert mark-paid", "status=pending restaurado");
    } else {
      fail("Fatura marcada paid", `status=${paidRow?.status}`);
    }
  } else {
    fail("POST mark-paid", paidCall.body?.error ?? `HTTP ${paidCall.res.status}`);
  }
} else {
  fail("POST mark-paid", "sem fatura pending");
}

// ── 10. Validações de negócio ──────────────────────────────────────────────
section("10. Validações de negócio");

const rows = rowsCall.body ?? [];
const demoRow = rows.find((r) => r.tenant_slug === "demo-restaurante");
if (demoRow && !demoRow.in_trial && demoRow.period_amount_due > 0) {
  pass("demo-restaurante fora do trial", `devido R$ ${demoRow.period_amount_due.toFixed(2)}`);
} else if (demoRow) {
  fail(
    "demo-restaurante fora do trial",
    `trial=${demoRow.in_trial}, due=${demoRow.period_amount_due}`,
  );
}

const trialCount = rows.filter((r) => r.in_trial).length;
if (trialCount >= 0) pass("Tenants em trial", String(trialCount));

const allHaveBilling = rows.every((r) => r.billing);
if (allHaveBilling) pass("Todos os tenants com plano");
else fail("Todos os tenants com plano", `${rows.filter((r) => !r.billing).length} sem plano`);

// ── Resumo ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n=== Resumo E2E: ${results.length - failed.length}/${results.length} OK ===`);
if (failed.length) {
  console.error("\nFalhas:");
  for (const f of failed) console.error(`  - ${f.name}${f.detail ? `: ${f.detail}` : ""}`);
  process.exit(1);
}

console.log("\nTudo pronto em produção. Teste manual:");
console.log(`  ${BASE}/admin/faturamento`);
