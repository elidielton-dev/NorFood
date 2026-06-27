#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";

function loadEnv(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, eq).trim()] = value;
  }
  return env;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, "deploy/.env")) };
const keys = [
  "MP_ACCESS_TOKEN",
  "VITE_MP_PUBLIC_KEY",
  "MP_WEBHOOK_SECRET",
  "MP_WEBHOOK_URL",
  "PUBLIC_APP_URL",
  "DOMAIN",
  "MP_ENVIRONMENT",
];

console.log("=== Mercado Pago env check ===");
for (const key of keys) {
  const value = env[key];
  console.log(`${key}: ${value ? `set (${value.length} chars)` : "MISSING"}`);
}

const webhookUrl = env.MP_WEBHOOK_URL || `${env.PUBLIC_APP_URL || `https://${env.DOMAIN || "norfood.com.br"}`}/api/mercado-pago/webhook`;
console.log("\nWebhook URL esperada:", webhookUrl);

if (env.MP_ACCESS_TOKEN) {
  const res = await fetch("https://api.mercadopago.com/users/me", {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  const body = await res.json().catch(() => ({}));
  console.log("\nMP API /users/me:", res.status, body.nickname ?? body.message ?? "ok");
}

const health = await fetch(`${BASE}/api/mercado-pago/webhook`);
const summary = await health.json().catch(() => ({}));
console.log("\nProdução webhook GET:", health.status, JSON.stringify(summary));
