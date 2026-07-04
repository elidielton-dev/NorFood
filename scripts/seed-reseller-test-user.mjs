#!/usr/bin/env node
/**
 * Vincula um usuário auth à revendedora (reseller_users) para acessar /parceiro.
 *
 * Uso:
 *   node scripts/seed-reseller-test-user.mjs
 *   node scripts/seed-reseller-test-user.mjs tester@gmail.com "@Elton20!" revenda-teste
 */
import { createClient } from "@supabase/supabase-js";
import { injectDeployEnv } from "./load-deploy-env.mjs";

injectDeployEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.argv[2] ?? "tester@gmail.com").trim().toLowerCase();
const PASSWORD = process.argv[3] ?? "@Elton20!";
const RESELLER_SLUG = process.argv[4] ?? "revenda-teste";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function findUserIdByEmail(email) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  let userId = await findUserIdByEmail(EMAIL);

  if (!userId) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nome: "Revendedor Teste" },
    });
    if (error) throw error;
    userId = created.user.id;
    console.log("Usuario auth criado.");
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password: PASSWORD });
    if (error) throw error;
    console.log("Senha atualizada.");
  }

  let { data: reseller } = await supabase
    .from("resellers")
    .select("id, name, slug, status")
    .eq("slug", RESELLER_SLUG)
    .maybeSingle();

  if (!reseller) {
    const { data: created, error } = await supabase
      .from("resellers")
      .insert({
        name: "Revenda Teste",
        slug: RESELLER_SLUG,
        contact_email: EMAIL,
        status: "active",
        max_tenants: 25,
        allowed_plans: ["starter", "pro"],
        default_trial_days: 14,
      })
      .select("id, name, slug, status")
      .single();
    if (error) throw error;
    reseller = created;
    await supabase.from("reseller_billing").upsert({ reseller_id: reseller.id });
    console.log("Revendedora criada:", reseller.slug);
  } else if (reseller.status !== "active") {
    await supabase.from("resellers").update({ status: "active" }).eq("id", reseller.id);
    reseller = { ...reseller, status: "active" };
    console.log("Revendedora ativada.");
  }

  const { error: linkError } = await supabase.from("reseller_users").upsert(
    {
      reseller_id: reseller.id,
      user_id: userId,
      role: "owner",
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "reseller_id,user_id" },
  );
  if (linkError) throw linkError;

  console.log("");
  console.log("OK — acesso parceiro configurado:");
  console.log(`  E-mail:     ${EMAIL}`);
  console.log(`  Senha:      ${PASSWORD}`);
  console.log(`  Revendedora: ${reseller.name} (${reseller.slug})`);
  console.log(`  Login:      http://localhost:5173/login?redirect=%2Fparceiro`);
  console.log(`  Painel:     http://localhost:5173/parceiro`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
