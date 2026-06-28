#!/usr/bin/env node
/**
 * Grava credenciais Meta em waba_config (Supabase).
 * Uso (nao commitar token):
 *   $env:WABA_ACCESS_TOKEN="..."; node scripts/setup-waba-meta.mjs
 */

import crypto from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { injectDeployEnv } from "./load-deploy-env.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
injectDeployEnv();

const PHONE_NUMBER_ID = process.env.WABA_PHONE_NUMBER_ID ?? "1177941225399615";
const WABA_ID = process.env.WABA_WABA_ID ?? "1323860869938811";
const ACCESS_TOKEN = process.env.WABA_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.WABA_VERIFY_TOKEN ?? "abelha-mel-2026";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKSPACE_ID = "default";

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(ENCRYPTION_KEY, "hex"), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}:${cipher.getAuthTag().toString("hex")}`;
}

async function verifyPhoneNumber(phoneNumberId, accessToken) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=id,display_phone_number,verified_name`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta verify failed ${res.status}: ${body}`);
  }
  return res.json();
}

async function subscribeWaba(wabaId, accessToken) {
  const url = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WABA subscribe failed ${res.status}: ${body}`);
  }
}

async function main() {
  if (!ACCESS_TOKEN) {
    console.error("Defina WABA_ACCESS_TOKEN no newline-free");
    process.exit(1);
  }
  if (!ENCRYPTION_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Faltam ENCRYPTION_KEY, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env");
    process.exit(1);
  }

  console.log("Verificando token na Meta...");
  const info = await verifyPhoneNumber(PHONE_NUMBER_ID, ACCESS_TOKEN);
  console.log("Numero:", info.display_phone_number ?? info.id);

  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
    const dbg = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(ACCESS_TOKEN)}&access_token=${encodeURIComponent(appToken)}`,
    );
    const dbgJson = await dbg.json();
    const granular = dbgJson.data?.granular_scopes ?? [];
    const hasWaba = granular.some(
      (g) =>
        (g.scope === "whatsapp_business_messaging" || g.scope === "whatsapp_business_management") &&
        Array.isArray(g.target_ids) &&
        g.target_ids.length > 0,
    );
    if (!hasWaba) {
      console.warn(
        "AVISO: token sem WABA vinculado (target_ids vazio). Gere em WhatsApp → API Setup do app 1478691093569068.",
      );
      console.warn("Envios podem falhar na entrega até usar token correto.");
    } else {
      console.log("OK token vinculado ao WABA:", granular.flatMap((g) => g.target_ids ?? []).join(", "));
    }
  }

  console.log("Inscrevendo WABA no app...");
  await subscribeWaba(WABA_ID, ACCESS_TOKEN);

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (appId && appSecret) {
    console.log("Inscrevendo webhook (messages)...");
    const webhookUrl =
      process.env.WABA_WEBHOOK_URL ?? "https://abelhaemel.vercel.app/api/waba/webhook";
    const params = new URLSearchParams({
      object: "whatsapp_business_account",
      callback_url: webhookUrl,
      verify_token: VERIFY_TOKEN,
      fields: "messages",
      access_token: `${appId}|${appSecret}`,
    });
    const whRes = await fetch(`https://graph.facebook.com/v21.0/${appId}/subscriptions`, {
      method: "POST",
      body: params,
    });
    const whJson = await whRes.json();
    console.log("Webhook:", whRes.ok ? "OK" : JSON.stringify(whJson));
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const row = {
    workspace_id: WORKSPACE_ID,
    phone_number_id: PHONE_NUMBER_ID,
    waba_id: WABA_ID,
    access_token: encrypt(ACCESS_TOKEN),
    verify_token: encrypt(VERIFY_TOKEN),
    display_phone_number: info.display_phone_number ?? null,
    status: "connected",
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("waba_config").upsert(row, { onConflict: "workspace_id" });
  if (error) {
    console.error("Supabase error:", error.message);
    process.exit(1);
  }

  console.log("OK — waba_config salvo.");
  console.log("Verify token (webhook Meta):", VERIFY_TOKEN);
  console.log("Webhook URL: https://abelhaemel.vercel.app/api/waba/webhook");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
