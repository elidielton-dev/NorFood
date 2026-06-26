#!/usr/bin/env node
/**
 * Validacao E2E WhatsApp — identidade, hygiene Supabase, duplicatas, retenção.
 * Complementa validate-whatsapp-full.mjs com cenarios que o script basico nao cobre.
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
    // .env opcional
  }
}

loadDotEnv();

const baseUrl = (process.env.EVOLUTION_API_URL ?? "http://54.207.185.74:8080").replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = (process.env.EVOLUTION_INSTANCE_NAME ?? "abelha-mel").trim();
const contactA = process.env.WHATSAPP_TEST_CONTACT_A ?? process.env.WHATSAPP_TEST_CONTACT ?? "maykon";
const contactB = process.env.WHATSAPP_TEST_CONTACT_B ?? "nataly";
const contactC = process.env.WHATSAPP_TEST_CONTACT_C ?? "558781541408";
const skipSend = process.env.SKIP_SEND === "1" || process.env.SKIP_SEND === "true";
const retentionDays = 7;
const ownerDigits = normalizePhone(process.env.WHATSAPP_OWNER_PHONE ?? "558781189176");

const results = [];
let failed = 0;
let warned = 0;

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeSearch(value) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function record(level, step, ok, ms, detail = "") {
  if (!ok && level === "fail") failed += 1;
  if (!ok && level === "warn") warned += 1;
  results.push({ level, step, ok, ms, detail });
  const tag = ok ? "OK" : level === "warn" ? "WARN" : "FAIL";
  console.log(`[${tag}] ${step} (${ms}ms)${detail ? ` — ${detail}` : ""}`);
}

async function evolution(path, options = {}) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, ms: Date.now() - started, body };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value?.messages?.records) return value.messages.records;
  if (value?.records) return value.records;
  return [];
}

function findContactsByTerm(contactList, term) {
  const normalized = normalizeSearch(term);
  return contactList.filter((c) => {
    const hay = normalizeSearch([c.pushName, c.remoteJid, c.id].join(" "));
    return hay.includes(normalized);
  });
}

async function resolvePhoneFromLidMessages(lidJid) {
  const messages = await evolution(`/chat/findMessages/${instance}`, {
    method: "POST",
    body: JSON.stringify({ where: { key: { remoteJid: lidJid } }, limit: 20 }),
  });
  const msgList = asArray(messages.body);
  for (const raw of msgList) {
    const key = raw?.key ?? {};
    const alt = String(key.remoteJidAlt ?? "");
    if (alt.endsWith("@s.whatsapp.net")) {
      const digits = normalizePhone(alt.split("@")[0]);
      if (digits && digits !== ownerDigits) return { jid: alt, digits, source: "remoteJidAlt" };
    }
  }
  return null;
}

async function validateContactIdentity(label, term, contactList) {
  const started = Date.now();
  const matches = findContactsByTerm(contactList, term);
  if (matches.length === 0) {
    record("fail", `Contato "${label}" (${term})`, false, Date.now() - started, "nao encontrado na Evolution");
    return null;
  }

  const phoneContact = matches.find((c) => String(c.remoteJid ?? "").endsWith("@s.whatsapp.net"));
  const lidContact = matches.find((c) => String(c.remoteJid ?? "").endsWith("@lid"));
  const primary = phoneContact ?? lidContact ?? matches[0];
  const remoteJid = String(primary.remoteJid ?? "");
  let resolved = null;

  if (remoteJid.endsWith("@lid")) {
    resolved = await resolvePhoneFromLidMessages(remoteJid);
  } else {
    resolved = {
      jid: remoteJid,
      digits: normalizePhone(remoteJid.split("@")[0]),
      source: "direct",
    };
  }

  const detail = resolved
    ? `${primary.pushName ?? "?"} | open=${remoteJid} | resolved=${resolved.jid} (${resolved.source})`
    : `${primary.pushName ?? "?"} | open=${remoteJid} | sem telefone resolvido (@lid only)`;

  record(
    resolved || remoteJid.endsWith("@s.whatsapp.net") ? "fail" : "warn",
    `Identidade "${label}"`,
    Boolean(resolved) || remoteJid.endsWith("@s.whatsapp.net"),
    Date.now() - started,
    detail,
  );

  return { primary, resolved, matches };
}

async function validateSupabaseHygiene(headers, url) {
  const cutoff = daysAgo(retentionDays).toISOString();

  const convQuery = `${url}/rest/v1/whatsapp_chats?select=id,name,phone,remote_jid,last_message,last_message_at,first_contact_at,updated_at&last_message_at=gte.${encodeURIComponent(cutoff)}&order=last_message_at.asc&limit=500`;
  const convRes = await fetch(convQuery, { headers });
  const convData = convRes.ok ? await convRes.json() : [];

  const nullMsgInConv = convData.filter((r) => !r.last_message?.trim()).length;
  record(
    "fail",
    "Conversas sem last_message (poluicao)",
    nullMsgInConv === 0,
    0,
    `${nullMsgInConv} chats com last_message_at recente mas sem texto`,
  );

  const firstContactOnly = `${url}/rest/v1/whatsapp_chats?select=id&first_contact_at=gte.${encodeURIComponent(cutoff)}&last_message_at=is.null&limit=1`;
  const fcRes = await fetch(firstContactOnly, { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } });
  const fcRange = fcRes.headers.get("content-range") ?? "0-0/0";
  const fcCount = Number(fcRange.split("/")[1] ?? 0);
  record(
    "warn",
    "Agenda-only com first_contact_at recente",
    fcCount === 0,
    0,
    `${fcCount} contatos importados sem mensagem na aba Conversas (deve ser 0 apos fix)`,
  );

  const lidRes = await fetch(
    `${url}/rest/v1/whatsapp_chats?select=id,remote_jid,name,phone&remote_jid=like.*@lid&limit=200`,
    { headers },
  );
  const lidRows = lidRes.ok ? await lidRes.json() : [];
  let lidUnresolved = 0;
  for (const row of lidRows) {
    const hasPhone = Boolean(normalizePhone(row.phone));
    if (!hasPhone) lidUnresolved += 1;
  }
  record(
    "warn",
    "@lid sem telefone salvo",
    lidUnresolved < lidRows.length,
    0,
    `${lidUnresolved}/${lidRows.length} @lid sem phone no Supabase`,
  );

  const staleUpdated = `${url}/rest/v1/whatsapp_chats?select=id,name,last_message_at,updated_at&updated_at=gte.${encodeURIComponent(cutoff)}&last_message_at=lt.${encodeURIComponent(cutoff)}&limit=20`;
  const staleRes = await fetch(staleUpdated, { headers });
  const staleRows = staleRes.ok ? await staleRes.json() : [];
  record(
    "warn",
    "Sync mantendo chats antigos (updated_at)",
    staleRows.length === 0,
    0,
    `${staleRows.length} chats com updated_at recente mas last_message_at > ${retentionDays}d`,
  );

  const oldInList = convData
    .filter((r) => r.last_message_at && new Date(r.last_message_at) < daysAgo(retentionDays))
    .slice(0, 20);
  record(
    "fail",
    "Conversas antigas na query 7 dias",
    oldInList.length === 0,
    0,
    oldInList.length
      ? oldInList.map((r) => `${r.name ?? "?"} @ ${r.last_message_at?.slice(0, 10)}`).join("; ")
      : "nenhuma",
  );

  const dupNames = new Map();
  for (const row of convData) {
    const name = (row.name ?? "").trim().toLowerCase();
    if (!name || name === "contato") continue;
    if (!dupNames.has(name)) dupNames.set(name, []);
    dupNames.get(name).push(row.remote_jid);
  }
  const homonyms = [...dupNames.entries()].filter(([, jids]) => jids.length > 1);
  record(
    "warn",
    "Homonimos na lista de conversas",
    homonyms.length === 0,
    0,
    homonyms.length
      ? homonyms.slice(0, 5).map(([n, j]) => `${n}(${j.length} JIDs)`).join("; ")
      : "nenhum",
  );

  const phoneDup = new Map();
  for (const row of convData) {
    const digits = normalizePhone(row.phone ?? row.remote_jid?.split("@")[0]);
    if (!digits) continue;
    if (!phoneDup.has(digits)) phoneDup.set(digits, []);
    phoneDup.get(digits).push(row.id);
  }
  const phoneDups = [...phoneDup.entries()].filter(([, ids]) => ids.length > 1);
  record(
    "fail",
    "Duplicatas por telefone (Supabase)",
    phoneDups.length === 0,
    0,
    phoneDups.length ? phoneDups.slice(0, 3).map(([p, ids]) => `${p}→${ids.length} chats`).join("; ") : "nenhuma",
  );
}

async function validateSendIsolation(contactAData, contactBData) {
  if (skipSend || !contactAData?.resolved || !contactBData?.resolved) {
    record("warn", "Isolamento de envio A vs B", false, 0, "SKIP_SEND ou contato sem telefone resolvido");
    return;
  }

  const digitsA = contactAData.resolved.digits;
  const digitsB = contactBData.resolved.digits;
  if (digitsA === digitsB) {
    record("fail", "Contatos A e B distintos", false, 0, "mesmo telefone resolvido — ajuste WHATSAPP_TEST_CONTACT_*");
    return;
  }

  const tag = `e2e-${Date.now()}`;
  const sendA = await evolution(`/message/sendText/${instance}`, {
    method: "POST",
    body: JSON.stringify({ number: digitsA, text: `${tag}-A` }),
  });
  record("fail", `sendText isolado A (${digitsA})`, sendA.ok, sendA.ms, sendA.ok ? `${tag}-A` : String(sendA.body).slice(0, 80));

  const sendB = await evolution(`/message/sendText/${instance}`, {
    method: "POST",
    body: JSON.stringify({ number: digitsB, text: `${tag}-B` }),
  });
  record("fail", `sendText isolado B (${digitsB})`, sendB.ok, sendB.ms, sendB.ok ? `${tag}-B` : String(sendB.body).slice(0, 80));
}

async function main() {
  if (!apiKey) {
    console.error("Defina EVOLUTION_API_KEY no .env ou no ambiente.");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(" VALIDACAO E2E — WhatsApp Abelha & Mel");
  console.log(`${"=".repeat(72)}`);
  console.log(`Contato A: ${contactA} | B: ${contactB} | C: ${contactC}`);
  console.log(`Envio real: ${skipSend ? "NAO" : "SIM"}`);
  console.log(`${"=".repeat(72)}\n`);

  console.log("--- Gaps do validate:whatsapp:full ---\n");
  const gaps = [
    "Nao testa contatos @lid / resolucao remoteJidAlt",
    "Nao testa isolamento de envio entre 2+ contatos",
    "Nao testa API autenticada do painel (server functions)",
    "Nao detecta conversas poluidas (agenda sem mensagem)",
    "Nao detecta duplicatas por telefone no Supabase",
    "Nao verifica merge silencioso de chatId no envio",
    "Nao valida filtro estrito last_message_at + last_message",
  ];
  for (const gap of gaps) {
    console.log(`  - ${gap}`);
  }
  console.log("");

  console.log("--- Evolution: identidade multi-contato ---\n");

  const contacts = await evolution(`/chat/findContacts/${instance}`, { method: "POST", body: "{}" });
  const contactList = asArray(contacts.body);
  record("fail", "findContacts", contacts.ok && contactList.length > 0, contacts.ms, `${contactList.length} contatos`);

  const dataA = await validateContactIdentity("A", contactA, contactList);
  const dataB = await validateContactIdentity("B", contactB, contactList);
  const dataC = await validateContactIdentity("C", contactC, contactList);

  if (contactA.includes("maykon") || contactA === "maykon") {
    const expected = "558781541408";
    const digits = dataA?.resolved?.digits ?? normalizePhone(dataA?.primary?.remoteJid?.split("@")[0]);
    record(
      "fail",
      "Maykon → 558781541408",
      digits === expected,
      0,
      digits ? `got ${digits}` : "sem resolucao",
    );
  }

  console.log("\n--- Supabase: hygiene ---\n");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    await validateSupabaseHygiene(
      { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      supabaseUrl,
    );
  } else {
    record("warn", "Supabase hygiene", false, 0, "SUPABASE_URL ou SERVICE_ROLE_KEY ausentes");
  }

  console.log("\n--- Envio: isolamento A vs B ---\n");
  await validateSendIsolation(dataA, dataB);

  console.log(`\n${"=".repeat(72)}`);
  console.log(" RESUMO E2E");
  console.log(`${"=".repeat(72)}`);
  console.log(`Total checks : ${results.length}`);
  console.log(`OK           : ${results.filter((r) => r.ok).length}`);
  console.log(`Falhas       : ${failed}`);
  console.log(`Avisos       : ${warned}`);
  console.log(`${"=".repeat(72)}\n`);

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
