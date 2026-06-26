#!/usr/bin/env node
/**
 * Diagnostico: Evolution pairing code + estado da instancia.
 * Uso: node scripts/diagnose-evolution-pairing.mjs [telefone]
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

const BASE_URL = (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "").replace(/\/manager\/?$/i, "");
const API_KEY = process.env.EVOLUTION_API_KEY ?? "";
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME ?? "abelha-mel";
const PREFIX = (process.env.EVOLUTION_API_PREFIX ?? "").replace(/\/$/, "");
const phoneArg = process.argv[2] ?? "5596981769435";

function requestJson(path, method = "GET", body) {
  const url = `${BASE_URL}${PREFIX}${path}`;
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
        ...(parsed.protocol === "https:" && process.env.EVOLUTION_INSECURE_SSL === "true"
          ? { rejectUnauthorized: false }
          : {}),
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = raw;
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch {
            json = { raw };
          }
          resolve({ status: res.statusCode, body: json, raw });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  if (!BASE_URL || !API_KEY) {
    console.error("EVOLUTION_API_URL / EVOLUTION_API_KEY ausentes no .env");
    process.exit(1);
  }

  console.log("Evolution:", BASE_URL);
  console.log("Instancia:", INSTANCE);
  console.log("Telefone teste:", phoneArg);
  console.log("---");

  const state = await requestJson(`/instance/connectionState/${INSTANCE}`);
  console.log("connectionState:", state.status, JSON.stringify(state.body, null, 2));

  const instances = await requestJson("/instance/fetchInstances");
  const rows = Array.isArray(instances.body) ? instances.body : [instances.body];
  const row = rows.find((r) => (r?.name ?? r?.instanceName) === INSTANCE) ?? rows[0];
  console.log("\nfetchInstances (resumo):", {
    name: row?.name ?? row?.instanceName,
    state: row?.connectionStatus ?? row?.state,
    integration: row?.integration,
    number: row?.number,
    ownerJid: row?.ownerJid,
  });

  // logout se connecting
  const live = String(row?.connectionStatus ?? state.body?.instance?.state ?? state.body?.state ?? "").toLowerCase();
  if (live === "connecting" || live === "open") {
    console.log("\nLogout da instancia...");
    const logout = await requestJson(`/instance/logout/${INSTANCE}`, "DELETE");
    console.log("logout:", logout.status, JSON.stringify(logout.body));
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\nConnect com pairing (POST body number)...");
  const connectPost = await requestJson(`/instance/connect/${INSTANCE}`, "POST", { number: phoneArg });
  console.log("connect POST:", connectPost.status, JSON.stringify(connectPost.body, null, 2));

  console.log("\nConnect com pairing (GET ?number=)...");
  const connectGet = await requestJson(`/instance/connect/${INSTANCE}?number=${encodeURIComponent(phoneArg)}`, "GET");
  console.log("connect GET:", connectGet.status, JSON.stringify(connectGet.body, null, 2));

  console.log("\n---");
  console.log("Se pairingCode aparece mas WhatsApp rejeita, atualize na VPS:");
  console.log("CONFIG_SESSION_PHONE_VERSION=2.3000.1023204200");
  console.log("CONFIG_SESSION_PHONE_CLIENT=Chrome");
  console.log("CONFIG_SESSION_PHONE_NAME=Chrome");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
