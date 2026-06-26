#!/usr/bin/env node
/**
 * Aponta o webhook da instancia Evolution para WHATSAPP_WEBHOOK_URL (producao Vercel).
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";

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

const BASE_URL = (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
const API_KEY = process.env.EVOLUTION_API_KEY ?? "";
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME ?? "abelha-mel";
const PREFIX = process.env.EVOLUTION_API_PREFIX ?? "";
const WEBHOOK_URL =
  process.env.WHATSAPP_WEBHOOK_URL ?? "https://abelhaemel.vercel.app/api/whatsapp/webhook";

const EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "CHATS_UPSERT",
];

function requestJson(url, method, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body ? JSON.stringify(body) : "";
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: {
          "Content-Type": "application/json",
          apikey: API_KEY,
          Authorization: `Bearer ${API_KEY}`,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = {};
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch {
            json = { raw };
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function tryPaths(paths, method, body) {
  let last = null;
  for (const path of paths) {
    const url = `${BASE_URL}${PREFIX}${path}`;
    const result = await requestJson(url, method, body);
    last = result;
    if (result.status >= 200 && result.status < 300) return result;
  }
  return last;
}

async function main() {
  if (!BASE_URL || !API_KEY) {
    console.error("FAIL: defina EVOLUTION_API_URL e EVOLUTION_API_KEY no .env");
    process.exit(1);
  }

  console.log("=== Configurar webhook Evolution ===\n");
  console.log("API:", BASE_URL);
  console.log("Instancia:", INSTANCE);
  console.log("Webhook URL:", WEBHOOK_URL);

  const setBody = {
    webhook: {
      enabled: true,
      url: WEBHOOK_URL,
      webhookByEvents: false,
      events: EVENTS,
      headers: {
        apikey: API_KEY,
      },
    },
  };

  const setResult = await tryPaths(
    [`/webhook/set/${INSTANCE}`, `/api/v1/webhook/set/${INSTANCE}`],
    "POST",
    setBody,
  );
  console.log("\nPOST webhook/set:", setResult?.status, JSON.stringify(setResult?.json));

  const findResult = await tryPaths(
    [`/webhook/find/${INSTANCE}`, `/api/v1/webhook/find/${INSTANCE}`],
    "GET",
  );
  console.log("\nGET webhook/find:", findResult?.status, JSON.stringify(findResult?.json));

  const webhook = findResult?.json?.webhook ?? findResult?.json ?? {};
  const enabled = Boolean(webhook.enabled);
  const url = webhook.url ?? null;

  if (!enabled || !url) {
    console.error("\nFAIL: webhook nao ficou ativo na Evolution.");
    process.exit(1);
  }

  console.log("\nOK — Evolution apontando para:", url);
  console.log("Teste: GET", WEBHOOK_URL.replace("/webhook", "/webhook").split("/api")[0] + "/api/whatsapp/webhook");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
