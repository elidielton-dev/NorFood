#!/usr/bin/env node
/**
 * Cria usuario admin demo no Supabase (painel).
 * Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente ou .env.
 */
import { createClient } from "@supabase/supabase-js";

const NORFOOD_DEMO_TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const DEFAULT_EMAIL = "admin@norfood.local";
const DEFAULT_PASSWORD = "NorfoodAdmin123!";
const DEFAULT_PHONE = "(11) 99999-0000";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ex.: copie .env.example para .env).");
  process.exit(1);
}

const supabase = createClient(url, key);
const email = process.argv[2] ?? DEFAULT_EMAIL;
const password = process.argv[3] ?? DEFAULT_PASSWORD;
const name = process.argv[4] ?? "Admin Demo";

async function main() {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone: DEFAULT_PHONE },
  });

  let userId = created.user?.id;
  if (createError) {
    if (createError.code !== "email_exists") throw createError;
    const { data: listed, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    userId = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!userId) throw createError;

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
    if (updateError) throw updateError;
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    nome: name,
    telefone: DEFAULT_PHONE,
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw profileError;

  const { error: roleError } = await supabase.from("user_roles").upsert({
    user_id: userId,
    role: "admin",
  });
  if (roleError) throw roleError;

  const { error: tenantError } = await supabase.from("tenant_users").upsert({
    tenant_id: NORFOOD_DEMO_TENANT_ID,
    user_id: userId,
    role: "owner",
    status: "active",
  });
  if (tenantError) throw tenantError;

  console.log("Conta admin criada com sucesso:");
  console.log(`  E-mail: ${email}`);
  console.log(`  Senha:  ${password}`);
  console.log(`  Painel: /t/norfood/dashboard`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
