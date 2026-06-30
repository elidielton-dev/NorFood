#!/usr/bin/env node
/**
 * Aplica RLS multitenant para pedidos/financeiro (tenant_users staff).
 * Uso: node scripts/apply-tenant-staff-rls.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(filePath) {
  try {
    return readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .reduce((acc, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return acc;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) return acc;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        acc[key] = value;
        return acc;
      }, {});
  } catch {
    return {};
  }
}

const env = {
  ...parseEnv(join(root, ".env")),
  ...parseEnv(join(root, "deploy", ".env")),
  ...process.env,
};

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env ou deploy/.env");
  process.exit(1);
}

const sql = readFileSync(
  join(root, "supabase/migrations/20260630200000_tenant_staff_pedidos_financeiro_rls.sql"),
  "utf8",
);

async function applySql(label) {
  const execRes = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (execRes.ok) {
    console.log(`OK ${label} via exec_sql`);
    return;
  }

  throw new Error(
    `${label}: exec_sql indisponível (${execRes.status}). Aplique supabase/migrations/20260630200000_tenant_staff_pedidos_financeiro_rls.sql no SQL Editor.`,
  );
}

await applySql("tenant_staff_pedidos_financeiro_rls");
console.log("Migração RLS multitenant aplicada.");
