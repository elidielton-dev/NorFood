#!/usr/bin/env node
/** Verifica mensagens agent sem wa_message_id (envio falhou silenciosamente?) */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  try {
    const raw = readFileSync(join(rootDir, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadDotEnv();

async function main() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: elton } = await db
    .from("waba_contacts")
    .select("id, phone, name")
    .eq("phone", "558781189176")
    .maybeSingle();

  if (!elton) {
    console.log("Contato Elton não encontrado");
    return;
  }

  const { data: conv } = await db
    .from("waba_conversations")
    .select("id")
    .eq("contact_id", elton.id)
    .maybeSingle();

  const { data: msgs, error: msgErr } = await db
    .from("waba_messages")
    .select("sender_type, content_text, wa_message_id, status, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(8);

  if (msgErr) {
    console.log("Erro ao ler mensagens:", msgErr.message);
    return;
  }

  console.log("=== Últimas mensagens Elton Rodrigues ===\n");
  for (const m of msgs ?? []) {
    console.log(
      `[${m.sender_type}] "${m.content_text}" | status=${m.status} | ${m.created_at}`,
    );
  }
}

main().catch(console.error);
