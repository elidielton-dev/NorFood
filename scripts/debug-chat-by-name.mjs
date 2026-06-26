#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(rootDir, ".env"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[trimmed.slice(0, eq).trim()] = value;
}

const term = (process.argv[2] ?? "dennys").toLowerCase();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: chats } = await sb
  .from("whatsapp_chats")
  .select("id, remote_jid, phone, name, last_message_at")
  .ilike("name", `%${term}%`)
  .order("last_message_at", { ascending: false })
  .limit(5);

console.log("=== whatsapp_chats ===");
for (const chat of chats ?? []) {
  console.log(JSON.stringify(chat, null, 2));
}

const { data: waba } = await sb
  .from("waba_contacts")
  .select("id, phone, name")
  .ilike("name", `%${term}%`)
  .limit(5);

console.log("\n=== waba_contacts ===");
for (const contact of waba ?? []) {
  console.log(JSON.stringify(contact, null, 2));
}

if (chats?.[0]?.id) {
  const { data: msgs } = await sb
    .from("whatsapp_messages")
    .select("remote_jid, direction, body, sent_at")
    .eq("chat_id", chats[0].id)
    .order("sent_at", { ascending: false })
    .limit(3);
  console.log("\n=== ultimas mensagens ===");
  for (const msg of msgs ?? []) {
    console.log(JSON.stringify(msg));
  }
}
