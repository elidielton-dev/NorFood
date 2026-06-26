#!/usr/bin/env node
/** Testa envio Meta com token salvo em waba_config */

import crypto from "node:crypto";
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

const TO = process.env.WABA_TEST_TO ?? "558781189176";
const TEXT = process.env.WABA_TEST_TEXT ?? "Teste envio painel Abelha";

async function main() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: cfg } = await db
    .from("waba_config")
    .select("*")
    .eq("workspace_id", "default")
    .single();

  const [ivHex, ctHex, tagHex] = cfg.access_token.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.ENCRYPTION_KEY, "hex"),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const token = decipher.update(ctHex, "hex", "utf8") + decipher.final("utf8");

  const verify = await fetch(
    `https://graph.facebook.com/v21.0/${cfg.phone_number_id}?fields=display_phone_number`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const verifyJson = await verify.json();
  console.log("Token:", verify.ok ? "OK" : verifyJson.error?.message ?? verify.status);

  const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.phone_number_id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: TO,
      type: "text",
      text: { body: TEXT },
    }),
  });
  const json = await res.json();
  console.log("Send para", TO + ":", res.status, JSON.stringify(json));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
