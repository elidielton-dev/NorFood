#!/usr/bin/env node
/**
 * Une contatos duplicados BR (5587981189176 → 558781189176) numa conversa só.
 */

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

function canonical(phone) {
  let d = String(phone).replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  const m = d.match(/^55(\d{2})9(\d{8})$/);
  if (m) return `55${m[1]}${m[2]}`;
  return d;
}

loadDotEnv();

async function main() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: contacts } = await db.from("waba_contacts").select("*");

  const groups = new Map();
  for (const c of contacts ?? []) {
    const key = canonical(c.phone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => {
      const score = (c) =>
        (c.name && c.name !== c.phone ? 2 : 0) + (String(c.phone) === key ? 1 : 0);
      return score(b) - score(a);
    });
    const keep = list[0];
    const drop = list.slice(1);
    console.log(`Unindo ${drop.map((d) => `${d.name}(${d.phone})`).join(", ")} → ${keep.name}(${keep.phone})`);

    const { data: keepConv } = await db
      .from("waba_conversations")
      .select("id")
      .eq("contact_id", keep.id)
      .maybeSingle();

    for (const dup of drop) {
      const { data: dupConv } = await db
        .from("waba_conversations")
        .select("id, last_message_text, last_message_at, unread_count")
        .eq("contact_id", dup.id)
        .maybeSingle();

      if (dupConv && keepConv) {
        await db
          .from("waba_messages")
          .update({ conversation_id: keepConv.id })
          .eq("conversation_id", dupConv.id);
        await db.from("waba_conversations").delete().eq("id", dupConv.id);
      }

      await db.from("waba_contacts").delete().eq("id", dup.id);
    }

    await db
      .from("waba_contacts")
      .update({ phone: key, name: keep.name ?? "Contato", updated_at: new Date().toISOString() })
      .eq("id", keep.id);

    if (keepConv) {
      const { data: lastMsg } = await db
        .from("waba_messages")
        .select("content_text, created_at")
        .eq("conversation_id", keepConv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastMsg) {
        await db
          .from("waba_conversations")
          .update({
            last_message_text: lastMsg.content_text,
            last_message_at: lastMsg.created_at,
            updated_at: new Date().toISOString(),
          })
          .eq("id", keepConv.id);
      }
    }
  }

  console.log("OK — contatos unificados.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
