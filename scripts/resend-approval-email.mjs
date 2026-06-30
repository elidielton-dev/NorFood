#!/usr/bin/env node
/**
 * Reenvia e-mail de aprovação para o owner de um restaurante.
 * Uso: node scripts/resend-approval-email.mjs [slug-ou-tenant-id]
 */
import { createClient } from "@supabase/supabase-js";

try {
  const { injectDeployEnv } = await import("./load-deploy-env.mjs");
  injectDeployEnv();
} catch {
  // container de produção ou execução sem scripts locais
}

const target = process.argv[2]?.trim();

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.RESEND_API_KEY?.trim();
const from = process.env.PLATFORM_EMAIL_FROM?.trim() ?? "Norfood <cadastro@norfood.com.br>";
const appUrl = (process.env.PUBLIC_APP_URL ?? "https://norfood.com.br").replace(/\/$/, "");

if (!url || !service) throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
if (!apiKey) throw new Error("Faltam RESEND_API_KEY");

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let tenant;
if (!target) {
  const { data, error: listError } = await admin
    .from("tenants")
    .select("id, name, slug, status")
    .in("status", ["trial", "active"])
    .neq("slug", "norfood")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (listError) throw listError;
  tenant = data;
  if (!tenant) throw new Error("Nenhum restaurante trial/active encontrado. Informe o slug.");
  console.log("Usando restaurante mais recente:", tenant.slug);
} else {
  const isUuid = /^[0-9a-f-]{36}$/i.test(target);
  const { data, error } = await admin
    .from("tenants")
    .select("id, name, slug, status")
    .eq(isUuid ? "id" : "slug", target)
    .maybeSingle();
  if (error) throw error;
  tenant = data;
}

if (!tenant) throw new Error("Restaurante não encontrado.");
if (!["trial", "active"].includes(tenant.status)) {
  throw new Error(`Restaurante está com status "${tenant.status}" — só reenviamos para trial/active.`);
}

const { data: link } = await admin
  .from("tenant_users")
  .select("user_id")
  .eq("tenant_id", tenant.id)
  .eq("role", "owner")
  .eq("status", "active")
  .maybeSingle();

if (!link?.user_id) throw new Error("Owner não encontrado para este restaurante.");

const { data: userData } = await admin.auth.admin.getUserById(link.user_id);
const email = userData.user?.email?.trim();
if (!email) throw new Error("E-mail do owner não encontrado.");

const ownerName =
  userData.user?.user_metadata?.nome ??
  userData.user?.user_metadata?.name ??
  userData.user?.user_metadata?.full_name ??
  email.split("@")[0];

const painelUrl = `${appUrl}/t/${tenant.slug}/dashboard`;
const lojaUrl = `${appUrl}/loja/${tenant.slug}`;
const subject = `Seu restaurante ${tenant.name} está ativo!`;
const html = `
  <p>Olá, ${ownerName}!</p>
  <p>Boas notícias: o cadastro de <strong>${tenant.name}</strong> foi aprovado e já está ativo.</p>
  <p><a href="${painelUrl}">Acessar painel</a></p>
  <p>Sua loja online: <a href="${lojaUrl}">${lojaUrl}</a></p>
  <p>Você tem 14 dias de trial para explorar todos os recursos.</p>
  <p>Equipe Norfood</p>
`;

console.log(`Reenviando e-mail de aprovação para ${tenant.slug} (${tenant.status})...`);

const response = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from,
    to: [email],
    subject,
    html,
    text: `${subject} ${painelUrl}`,
  }),
});

const body = await response.text();
if (!response.ok) {
  console.error("Falha Resend:", body);
  process.exit(1);
}

console.log("E-mail reenviado com sucesso.", body);
