#!/usr/bin/env node
/** Aplica migration motoboy entregas tenant visibility */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(
  join(root, "supabase/migrations/20260627180000_motoboy_entregas_tenant_visibility.sql"),
  "utf8",
);

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
    env[t.slice(0, eq).trim()] = v;
  }
  return env;
}

const env = loadEnv(resolve(root, "deploy/.env"));
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Aplicando migration motoboy entregas tenant visibility...");

for (const endpoint of ["/rest/v1/rpc/exec_sql", "/pg/query"]) {
  const res = await fetch(`${url}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (res.ok) {
    console.log(`OK via ${endpoint}`);
    process.exit(0);
  }
}

console.warn("AVISO: aplique manualmente no Supabase SQL Editor:");
console.warn("  supabase/migrations/20260627180000_motoboy_entregas_tenant_visibility.sql");
process.exit(0);
