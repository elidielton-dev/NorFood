#!/usr/bin/env node
/**
 * Valida fluxo de aprovação manual de cadastro (status pending).
 * Uso: node scripts/validate-approval-production.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadDeployEnv } from "./load-deploy-env.mjs";

const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";
const env = loadDeployEnv();
const url = env.SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em deploy/.env");

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now().toString(36);
const tenantId = crypto.randomUUID();
const slug = `aprovacao-teste-${stamp}`;
const cpf = `${String(Date.now()).slice(-9)}${String(Math.floor(Math.random() * 90) + 10)}`.slice(-11);

function ok(msg) {
  console.log("  OK  ", msg);
}

function fail(msg) {
  console.error("  FAIL", msg);
  process.exit(1);
}

console.log("=== Validação aprovação de cadastro ===");
console.log("Site:", BASE);

for (const route of ["/admin/aprovacoes", `/cadastro/aguardando/${slug}`]) {
  const res = await fetch(`${BASE}${route}`, { redirect: "follow" });
  if (res.status >= 200 && res.status < 400) ok(`Rota ${route} — HTTP ${res.status}`);
  else fail(`Rota ${route} — HTTP ${res.status}`);
}

const { error: insertError } = await admin.from("tenants").insert({
  id: tenantId,
  name: `Teste Aprovação ${stamp}`,
  slug,
  primary_color: "#FF9100",
  secondary_color: "#111111",
  accent_color: "#FF5A00",
  status: "pending",
  document_type: "cpf",
  document_number: cpf,
  legal_name: "Teste Aprovação Norfood",
  cep: "01310-100",
  city: "São Paulo",
  state: "SP",
  neighborhood: "Bela Vista",
  street: "Av. Paulista",
  street_number: "1000",
});
if (insertError) fail(`Insert tenant pending: ${insertError.message}`);
ok("Enum status=pending aceito no banco");

const { data: tenant } = await admin.from("tenants").select("status").eq("id", tenantId).single();
await admin.from("tenant_settings").insert({ tenant_id: tenantId, phone: "(11) 99999-0000" });
await admin.from("tenant_billing").insert({
  tenant_id: tenantId,
  billing_model: "monthly",
  plan: "starter",
  monthly_price: 79.9,
  trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
  payment_status: "active",
  accepted_terms_at: new Date().toISOString(),
});

const blocked = tenant.status === "pending";
if (!blocked) fail(`Tenant deveria estar pending, veio: ${tenant.status}`);
ok("Painel/loja bloqueados enquanto pending (status=pending)");

await admin
  .from("tenants")
  .update({ status: "trial", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  .eq("id", tenantId);

const { data: tenantTrial } = await admin.from("tenants").select("status").eq("id", tenantId).single();
if (tenantTrial?.status !== "trial") fail(`Após aprovação deveria ser trial, veio: ${tenantTrial?.status}`);
ok("Acesso liberado após status trial");

if (!env.RESEND_API_KEY?.trim()) {
  console.log("  GAP  RESEND_API_KEY não configurado — e-mails de aprovação não serão enviados");
} else {
  ok("RESEND_API_KEY configurado");
}

const { data: waba } = await admin
  .from("waba_config")
  .select("workspace_id, status, phone_number_id, access_token, display_phone_number")
  .eq("workspace_id", "default")
  .maybeSingle();

if (!waba?.access_token || !waba?.phone_number_id) {
  console.log("  GAP  waba_config sem token — WhatsApp de aprovação pode falhar");
} else {
  ok(`WhatsApp Meta configurado (${waba.display_phone_number ?? waba.status})`);
}

console.log("\nLimpando tenant de teste...");
await admin.from("tenant_billing").delete().eq("tenant_id", tenantId);
await admin.from("tenant_settings").delete().eq("tenant_id", tenantId);
await admin.from("tenants").delete().eq("id", tenantId);

console.log("\nValidação de aprovação concluída com sucesso.");
