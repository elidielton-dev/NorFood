#!/usr/bin/env node
/** Aplica migration rider multitenant + avatars em produção. */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
      env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    /* optional */
  }
  return env;
}

const env = {
  ...loadEnv(resolve(root, ".env")),
  ...loadEnv(resolve(root, "deploy/.env")),
};
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const projectRef = env.SUPABASE_PROJECT_ID ?? url?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!url || !key) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em deploy/.env");
  process.exit(1);
}

const sql = readFileSync(
  join(root, "supabase/migrations/20260627200000_rider_multitenant_mobile.sql"),
  "utf8",
);

async function applySql(query, label) {
  const execRes = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query }),
  });
  if (execRes.ok) {
    console.log(`OK ${label} via exec_sql`);
    return;
  }

  if (accessToken && projectRef) {
    const mgmt = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    const text = await mgmt.text();
    if (mgmt.ok) {
      console.log(`OK ${label} via management_api`);
      return;
    }
    throw new Error(`${label} management_api: ${mgmt.status} ${text.slice(0, 400)}`);
  }

  throw new Error(
    `${label}: exec_sql indisponível (${execRes.status}). Aplique supabase/migrations/20260627200000_rider_multitenant_mobile.sql no SQL Editor.`,
  );
}

async function fnExists(name) {
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.rpc(name, {
    _tenant_id: "a0000000-0000-4000-8000-000000000001",
    _user_id: "00000000-0000-4000-8000-000000000001",
  });
  if (!error) return true;
  if (error.code === "PGRST202") return false;
  return true;
}

console.log("Aplicando migration rider multitenant mobile...");

if (await fnExists("is_tenant_entregador")) {
  console.log("SKIP: is_tenant_entregador já existe.");
} else {
  await applySql(sql, "rider_multitenant_mobile");
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: buckets } = await admin.storage.listBuckets();
if (buckets?.some((b) => b.id === "avatars")) {
  console.log("OK bucket avatars");
} else {
  console.warn("AVISO: bucket avatars ainda ausente — verifique migration no SQL Editor.");
}

console.log("Migration rider mobile concluída.");
