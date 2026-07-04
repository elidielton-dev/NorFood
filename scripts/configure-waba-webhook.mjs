#!/usr/bin/env node
/**
 * Inscreve webhook WhatsApp na Meta (campo messages) via Graph API.
 * Requer META_APP_ID e META_APP_SECRET no .env.
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

const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const CALLBACK =
  process.env.WABA_WEBHOOK_URL ?? "https://norfood.com.br/api/waba/webhook";
const VERIFY = process.env.WABA_VERIFY_TOKEN ?? "norfood-waba-2026";
const FIELDS =
  process.env.WABA_WEBHOOK_FIELDS ??
  "messages,history,smb_app_state_sync,smb_message_echoes";

async function main() {
  if (!APP_ID || !APP_SECRET) {
    console.error("FAIL: defina META_APP_ID e META_APP_SECRET no .env");
    process.exit(1);
  }

  const appToken = `${APP_ID}|${APP_SECRET}`;
  console.log("=== Configurar webhook Meta ===\n");
  console.log("App ID:", APP_ID);
  console.log("Callback:", CALLBACK);
  console.log("Fields:", FIELDS);
  console.log("Verify token:", VERIFY);

  const params = new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: CALLBACK,
    verify_token: VERIFY,
    fields: FIELDS,
    access_token: appToken,
  });

  const res = await fetch(`https://graph.facebook.com/v21.0/${APP_ID}/subscriptions`, {
    method: "POST",
    body: params,
  });
  const json = await res.json();
  console.log("\nPOST subscriptions:", res.status, JSON.stringify(json));

  if (!res.ok) {
    process.exit(1);
  }

  const list = await fetch(
    `https://graph.facebook.com/v21.0/${APP_ID}/subscriptions?access_token=${encodeURIComponent(appToken)}`,
  );
  const listJson = await list.json();
  console.log("\nSubscriptions atuais:");
  for (const s of listJson.data ?? []) {
    console.log(`  - ${s.object}: ${(s.fields ?? []).join(", ")} → ${s.callback_url ?? "—"}`);
  }

  console.log("\nOK — webhook inscrito. Envie 'Oi' do celular para +1 555 200 9102 e atualize Conversas.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
