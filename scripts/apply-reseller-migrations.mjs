#!/usr/bin/env node
/**
 * Aplica migration de revendedoras (resellers, tokens, billing, impersonate).
 * Uso: node scripts/apply-reseller-migrations.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(path) {
  const env = {};
  try {
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
  } catch {
    /* optional */
  }
  return env;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, "deploy/.env")) };
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const projectRef = env.SUPABASE_PROJECT_ID;

if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios");

async function applySql(sql) {
  const response = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (response.ok) return "exec_sql";

  if (accessToken && projectRef) {
    const mgmt = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (mgmt.ok) return "management_api";
    throw new Error(`management_api: ${mgmt.status} ${await mgmt.text()}`);
  }

  throw new Error(`exec_sql: ${response.status} ${await response.text()}`);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { error: checkErr } = await admin.from("resellers").select("id").limit(1);
if (!checkErr) {
  console.log("SKIP: tabela resellers já existe.");
  process.exit(0);
}

const sql = readFileSync(
  resolve(root, "supabase/migrations/20260702120000_resellers_foundation.sql"),
  "utf8",
);

console.log("Aplicando migration revendedoras...");
const via = await applySql(sql);
console.log(`OK revendedoras (${via})`);

const { error: verifyErr } = await admin.from("resellers").select("id").limit(1);
if (verifyErr) {
  throw new Error(
    "Migration não confirmada. Rode supabase/migrations/20260702120000_resellers_foundation.sql no SQL Editor.",
  );
}

console.log("Migration revendedoras concluída.");
