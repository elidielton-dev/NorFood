#!/usr/bin/env node
/**
 * Reset cache WhatsApp no Supabase (one-time). Mantém whatsapp_config.
 * Uso: node scripts/reset-whatsapp-cache.mjs
 *      CONFIRM=1 node scripts/reset-whatsapp-cache.mjs  (executa delete)
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadDotEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const confirm = process.env.CONFIRM === "1" || process.env.CONFIRM === "true";

async function main() {
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "return=minimal",
  };

  const countMsgs = await fetch(`${url}/rest/v1/whatsapp_messages?select=id&limit=1`, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  const countChats = await fetch(`${url}/rest/v1/whatsapp_chats?select=id&limit=1`, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });

  const msgTotal = countMsgs.headers.get("content-range")?.split("/")[1] ?? "?";
  const chatTotal = countChats.headers.get("content-range")?.split("/")[1] ?? "?";

  console.log(`whatsapp_messages: ~${msgTotal} rows`);
  console.log(`whatsapp_chats: ~${chatTotal} rows`);
  console.log(`whatsapp_config: preserved`);

  if (!confirm) {
    console.log("\nDry run. To delete, run: CONFIRM=1 node scripts/reset-whatsapp-cache.mjs");
    return;
  }

  console.log("\nDeleting whatsapp_messages...");
  const delMsgs = await fetch(`${url}/rest/v1/whatsapp_messages?id=not.is.null`, {
    method: "DELETE",
    headers,
  });
  if (!delMsgs.ok) {
    console.error("Failed messages delete:", await delMsgs.text());
    process.exit(1);
  }

  console.log("Deleting whatsapp_chats (non-group)...");
  const delChats = await fetch(
    `${url}/rest/v1/whatsapp_chats?remote_jid=not.like.*@g.us`,
    { method: "DELETE", headers },
  );
  if (!delChats.ok) {
    console.error("Failed chats delete:", await delChats.text());
    process.exit(1);
  }

  console.log("Done. Run sync full in painel (Atualizar) to rebuild from findChats.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
