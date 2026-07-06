#!/usr/bin/env node
/**
 * Valida gateway WhatsApp Baileys + webhook Norfood.
 * Variáveis: WHATSAPP_GATEWAY_URL, WHATSAPP_GATEWAY_KEY, WHATSAPP_WEBHOOK_URL
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

const GATEWAY_URL = (process.env.WHATSAPP_GATEWAY_URL ?? "http://127.0.0.1:8090").replace(
  /\/$/,
  "",
);
const API_KEY = process.env.WHATSAPP_GATEWAY_KEY ?? "";
const WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL ?? "";

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: API_KEY,
          ...(options.body ? { "Content-Length": Buffer.byteLength(options.body) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
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
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  console.log("Validando gateway Baileys:", GATEWAY_URL);

  if (!API_KEY) {
    console.warn("⚠ WHATSAPP_GATEWAY_KEY ausente");
  }

  const health = await requestJson(`${GATEWAY_URL}/health`);
  console.log(health.status === 200 ? "✓ Health OK" : "✗ Health falhou", health.json);

  const connection = await requestJson(`${GATEWAY_URL}/connection`);
  console.log("Connection:", connection.json);

  if (WEBHOOK_URL) {
    const probe = await requestJson(WEBHOOK_URL.replace(/\/$/, ""));
    console.log(
      probe.status < 500 ? "✓ Webhook URL acessivel" : "✗ Webhook inacessivel",
      WEBHOOK_URL,
    );
  } else {
    console.warn("⚠ WHATSAPP_WEBHOOK_URL nao configurada");
  }

  console.log("\nValidacao basica concluida.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
