#!/usr/bin/env node
/**
 * Admin da PLATAFORMA Norfood (empresas + faturamento) — sem vínculo a restaurante.
 * Uso:
 *   node scripts/setup-platform-admin.mjs
 *   node scripts/setup-platform-admin.mjs eltnxz@gmail.com "@Elton20!" "Elton"
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const EMAIL = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? "eltnxz@gmail.com").trim().toLowerCase();
const PASSWORD = process.argv[3] ?? process.env.ADMIN_PASSWORD ?? "NorfoodAdmin2026!";
const NAME = process.argv[4] ?? "Admin Plataforma Norfood";

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

if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em deploy/.env");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  console.log("=== Admin PLATAFORMA (sem restaurante) ===");
  console.log(`E-mail: ${EMAIL}`);

  let user = await findUserByEmail(EMAIL);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: NAME, phone: "(11) 99999-0000" },
    });
    if (error) throw error;
    user = data.user;
    console.log("✓ Usuário criado no Auth");
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { ...user.user_metadata, name: NAME },
    });
    if (error) throw error;
    console.log("✓ Usuário existente — senha atualizada e e-mail confirmado");
  }

  const userId = user.id;

  await admin.from("profiles").upsert({
    id: userId,
    nome: NAME,
    telefone: "(11) 99999-0000",
    updated_at: new Date().toISOString(),
  });
  console.log("✓ Perfil atualizado");

  const { data: memberships } = await admin
    .from("tenant_users")
    .select("id, tenant_id, role, tenants(slug, name)")
    .eq("user_id", userId);

  if (memberships?.length) {
    console.log("\nRemovendo vínculos com restaurantes:");
    for (const m of memberships) {
      const t = m.tenants;
      console.log(`  - ${t?.slug ?? m.tenant_id} (${m.role})`);
    }
    const { error: delTenantsErr } = await admin.from("tenant_users").delete().eq("user_id", userId);
    if (delTenantsErr) throw delTenantsErr;
    console.log(`✓ ${memberships.length} vínculo(s) tenant_users removido(s)`);
  } else {
    console.log("✓ Nenhum vínculo com restaurante");
  }

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (roles?.length) {
    const { error: delRolesErr } = await admin.from("user_roles").delete().eq("user_id", userId);
    if (delRolesErr) throw delRolesErr;
    console.log(`✓ Roles de painel de restaurante removidas (${roles.map((r) => r.role).join(", ")})`);
  }

  const platformAdmins = (env.PLATFORM_ADMIN_EMAILS ?? env.VITE_PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!platformAdmins.includes(EMAIL)) {
    console.warn(`\nAVISO: ${EMAIL} NÃO está em PLATFORM_ADMIN_EMAILS no deploy/.env.`);
    console.warn("Adicione para acessar /admin:");
    console.warn(`  PLATFORM_ADMIN_EMAILS=${EMAIL}`);
    console.warn(`  VITE_PLATFORM_ADMIN_EMAILS=${EMAIL}`);
  } else {
    console.log("✓ E-mail em PLATFORM_ADMIN_EMAILS (acesso /admin e faturamento)");
  }

  console.log("\n=== Concluído ===");
  console.log(`Login:       ${EMAIL}`);
  console.log(`Senha:       ${PASSWORD}`);
  console.log(`Empresas:    https://norfood.com.br/admin`);
  console.log(`Faturamento: https://norfood.com.br/admin/faturamento`);
  console.log("\nEste e-mail NÃO está vinculado a nenhum restaurante.");
}

main().catch((err) => {
  console.error("\nErro:", err?.message ?? err);
  process.exit(1);
});
