#!/usr/bin/env node
/**
 * Validação ponta-a-ponta: envio Meta → banco → status
 */

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

function decryptToken(enc) {
  const [ivHex, ctHex, tagHex] = enc.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.ENCRYPTION_KEY, "hex"),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(ctHex, "hex", "utf8") + decipher.final("utf8");
}

function metaSendTarget(phone) {
  let d = String(phone).replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  const m = d.match(/^55(\d{2})9(\d{8})$/);
  if (m) d = `55${m[1]}${m[2]}`;
  const br = d.match(/^55(\d{2})(\d{8})$/);
  if (br) return `55${br[1]}9${br[2]}`;
  return d;
}

async function sendMeta(token, phoneId, to, body) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: cfg } = await db.from("waba_config").select("*").eq("workspace_id", "default").single();
  const token = decryptToken(cfg.access_token);
  const phoneId = cfg.phone_number_id;

  const { data: contact } = await db
    .from("waba_contacts")
    .select("*")
    .eq("phone", "558781189176")
    .maybeSingle();

  const { data: conv } = await db
    .from("waba_conversations")
    .select("id")
    .eq("contact_id", contact.id)
    .single();

  const { data: lastIn } = await db
    .from("waba_messages")
    .select("wa_message_id, content_text, created_at")
    .eq("conversation_id", conv.id)
    .eq("sender_type", "customer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const to = metaSendTarget(contact.phone);
  console.log("=== E2E Envio Meta ===\n");
  console.log("Contato:", contact.name, contact.phone);
  console.log("Enviar para (Meta API):", to);
  console.log("Última inbound:", lastIn?.content_text, lastIn?.wa_message_id?.slice(0, 40));

  const textBody = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: `E2E Abelha ${new Date().toISOString().slice(11, 19)}` },
  };
  if (lastIn?.wa_message_id && !lastIn.wa_message_id.startsWith("wamid.useroi")) {
    textBody.context = { message_id: lastIn.wa_message_id };
  }

  console.log("\n1) Texto com contexto...");
  const t1 = await sendMeta(token, phoneId, to, textBody);
  console.log("   ", t1.status, JSON.stringify(t1.json).slice(0, 300));

  const msgId1 = t1.json?.messages?.[0]?.id;
  if (msgId1) {
    await db.from("waba_messages").insert({
      conversation_id: conv.id,
      sender_type: "agent",
      content_type: "text",
      content_text: textBody.text.body,
      wa_message_id: msgId1,
      status: "sent",
    });
    console.log("   Aguardando status webhook 8s...");
    await sleep(8000);
    const { data: row1 } = await db
      .from("waba_messages")
      .select("status, error_detail")
      .eq("wa_message_id", msgId1)
      .single();
    console.log("   Status no banco:", row1?.status, row1?.error_detail ?? "");
  }

  console.log("\n2) Template hello_world...");
  const t2 = await sendMeta(token, phoneId, to, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: { name: "hello_world", language: { code: "en_US" } },
  });
  console.log("   ", t2.status, JSON.stringify(t2.json).slice(0, 300));

  const msgId2 = t2.json?.messages?.[0]?.id;
  if (msgId2) {
    await db.from("waba_messages").insert({
      conversation_id: conv.id,
      sender_type: "agent",
      content_type: "template",
      content_text: "[hello_world]",
      wa_message_id: msgId2,
      status: "sent",
      template_name: "hello_world",
    });
    await sleep(8000);
    const { data: row2 } = await db
      .from("waba_messages")
      .select("status")
      .eq("wa_message_id", msgId2)
      .single();
    console.log("   Status no banco:", row2?.status);
  }

  console.log("\n=== Fim — confira WhatsApp do Elton ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
