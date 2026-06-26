#!/usr/bin/env node
/** Lista contatos/conversas waba para diagnóstico */

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

  const { data: contacts } = await db
    .from("waba_contacts")
    .select("id, phone, phone_normalized, name, updated_at")
    .order("updated_at", { ascending: false });

  console.log("=== Contatos ===");
  for (const c of contacts ?? []) {
    console.log(`- ${c.name} | phone=${c.phone} | norm=${c.phone_normalized}`);
  }

  const { data: convs } = await db
    .from("waba_conversations")
    .select("id, last_message_text, last_message_at, contact:waba_contacts(name, phone)")
    .order("last_message_at", { ascending: false });

  console.log("\n=== Conversas ===");
  for (const cv of convs ?? []) {
    const ct = cv.contact;
    const { count } = await db
      .from("waba_messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", cv.id);
    console.log(
      `- ${ct?.name} (${ct?.phone}) | msgs=${count} | last="${cv.last_message_text?.slice(0, 30)}" @ ${cv.last_message_at}`,
    );
  }

  const elton = (contacts ?? []).filter(
    (c) =>
      String(c.phone).includes("81189176") ||
      String(c.name ?? "").toLowerCase().includes("elton"),
  );
  if (elton.length) {
    console.log("\n=== Mensagens Elton (últimas 10) ===");
    for (const c of elton) {
      const { data: conv } = await db
        .from("waba_conversations")
        .select("id")
        .eq("contact_id", c.id)
        .maybeSingle();
      if (!conv) continue;
      const { data: msgs } = await db
        .from("waba_messages")
        .select("sender_type, content_text, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(10);
      console.log(`\n${c.name} (${c.phone}):`);
      for (const m of msgs ?? []) {
        console.log(`  [${m.sender_type}] ${m.content_text} (${m.created_at})`);
      }
    }
  }
}

main().catch(console.error);
