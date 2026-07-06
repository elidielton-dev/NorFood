#!/usr/bin/env node
/**
 * Valida pipeline de conversas: gateway health, webhook Norfood, estado Supabase.
 *
 * Uso:
 *   node scripts/debug-whatsapp-inbox.mjs
 */
if (!process.env.WHATSAPP_GATEWAY_KEY) {
  const { injectDeployEnv } = await import("./load-deploy-env.mjs");
  injectDeployEnv();
}

import { createClient } from "@supabase/supabase-js";

const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const gatewayKey = process.env.WHATSAPP_GATEWAY_KEY ?? "";
const webhookUrl =
  process.env.WHATSAPP_WEBHOOK_URL ??
  (process.env.PUBLIC_APP_URL
    ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, "")}/api/whatsapp/webhook`
    : "http://127.0.0.1:3000/api/whatsapp/webhook");

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function gateway(path, init = {}) {
  const res = await fetch(`${gatewayUrl}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      apikey: gatewayKey,
      Authorization: `Bearer ${gatewayKey}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function main() {
  console.log("=== debug-whatsapp-inbox ===");
  console.log("gateway:", gatewayUrl);
  console.log("webhook:", webhookUrl);

  const health = await gateway("/health");
  console.log("\nGateway /health:", JSON.stringify(health, null, 2));

  const webhookGet = await fetch(webhookUrl, { signal: AbortSignal.timeout(10_000) });
  const webhookBody = await webhookGet.json().catch(() => ({}));
  console.log("\nWebhook GET:", webhookGet.status, JSON.stringify(webhookBody));

  const fakeWaId = `debug-${Date.now()}`;
  const fakeJid = "5587999999999@s.whatsapp.net";
  const webhookPost = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: gatewayKey,
      Authorization: `Bearer ${gatewayKey}`,
    },
    body: JSON.stringify({
      event: "MESSAGES_UPSERT",
      data: {
        type: "notify",
        messages: [
          {
            key: { remoteJid: fakeJid, fromMe: false, id: fakeWaId },
            message: { conversation: "ping debug inbox (ignorar)" },
            messageTimestamp: Math.floor(Date.now() / 1000),
            pushName: "Debug Inbox",
          },
        ],
      },
      apikey: gatewayKey,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const postText = await webhookPost.text();
  console.log("\nWebhook POST simulate notify:", webhookPost.status, postText.slice(0, 200));

  const { data: config } = await admin
    .from("whatsapp_config")
    .select("status, connected_at, phone_number")
    .eq("id", "default")
    .maybeSingle();
  console.log("\nwhatsapp_config:", JSON.stringify(config, null, 2));

  const since = config?.connected_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: chatCount } = await admin
    .from("whatsapp_chats")
    .select("id", { count: "exact", head: true })
    .gte("last_message_at", since);
  const { count: msgCount } = await admin
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", since);

  const { data: recentChats } = await admin
    .from("whatsapp_chats")
    .select("id, name, phone, last_message, last_message_at")
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(5);

  console.log(`\nDesde ${since}:`);
  console.log(`  chats: ${chatCount ?? 0}`);
  console.log(`  mensagens: ${msgCount ?? 0}`);
  console.log("  ultimos chats:", JSON.stringify(recentChats, null, 2));

  const connection = await gateway("/connection");
  console.log("\nGateway /connection:", JSON.stringify(connection, null, 2));

  if (health.json?.connection !== "connected" && connection.json?.state !== "open") {
    console.warn("\nWARN: gateway nao esta connected.");
  }
  if (!webhookGet.ok) {
    console.warn("\nWARN: webhook GET falhou.");
  }

  console.log("\nOK — diagnostico concluido.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
