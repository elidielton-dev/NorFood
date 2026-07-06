#!/usr/bin/env node
/**
 * Reseta whatsapp_config no Supabase e sessao do gateway Baileys.
 *
 * Uso:
 *   node scripts/reset-whatsapp-connection.mjs
 *   node scripts/reset-whatsapp-connection.mjs --full
 *   node scripts/reset-whatsapp-connection.mjs --full --vps-wipe-auth
 *
 * --full            Apaga whatsapp_messages e whatsapp_chats
 * --vps-wipe-auth   Limpa volume /data/auth na VPS e reinicia o gateway
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { injectDeployEnv } from "./load-deploy-env.mjs";

injectDeployEnv();

const args = new Set(process.argv.slice(2));
const fullWipe = args.has("--full");
const vpsWipeAuth = args.has("--vps-wipe-auth");

const host = process.env.NORFOOD_VPS_HOST ?? "ubuntu@15.228.214.190";
const sshKey = resolve(
  process.env.NORFOOD_SSH_KEY ??
    process.env.SSH_KEY ??
    "C:/Users/elidi/Downloads/norfood.pem",
);

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const gatewayKey = process.env.WHATSAPP_GATEWAY_KEY ?? "";

function sshBaseArgs() {
  const base = ["-o", "StrictHostKeyChecking=no"];
  if (existsSync(sshKey)) base.unshift("-i", sshKey);
  return base;
}

function runSsh(label, remoteCmd) {
  console.log(`\n==> ${label}`);
  const result = spawnSync("ssh", [...sshBaseArgs(), host, remoteCmd], {
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${label} falhou (exit ${result.status ?? 1})`);
  }
}

async function gateway(path, init = {}) {
  const res = await fetch(`${gatewayUrl}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      apikey: gatewayKey,
      Authorization: `Bearer ${gatewayKey}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
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

async function wipeWhatsAppInbox() {
  console.log("\n=== Apagar whatsapp_messages e whatsapp_chats (--full) ===");
  const { count: msgBefore } = await admin
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true });
  const { count: chatBefore } = await admin
    .from("whatsapp_chats")
    .select("id", { count: "exact", head: true });
  console.log(`Antes: ${msgBefore ?? 0} mensagens, ${chatBefore ?? 0} chats`);

  const { error: msgError } = await admin
    .from("whatsapp_messages")
    .delete()
    .not("id", "is", null);
  if (msgError) throw msgError;

  const { error: chatError } = await admin.from("whatsapp_chats").delete().not("id", "is", null);
  if (chatError) throw chatError;

  const { count: msgAfter } = await admin
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true });
  const { count: chatAfter } = await admin
    .from("whatsapp_chats")
    .select("id", { count: "exact", head: true });
  console.log(`Depois: ${msgAfter ?? 0} mensagens, ${chatAfter ?? 0} chats`);
}

async function resetWhatsAppConfig() {
  console.log("\n=== Reset whatsapp_config (Supabase) ===");
  const { data: before } = await admin
    .from("whatsapp_config")
    .select("status, phone_number, profile_name, qr_code, provider, connected_at")
    .eq("id", "default")
    .maybeSingle();
  console.log("Antes:", JSON.stringify(before, null, 2));

  const now = new Date().toISOString();
  const { error: waError } = await admin
    .from("whatsapp_config")
    .update({
      status: "disconnected",
      phone_number: null,
      profile_name: null,
      qr_code: null,
      connected_at: null,
      provider: "baileys",
      updated_at: now,
    })
    .eq("id", "default");
  if (waError) throw waError;

  const { error: wabaError } = await admin
    .from("waba_config")
    .update({ active_provider: "baileys", updated_at: now })
    .eq("workspace_id", "default");
  if (wabaError && !/active_provider|does not exist/i.test(wabaError.message)) {
    console.warn("waba_config:", wabaError.message);
  }

  const { data: after } = await admin
    .from("whatsapp_config")
    .select("status, phone_number, profile_name, qr_code, provider, connected_at, updated_at")
    .eq("id", "default")
    .maybeSingle();
  console.log("Depois:", JSON.stringify(after, null, 2));
}

function wipeVpsAuthVolume() {
  runSsh(
    "VPS: limpar volume whatsapp-auth",
    `cd /opt/norfood/deploy && docker compose exec -T whatsapp-gateway sh -c "rm -rf /data/auth/*" && docker compose restart whatsapp-gateway`,
  );
}

async function main() {
  console.log("=== Reset WhatsApp Norfood ===");
  console.log(`full=${fullWipe} vps-wipe-auth=${vpsWipeAuth}`);

  if (fullWipe) {
    await wipeWhatsAppInbox();
  }

  await resetWhatsAppConfig();

  if (vpsWipeAuth) {
    wipeVpsAuthVolume();
    await new Promise((r) => setTimeout(r, 8000));
  }

  console.log("\n=== Reset gateway (/reset) ===");
  const reset = await gateway("/reset", { method: "POST" });
  console.log(JSON.stringify(reset, null, 2));

  console.log("\n=== Estado final ===");
  const health = await gateway("/health");
  const snapshot = await gateway("/connect/qr/snapshot");
  const { count: chatsLeft } = await admin
    .from("whatsapp_chats")
    .select("id", { count: "exact", head: true });
  console.log(
    JSON.stringify({ health, snapshot, chatsRemaining: chatsLeft ?? 0 }, null, 2),
  );
  console.log(
    "\nPronto. Abra o painel (Ctrl+F5), confira Desconectado e clique Gerar QR Code uma vez.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
