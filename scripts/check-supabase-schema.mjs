#!/usr/bin/env node
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { injectDeployEnv } from "./load-deploy-env.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
injectDeployEnv();

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const tables = [
  "waba_config",
  "waba_contacts",
  "waba_automations",
  "whatsapp_chats",
  "whatsapp_config",
  "staff_atendimento_prefs",
];

for (const table of tables) {
  const { error } = await sb.from(table).select("*").limit(1);
  console.log(`${table}:`, error ? `FALHA — ${error.message}` : "ok");
}

const columns = [
  ["whatsapp_chats", "inbox_status"],
  ["whatsapp_chats", "assigned_agent_id"],
  ["whatsapp_chats", "phone_verified_at"],
  ["whatsapp_chats", "profile_pic_phone_digits"],
  ["whatsapp_chats", "attendance_opened_at"],
  ["whatsapp_messages", "reply_to_wa_message_id"],
  ["waba_messages", "reply_to_wa_message_id"],
];

for (const [table, column] of columns) {
  const { error } = await sb.from(table).select(column).limit(1);
  console.log(`${table}.${column}:`, error ? `FALHA — ${error.message}` : "ok");
}
