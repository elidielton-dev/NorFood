#!/usr/bin/env node
/**
 * Compara Evolution findChats/findMessages vs Supabase (espelho WhatsApp Web).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

const REFERENCE_CONTACTS = [
  { label: "Amor", terms: ["amor"], jidHints: [] },
  { label: "maykonvrumvrum", terms: ["maykon"], jidHints: ["558781541408"] },
  { label: "Guilherme/Mayconn", terms: ["guilherme", "mayconn", "mayconn.cortes"] },
  { label: "Nataly Salvador", terms: ["nataly"], jidHints: ["204728323547223"] },
];

const AMOR_MSGS = ["ohhhh", "tenta dormir", "amor"];
const failures = [];
const rows = [];

function normalizeSearch(value) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function parseEvolutionChat(data) {
  const remoteJid = String(data.remoteJid ?? data.id ?? "");
  const name =
    typeof data.name === "string"
      ? data.name
      : typeof data.pushName === "string"
        ? data.pushName
        : null;
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
  return "";
}

function extractMessageTime(raw) {
  const ts = Number(raw.messageTimestamp ?? 0);
  return ts ? new Date(ts * 1000).toISOString() : "";
}

async function evolution(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { apikey: apiKey, "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: response.ok, body };
}

async function supabaseGet(path) {
  if (!supabaseUrl || !supabaseKey) return { ok: false, body: [] };
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  const body = response.ok ? await response.json() : [];
  return { ok: response.ok, body };
}

function findChatsByTerms(chatList, terms, jidHints = []) {
  return chatList.filter((c) => {
    const hay = normalizeSearch([c.name, c.remoteJid, c.lastMessage].join(" "));
    if (terms.some((t) => hay.includes(normalizeSearch(t)))) return true;
    if (jidHints.some((hint) => c.remoteJid.includes(hint))) return true;
    return false;
  });
}

async function fetchEvolutionMessages(remoteJid, limit = 5) {
  const res = await evolution(`/chat/findMessages/${instance}`, {
    method: "POST",
    body: JSON.stringify({ where: { key: { remoteJid } }, limit: 20 }),
  });
  const list = Array.isArray(res.body)
    ? res.body
    : res.body?.messages?.records ?? res.body?.records ?? [];
  return list
    .map((raw) => ({ body: extractMessageBody(raw), sentAt: extractMessageTime(raw) }))
    .filter((m) => m.body)
    .slice(-limit);
}

async function main() {
  if (!apiKey) {
    console.error("EVOLUTION_API_KEY required");
    process.exit(1);
  }

  console.log("Fetching Evolution findChats...");
  const chatsRes = await evolution(`/chat/findChats/${instance}`, { method: "POST", body: "{}" });
  const rawChats = Array.isArray(chatsRes.body) ? chatsRes.body : [];
  const cutoff = daysAgo(retentionDays);
  const chatList = rawChats
    .map((raw) => parseEvolutionChat(raw))
    .filter((c) => c.remoteJid && !c.remoteJid.endsWith("@g.us"))
    .filter((c) => !c.lastMessageAt || new Date(c.lastMessageAt) >= cutoff);

  console.log(`Evolution chats (7d): ${chatList.length}\n`);

  for (const ref of REFERENCE_CONTACTS) {
    const matchesIn7d = findChatsByTerms(chatList, ref.terms, ref.jidHints);
    const matchesAll = findChatsByTerms(
      rawChats.map((raw) => parseEvolutionChat(raw)),
      ref.terms,
      ref.jidHints,
    );
    const matches = matchesIn7d.length > 0 ? matchesIn7d : matchesAll;
    if (matches.length === 0) {
      rows.push({
        label: ref.label,
        remoteJid: "—",
        nomeEvolution: "—",
        nomeSupabase: "—",
        msgsEvolution: "—",
        msgsSupabase: "—",
        match: "WARN — not in findChats",
      });
      continue;
    }

    for (const chat of matches.slice(0, 2)) {
      const evoMsgs = await fetchEvolutionMessages(chat.remoteJid, 5);
      const evoPreview = evoMsgs.map((m) => m.body.slice(0, 30)).join(" | ") || "—";

      const sbChat = await supabaseGet(
        `whatsapp_chats?select=id,name,remote_jid&remote_jid=eq.${encodeURIComponent(chat.remoteJid)}&limit=1`,
      );
      const sbRow = Array.isArray(sbChat.body) ? sbChat.body[0] : null;
      const sbName = sbRow?.name ?? "—";
      const chatId = sbRow?.id;

      let sbPreview = "—";
      if (chatId) {
        const sbMsgs = await supabaseGet(
          `whatsapp_messages?select=body,sent_at&chat_id=eq.${chatId}&order=sent_at.desc&limit=5`,
        );
        const list = Array.isArray(sbMsgs.body) ? sbMsgs.body : [];
        sbPreview = list.map((m) => String(m.body ?? "").slice(0, 30)).join(" | ") || "—";
      }

      const nameMatch = normalizeSearch(sbName) === normalizeSearch(chat.name ?? "") || sbName === "—";
      const msgsMatch =
        sbPreview === "—" ||
        evoPreview === "—" ||
        normalizeSearch(sbPreview) === normalizeSearch(evoPreview) ||
        evoMsgs.filter((em) => em.body).every((em) =>
          sbPreview.split(" | ").some((sm) => normalizeSearch(sm).includes(normalizeSearch(em.body.slice(0, 12)))),
        );

      const hasAmorLeak =
        ref.label.includes("Nataly") &&
        sbPreview.split(" | ").some((sm) => ["ohhhh", "tenta dormir"].includes(normalizeSearch(sm.trim())));
      if (hasAmorLeak) {
        failures.push(`CRITICAL: Amor messages leaked into ${ref.label} Supabase chat`);
      }

      const match = hasAmorLeak ? "FAIL" : nameMatch && msgsMatch ? "OK" : msgsMatch ? "OK" : "WARN";
      if (match === "FAIL" || (match === "WARN" && ref.label.includes("Nataly"))) {
        if (match === "FAIL") failures.push(`${ref.label} (${chat.remoteJid}): critical leak`);
        else if (!msgsMatch) failures.push(`${ref.label} (${chat.remoteJid}): partial msg drift`);
      }

      rows.push({
        label: ref.label,
        remoteJid: chat.remoteJid,
        nomeEvolution: chat.name ?? "—",
        nomeSupabase: sbName,
        msgsEvolution: evoPreview,
        msgsSupabase: sbPreview,
        match,
      });
    }
  }

  // Cross-contamination: Amor msgs in Nataly chat
  const natalyRow = rows.find((r) => r.remoteJid.includes("@lid") && normalizeSearch(r.label).includes("nataly"));
  const amorRow = rows.find((r) => normalizeSearch(r.label).includes("amor"));
  if (natalyRow && amorRow && natalyRow.msgsSupabase !== "—" && amorRow.msgsEvolution !== "—") {
    const contaminated = AMOR_MSGS.some(
      (needle) =>
        normalizeSearch(natalyRow.msgsSupabase).includes(normalizeSearch(needle)) &&
        normalizeSearch(amorRow.msgsEvolution).includes(normalizeSearch(needle)),
    );
    if (contaminated) {
      failures.push("CRITICAL: Amor messages appear in Nataly Supabase chat");
      rows.push({
        label: "CROSS-CONTAMINATION",
        remoteJid: `${amorRow.remoteJid} → ${natalyRow.remoteJid}`,
        nomeEvolution: amorRow.nomeEvolution,
        nomeSupabase: natalyRow.nomeSupabase,
        msgsEvolution: amorRow.msgsEvolution,
        msgsSupabase: natalyRow.msgsSupabase,
        match: "FAIL",
      });
    }
  }

  // Messages under wrong chatId (same body, different remote_jid)
  if (supabaseUrl && supabaseKey) {
    const cross = await supabaseGet(
      "whatsapp_messages?select=chat_id,remote_jid,body&body=ilike.*ohhhh*&limit=10",
    );
    const crossList = Array.isArray(cross.body) ? cross.body : [];
    for (const msg of crossList) {
      const chat = await supabaseGet(`whatsapp_chats?select=remote_jid,name&id=eq.${msg.chat_id}&limit=1`);
      const chatRow = Array.isArray(chat.body) ? chat.body[0] : null;
      if (chatRow && chatRow.remote_jid !== msg.remote_jid) {
        failures.push(`Msg remote_jid ${msg.remote_jid} stored under chat ${chatRow.name} (${chatRow.remote_jid})`);
      }
    }
  }

  let md = `# WhatsApp Web vs Supabase — Diff Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `Evolution chats (7d): ${chatList.length}\n\n`;
  md += `| Label | remoteJid | Nome Evolution | Nome Supabase | Msgs Evolution | Msgs Supabase | MATCH |\n`;
  md += `|-------|-----------|----------------|---------------|----------------|---------------|-------|\n`;
  for (const r of rows) {
    md += `| ${r.label} | ${r.remoteJid} | ${r.nomeEvolution} | ${r.nomeSupabase} | ${r.msgsEvolution.slice(0, 60)} | ${r.msgsSupabase.slice(0, 60)} | ${r.match} |\n`;
  }
  md += `\n## Failures\n\n`;
  if (failures.length === 0) md += `None — mirror OK.\n`;
  else failures.forEach((f) => { md += `- ${f}\n`; });

  mkdirSync(join(rootDir, "docs"), { recursive: true });
  writeFileSync(join(rootDir, "docs/whatsapp-web-diff-report.md"), md);
  console.log("\n" + md);
  console.log(`\nReport saved to docs/whatsapp-web-diff-report.md`);
  console.log(`Failures: ${failures.length}`);

  process.exit(failures.some((f) => f.includes("CRITICAL") || f.includes("critical leak")) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
