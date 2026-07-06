#!/usr/bin/env node
/**
 * Vincula proprietários faltantes em tenants (teste01, demo-restaurante).
 * Uso: node scripts/fix-missing-tenant-owners.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEMO_RESTAURANT_TENANT_ID = "a0000000-0000-4000-8000-000000000002";
const DEMO_OWNER_EMAIL = process.env.DEMO_RESTAURANT_OWNER_EMAIL ?? "gestor@demo-restaurante.local";
const DEMO_OWNER_PASSWORD = process.env.DEMO_RESTAURANT_OWNER_PASSWORD ?? "DemoRestaurante2026!";
const TESTE01_OWNER_EMAIL = process.env.TESTE01_OWNER_EMAIL ?? "owner-teste01@norfood.local";
const TESTE01_OWNER_PASSWORD = process.env.TESTE01_OWNER_PASSWORD ?? "Teste01Owner2026!";

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
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

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureUser({ email, password, name, phone }) {
  let user = await findUserByEmail(email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome: name, name, phone },
    });
    if (error) throw error;
    user = data.user;
    console.log(`  Criado usuário: ${email}`);
  } else {
    await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    console.log(`  Usuário existente: ${email}`);
  }

  await admin.from("profiles").upsert({
    id: user.id,
    nome: name,
    telefone: phone,
    updated_at: new Date().toISOString(),
  });

  return user;
}

async function linkOwner(tenantId, tenantSlug, userId, email) {
  const { error } = await admin.from("tenant_users").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      role: "owner",
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,user_id,role" },
  );
  if (error) throw error;
  console.log(`  OK owner ${email} → ${tenantSlug}`);
}

async function fixDemoRestaurante() {
  console.log("\n== demo-restaurante ==");
  const user = await ensureUser({
    email: DEMO_OWNER_EMAIL,
    password: DEMO_OWNER_PASSWORD,
    name: "Gestor Demo Restaurante",
    phone: "(11) 99999-0003",
  });
  await linkOwner(DEMO_RESTAURANT_TENANT_ID, "demo-restaurante", user.id, user.email);

  // Remove vínculo legado: mesmo e-mail do norfood não pode ser owner do demo
  const norfoodManager = await findUserByEmail(
    process.env.MANAGER_EMAIL ?? "gestor@norfood.local",
  );
  if (norfoodManager && norfoodManager.id !== user.id) {
    const { error: unlinkError } = await admin
      .from("tenant_users")
      .delete()
      .eq("tenant_id", DEMO_RESTAURANT_TENANT_ID)
      .eq("user_id", norfoodManager.id);
    if (unlinkError) throw unlinkError;
    console.log(`  Removido owner legado ${norfoodManager.email} do demo-restaurante`);
  }
}

async function fixTeste01() {
  console.log("\n== teste01 ==");

  const { data: tenant, error } = await admin
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", "teste01")
    .maybeSingle();
  if (error) throw error;
  if (!tenant) {
    console.log("  Tenant teste01 não encontrado — ignorando.");
    return;
  }

  const { data: anyMembership } = await admin
    .from("tenant_users")
    .select("user_id, role, status")
    .eq("tenant_id", tenant.id);

  if (anyMembership?.length) {
    for (const row of anyMembership) {
      if (row.role === "owner") {
        await admin
          .from("tenant_users")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("tenant_id", tenant.id)
          .eq("user_id", row.user_id)
          .eq("role", "owner");
        const { data: u } = await admin.auth.admin.getUserById(row.user_id);
        console.log(`  Reativado owner existente: ${u.user?.email ?? row.user_id}`);
        return;
      }
    }
  }

  const user = await ensureUser({
    email: TESTE01_OWNER_EMAIL,
    password: TESTE01_OWNER_PASSWORD,
    name: "Owner Teste01",
    phone: "(11) 97777-0001",
  });

  await admin.from("user_roles").upsert(
    { user_id: user.id, role: "gerente" },
    { onConflict: "user_id,role" },
  );

  await linkOwner(tenant.id, tenant.slug, user.id, user.email);
  console.log(`  Senha: ${TESTE01_OWNER_PASSWORD}`);
  console.log(`  Painel: /t/teste01/dashboard`);
}

async function verify() {
  console.log("\n== Verificação ==");
  for (const slug of ["demo-restaurante", "teste01"]) {
    const { data: tenant } = await admin.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (!tenant) continue;
    const { data: owners } = await admin
      .from("tenant_users")
      .select("user_id, status")
      .eq("tenant_id", tenant.id)
      .eq("role", "owner")
      .eq("status", "active");
    if (!owners?.length) {
      console.error(`  FAIL ${slug}: ainda sem owner`);
      process.exitCode = 1;
      continue;
    }
    const { data: u } = await admin.auth.admin.getUserById(owners[0].user_id);
    console.log(`  OK ${slug}: ${u.user?.email}`);
  }
}

async function main() {
  console.log("=== Fix owners faltantes ===");
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltam credenciais Supabase em deploy/.env");
  }
  await fixDemoRestaurante();
  await fixTeste01();
  await verify();
  console.log("\nConcluído.");
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
