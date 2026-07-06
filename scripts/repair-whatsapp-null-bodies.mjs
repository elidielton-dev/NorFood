#!/usr/bin/env node
/**
 * Remove mensagens de texto sem corpo (corrompidas por webhook antigo).
 * Nao recupera o texto — apenas limpa o historico para evitar bolhas vazias.
 *
 * Uso:
 *   node scripts/repair-whatsapp-null-bodies.mjs           # dry-run
 *   node scripts/repair-whatsapp-null-bodies.mjs --apply   # executa delete
 */
import { createClient } from "@supabase/supabase-js";
import { injectDeployEnv } from "./load-deploy-env.mjs";

injectDeployEnv();

const apply = process.argv.includes("--apply");

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error, count } = await admin
    .from("whatsapp_messages")
    .select("id, chat_id, wa_message_id, direction, sent_at", { count: "exact" })
    .eq("message_type", "text")
    .is("body", null)
    .order("sent_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  console.log(`Found ${count ?? data?.length ?? 0} text messages with null body`);
  for (const row of data ?? []) {
    console.log(`- ${row.sent_at} | ${row.direction} | ${row.wa_message_id} | chat=${row.chat_id}`);
  }

  if (!apply) {
    console.log("\nDry-run only. Pass --apply to delete these rows.");
    return;
  }

  const ids = (data ?? []).map((r) => r.id);
  if (ids.length === 0) return;

  const { error: deleteError } = await admin.from("whatsapp_messages").delete().in("id", ids);
  if (deleteError) throw deleteError;
  console.log(`\nDeleted ${ids.length} corrupted message rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
