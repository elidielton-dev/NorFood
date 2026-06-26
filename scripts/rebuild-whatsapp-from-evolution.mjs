#!/usr/bin/env node
/**
 * Reconstrói cache Supabase a partir de findChats + findMessages (espelho WhatsApp Web).
 * Alternativa ao reset total — sobrescreve chats ativos dos últimos 7 dias.
 *
 * Uso: node scripts/rebuild-whatsapp-from-evolution.mjs
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

const baseUrl = (process.env.EVOLUTION_API_URL ?? "http://54.207.185.74:8080").replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = (process.env.EVOLUTION_INSTANCE_NAME ?? "abelha-mel").trim();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const retentionDays = 7;
const ownerDigits = (process.env.WHATSAPP_OWNER_PHONE ?? "558781189176").replace(/\D/g, "");

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function jidToPhone(jid) {
  const digits = String(jid).split("@")[0]?.replace(/\D/g, "") ?? "";
  if (digits.length < 10) return null;
  if (digits.length === 12) return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return digits;
}

function parseEvolutionChat(data) {
  const remoteJid = String(data.remoteJid ?? data.id ?? "");
  const name =
    typeof data.name === "string" ? data.name : typeof data.pushName === "string" ? data.pushName : null;
  const updatedAt = data.updatedAt ?? data.conversationTimestamp;
  const lastMessageAt =
    typeof updatedAt === "number"
      ? new Date(updatedAt * 1000).toISOString()
      : typeof updatedAt === "string"
        ? updatedAt
        : null;
  const lastMessage =
    typeof data.lastMessage === "string"
      ? data.lastMessage
      : typeof data.lastMessage?.message === "string"
        ? data.lastMessage.message
        : null;
  return { remoteJid, name, lastMessage, lastMessageAt };
}

function extractMessageBody(raw) {
  const msg = raw.message ?? {};
  if (typeof msg.conversation === "string") return msg.conversation;
  if (msg.extendedTextMessage?.text) return String(msg.extendedTextMessage.text);
  return null;
}

async function evolution(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { apikey: apiKey, "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function supabase(method, path, body) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "resolution=merge-duplicates,return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`${method} ${path}: ${await response.text()}`);
  }
  if (method === "GET") {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  if (response.status !== 204) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return null;
}

async function main() {
  if (!apiKey || !supabaseUrl || !supabaseKey) {
    console.error("EVOLUTION_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  console.log("Fetching findChats...");
  const rawChats = await evolution(`/chat/findChats/${instance}`, { method: "POST", body: "{}" });
  const cutoff = daysAgo(retentionDays);
  const chats = (Array.isArray(rawChats) ? rawChats : [])
    .map(parseEvolutionChat)
    .filter((c) => c.remoteJid && !c.remoteJid.endsWith("@g.us"))
    .filter((c) => {
      const digits = c.remoteJid.split("@")[0]?.replace(/\D/g, "") ?? "";
      if (digits === ownerDigits) return false;
      return c.lastMessageAt && new Date(c.lastMessageAt) >= cutoff;
    });

  console.log(`Upserting ${chats.length} chats (7d)...`);
  for (const chat of chats) {
    await supabase("POST", "whatsapp_chats?on_conflict=remote_jid", {
      remote_jid: chat.remoteJid,
      name: chat.name,
      phone: jidToPhone(chat.remoteJid),
      last_message: chat.lastMessage,
      last_message_at: chat.lastMessageAt,
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`Syncing messages for ${chats.length} chats...`);
  let synced = 0;
  for (const chat of chats) {
    const rows = await supabase(
      "GET",
      `whatsapp_chats?select=id&remote_jid=eq.${encodeURIComponent(chat.remoteJid)}&limit=1`,
    );
    const chatId = rows?.[0]?.id;
    if (!chatId) continue;

    await supabase("DELETE", `whatsapp_messages?chat_id=eq.${chatId}`);

    const msgPayload = await evolution(`/chat/findMessages/${instance}`, {
      method: "POST",
      body: JSON.stringify({ where: { key: { remoteJid: chat.remoteJid } }, limit: 40 }),
    });
    const msgList = Array.isArray(msgPayload)
      ? msgPayload
      : msgPayload?.messages?.records ?? [];

    for (const raw of msgList) {
      const key = raw.key ?? {};
      const body = extractMessageBody(raw);
      const waId = String(key.id ?? "");
      const ts = Number(raw.messageTimestamp ?? 0);
      if (!waId || !ts) continue;
      const sentAt = new Date(ts * 1000).toISOString();
      if (new Date(sentAt) < cutoff) continue;

      await supabase("POST", "whatsapp_messages?on_conflict=wa_message_id", {
        chat_id: chatId,
        remote_jid: chat.remoteJid,
        wa_message_id: waId,
        direction: key.fromMe ? "outbound" : "inbound",
        message_type: "text",
        body,
        status: key.fromMe ? "sent" : "delivered",
        sent_at: sentAt,
      });
    }
    synced += 1;
  }

  console.log(`Done. ${synced} chats with messages synced. Run: npm run validate:whatsapp:web`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
