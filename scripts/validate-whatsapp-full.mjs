#!/usr/bin/env node
/**
 * Validacao completa WhatsApp — Evolution + producao + qualidade de dados.
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
const testContact = process.env.WHATSAPP_TEST_CONTACT ?? "maykon";
const testMessage = process.env.WHATSAPP_TEST_MESSAGE ?? `validacao ${new Date().toISOString().slice(11, 19)}`;
const skipSend = process.env.SKIP_SEND === "1" || process.env.SKIP_SEND === "true";
const appUrl = (process.env.APP_URL ?? "https://abelhaemel.vercel.app").replace(/\/$/, "");
const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL ?? `${appUrl}/api/whatsapp/webhook`;
const retentionDays = 7;
const slowMs = 8000;

const results = [];
let failed = 0;
let warned = 0;

function record(level, step, ok, ms, detail = "") {
  if (!ok && level === "fail") failed += 1;
  if (!ok && level === "warn") warned += 1;
  results.push({ level, step, ok, ms, detail });
  const tag = ok ? "OK" : level === "warn" ? "WARN" : "FAIL";
  const slow = ms >= slowMs ? " (lento)" : "";
  console.log(`[${tag}] ${step} (${ms}ms)${slow}${detail ? ` — ${detail}` : ""}`);
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

async function http(url, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : text;
    } catch {
      body = text;
    }
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      body,
      headers: response.headers,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      body: error instanceof Error ? error.message : String(error),
      headers: null,
    };
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value?.messages?.records) return value.messages.records;
  if (value?.records) return value.records;
  return [];
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function normalizeSearch(value) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

async function validateSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    record("warn", "Supabase (schema/dados)", false, 0, "SUPABASE_URL ou SERVICE_ROLE_KEY nao definidos — pulando");
    return;
  }

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const tables = ["whatsapp_config", "whatsapp_chats", "whatsapp_messages"];
  for (const table of tables) {
    const started = Date.now();
    const res = await http(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
    record("fail", `Supabase tabela ${table}`, res.ok, Date.now() - started, res.ok ? "acessivel" : String(res.body).slice(0, 120));
  }

  const cutoff = daysAgo(retentionDays).toISOString();
  const chatsRes = await http(
    `${url}/rest/v1/whatsapp_chats?select=id,remote_jid,name,phone,last_message_at&last_message_at=gte.${encodeURIComponent(cutoff)}&order=last_message_at.desc&limit=500`,
    { headers: { ...headers, Prefer: "count=exact" } },
  );
  const chatRows = Array.isArray(chatsRes.body) ? chatsRes.body : [];
  record(
    "fail",
    "Supabase conversas (7 dias)",
    chatsRes.ok,
    chatsRes.ms,
    `${chatRows.length} chats com atividade recente`,
  );

  const agendaRes = await http(
    `${url}/rest/v1/whatsapp_chats?select=id&remote_jid=like.*@s.whatsapp.net`,
    {
      headers: {
        ...headers,
        Prefer: "count=exact",
        Range: "0-0",
      },
    },
  );
  const totalHeader = agendaRes.headers?.get("content-range") ?? "?";
  record(
    "warn",
    "Supabase agenda importada",
    agendaRes.ok && !totalHeader.endsWith("/0"),
    agendaRes.ms,
    totalHeader,
  );

  const maykonRes = await http(
    `${url}/rest/v1/whatsapp_chats?select=id,name,phone,remote_jid,last_message_at&or=(name.ilike.*${encodeURIComponent(testContact)}*,phone.ilike.*${encodeURIComponent(testContact)}*)&limit=5`,
    { headers },
  );
  const maykonRows = Array.isArray(maykonRes.body) ? maykonRes.body : [];
  record(
    maykonRows.length > 0 ? "fail" : "warn",
    `Supabase busca "${testContact}"`,
    maykonRes.ok && maykonRows.length > 0,
    maykonRes.ms,
    maykonRows.length
      ? maykonRows.map((r) => `${r.name ?? "?"} (${r.remote_jid})`).join("; ")
      : "contato ainda nao importado — clique Atualizar no painel",
  );
}

async function main() {
  if (!apiKey) {
    console.error("Defina EVOLUTION_API_KEY no .env ou no ambiente.");
    process.exit(1);
  }
  console.log(`\n${"=".repeat(72)}`);
  console.log(" VALIDACAO COMPLETA — WhatsApp Abelha & Mel");
  console.log(`${"=".repeat(72)}`);
  console.log(`Evolution : ${baseUrl} / ${instance}`);
  console.log(`Producao  : ${appUrl}`);
  console.log(`Webhook   : ${webhookUrl}`);
  console.log(`Contato   : ${testContact}`);
  console.log(`Envio real: ${skipSend ? "NAO (SKIP_SEND)" : "SIM"}`);
  console.log(`${"=".repeat(72)}\n`);

  // --- Producao ---
  console.log("--- Producao (Vercel) ---\n");

  const home = await http(appUrl);
  record("fail", "Site principal", home.ok, home.ms, `HTTP ${home.status}`);

  const webhookGet = await http(webhookUrl);
  const webhookPayload = webhookGet.body && typeof webhookGet.body === "object" ? webhookGet.body : {};
  record(
    "fail",
    "Webhook GET",
    webhookGet.ok && webhookPayload.ok === true,
    webhookGet.ms,
    JSON.stringify(webhookPayload).slice(0, 100),
  );

  const fakeWebhook = {
    event: "messages.upsert",
    instance,
    data: {
      key: {
        remoteJid: "558781541408@s.whatsapp.net",
        fromMe: false,
        id: `VALIDATION-${Date.now()}`,
      },
      pushName: "Validacao Bot",
      messageType: "conversation",
      message: { conversation: "ping validacao webhook (nao responder)" },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
  const webhookPost = await http(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fakeWebhook),
  });
  record(
    "fail",
    "Webhook POST (simulado)",
    webhookPost.ok,
    webhookPost.ms,
    typeof webhookPost.body === "object" ? JSON.stringify(webhookPost.body).slice(0, 120) : String(webhookPost.body).slice(0, 120),
  );

  const painel = await http(`${appUrl}/painel/whatsapp`);
  record(
    "warn",
    "Rota /painel/whatsapp",
    painel.status === 200 || painel.status === 307 || painel.status === 302,
    painel.ms,
    `HTTP ${painel.status} (302/307 = redirect login, esperado)`,
  );

  // --- Evolution ---
  console.log("\n--- Evolution API ---\n");

  const instances = await evolution(`/instance/fetchInstances?instanceName=${instance}`);
  const inst = Array.isArray(instances.body) ? instances.body[0] : instances.body;
  const connected = String(inst?.connectionStatus ?? "").toLowerCase() === "open";
  record("fail", "Instancia conectada", instances.ok && connected, instances.ms, `${inst?.connectionStatus ?? "?"} | ${inst?.profileName ?? "?"}`);

  if (!connected) {
    console.error("\nWhatsApp desconectado. Escaneie o QR Code e rode novamente.\n");
    process.exit(1);
  }

  const connState = await evolution(`/instance/connectionState/${instance}`);
  record("fail", "connectionState", connState.ok, connState.ms, JSON.stringify(connState.body).slice(0, 100));

  const webhookEv = await evolution(`/webhook/find/${instance}`);
  const wh = webhookEv.body?.webhook ?? webhookEv.body;
  const whOk = Boolean(wh?.enabled && wh?.url);
  record("fail", "Webhook Evolution configurado", webhookEv.ok && whOk, webhookEv.ms, `${wh?.url ?? "?"} enabled=${wh?.enabled ?? "?"}`);
  if (wh?.url && wh.url !== webhookUrl) {
    record("warn", "URL webhook coincide", false, 0, `esperado ${webhookUrl}`);
  } else {
    record("fail", "URL webhook coincide", true, 0, wh?.url ?? webhookUrl);
  }

  const events = wh?.events ?? wh?.webhook?.events ?? [];
  const hasMessageEvent = Array.isArray(events)
    ? events.some((e) => String(e).toLowerCase().includes("message"))
    : true;
  record("warn", "Eventos webhook (messages)", hasMessageEvent, 0, Array.isArray(events) ? events.join(", ") : "nao listado");

  const chats = await evolution(`/chat/findChats/${instance}`, { method: "POST", body: "{}" });
  const chatList = asArray(chats.body);
  record("fail", "findChats", chats.ok, chats.ms, `${chatList.length} conversas`);

  const cutoff = daysAgo(retentionDays);
  const recentChats = chatList.filter((c) => {
    const ts = c.updatedAt ?? c.lastMessage?.messageTimestamp ?? c.lastMessageTimestamp;
    if (!ts) return false;
    const ms = typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : new Date(ts).getTime();
    return ms >= cutoff.getTime();
  });
  record(
    "warn",
    `Conversas ultimos ${retentionDays} dias (Evolution)`,
    recentChats.length > 0,
    0,
    `${recentChats.length} de ${chatList.length}`,
  );

  const contacts = await evolution(`/chat/findContacts/${instance}`, { method: "POST", body: "{}" });
  const contactList = asArray(contacts.body);
  record("fail", "findContacts", contacts.ok, contacts.ms, `${contactList.length} contatos`);

  const phoneContacts = contactList.filter((c) => String(c.remoteJid ?? "").endsWith("@s.whatsapp.net"));
  record("warn", "Contatos @s.whatsapp.net", phoneContacts.length > 100, 0, `${phoneContacts.length} numeros validos`);

  const term = normalizeSearch(testContact);
  const matches = contactList.filter((c) => {
    const hay = normalizeSearch([c.pushName, c.remoteJid, c.id].join(" "));
    return hay.includes(term);
  });
  record(
    "fail",
    `Busca contato "${testContact}"`,
    matches.length > 0,
    0,
    matches.slice(0, 3).map((c) => `${c.pushName ?? "?"} → ${c.remoteJid}`).join(" | ") || "nao encontrado",
  );

  const target = matches.find((c) => c.remoteJid?.endsWith("@s.whatsapp.net")) ?? matches[0];
  if (!target?.remoteJid) {
    console.error(`\nContato "${testContact}" nao encontrado. Abortando testes de mensagem.\n`);
    process.exit(1);
  }

  const messages = await evolution(`/chat/findMessages/${instance}`, {
    method: "POST",
    body: JSON.stringify({
      where: { key: { remoteJid: target.remoteJid } },
      limit: 10,
    }),
  });
  const msgList = asArray(messages.body);
  record("fail", "findMessages (contato alvo)", messages.ok, messages.ms, `${msgList.length} mensagens`);

  const hasText = msgList.some((m) => {
    const body =
      m.message?.conversation ??
      m.message?.extendedTextMessage?.text ??
      m.message?.imageMessage?.caption ??
      "";
    return String(body).length > 0 || m.messageType;
  });
  record("warn", "Mensagens com conteudo legivel", hasText || msgList.length === 0, 0, hasText ? "sim" : "estrutura atipica");

  if (!skipSend) {
    const number = target.remoteJid.split("@")[0];
    const send = await evolution(`/message/sendText/${instance}`, {
      method: "POST",
      body: JSON.stringify({ number, text: testMessage }),
    });
    const sentOk = send.ok && !String(JSON.stringify(send.body)).toLowerCase().includes("error");
    record("fail", "sendText (contato alvo)", sentOk, send.ms, `"${testMessage}" → ${number}`);
  } else {
    record("warn", "sendText (contato alvo)", true, 0, "pulado (SKIP_SEND=1)");
  }

  // --- Qualidade ---
  console.log("\n--- Qualidade de dados ---\n");

  const jidSet = new Set();
  let dupes = 0;
  for (const c of phoneContacts) {
    if (jidSet.has(c.remoteJid)) dupes += 1;
    jidSet.add(c.remoteJid);
  }
  record("warn", "JIDs duplicados na agenda", dupes === 0, 0, dupes ? `${dupes} duplicatas` : "nenhum");

  const unnamed = phoneContacts.filter((c) => !String(c.pushName ?? "").trim()).length;
  record("warn", "Contatos sem pushName", unnamed < phoneContacts.length * 0.5, 0, `${unnamed} sem nome (${Math.round((unnamed / phoneContacts.length) * 100)}%)`);

  const ownerNumber = String(inst?.ownerJid ?? inst?.number ?? "").split("@")[0].replace(/\D/g, "");
  const ownerInAgenda = phoneContacts.some((c) => c.remoteJid?.startsWith(ownerNumber));
  record("warn", "Numero da loja fora da agenda clientes", !ownerInAgenda, 0, ownerNumber ? `owner ~ ${ownerNumber}` : "owner nao identificado");

  // --- Supabase (opcional) ---
  console.log("\n--- Supabase (opcional) ---\n");
  await validateSupabase();

  // --- Build local ---
  console.log("\n--- Build TypeScript ---\n");
  const { execSync } = await import("node:child_process");
  const buildStarted = Date.now();
  try {
    execSync("npm run build", { stdio: "pipe", cwd: rootDir });
    record("fail", "npm run build", true, Date.now() - buildStarted);
  } catch (error) {
    const stderr = error?.stderr?.toString?.() ?? error?.message ?? "build failed";
    record("fail", "npm run build", false, Date.now() - buildStarted, stderr.slice(0, 200));
  }

  // --- Resumo ---
  console.log(`\n${"=".repeat(72)}`);
  console.log(" RESUMO");
  console.log(`${"=".repeat(72)}`);
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok && r.level === "fail").length;
  const warnCount = results.filter((r) => !r.ok && r.level === "warn").length;
  console.log(`Total checks : ${results.length}`);
  console.log(`OK           : ${okCount}`);
  console.log(`Falhas       : ${failCount}`);
  console.log(`Avisos       : ${warnCount}`);

  if (failed > 0) {
    console.log("\nFalhas criticas:");
    for (const r of results.filter((x) => !x.ok && x.level === "fail")) {
      console.log(`  - ${r.step}${r.detail ? `: ${r.detail}` : ""}`);
    }
    console.log(`\n${"=".repeat(72)}\n`);
    process.exit(1);
  }

  console.log("\nValidacao completa OK.");
  if (warned > 0) {
    console.log(`${warned} aviso(s) — revise acima (agenda Supabase, contatos sem nome, etc.).`);
  }
  console.log(`${"=".repeat(72)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
