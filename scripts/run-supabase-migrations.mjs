#!/usr/bin/env node
/**
 * Aplica migrations SQL pendentes via Supabase Management API (service role).
 * Usa POST /rest/v1/rpc apenas se nao houver CLI; fallback: executa SQL direto via pg quando disponivel.
 * Neste projeto: aplica arquivos .sql novos com fetch ao endpoint SQL do Supabase (database).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(rootDir, "supabase", "migrations");

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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Migrations a aplicar nesta sessao (por nome). */
const TARGET = [
  "20260618000000_meta_atendimento.sql",
  "20260619210000_waba_message_error_detail.sql",
  "20260620120000_waba_coexistence.sql",
  "20260621120000_atendimento_provider.sql",
  "20260622120000_whatsapp_inbox_status.sql",
];

async function runSql(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (res.status === 404) {
    return { ok: false, reason: "rpc_exec_sql_missing" };
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, reason: text };
  }
  return { ok: true, body: text };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("FAIL: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatorios no .env");
    process.exit(1);
  }

  console.log("=== Aplicar migrations Supabase ===\n");

  for (const file of TARGET) {
    const path = join(migrationsDir, file);
    let sql;
    try {
      sql = readFileSync(path, "utf8");
    } catch {
      console.warn(`SKIP (nao encontrado): ${file}`);
      continue;
    }

    console.log(`Aplicando ${file}...`);
    const result = await runSql(sql);
    if (result.ok) {
      console.log(`  OK`);
      continue;
    }

    if (result.reason === "rpc_exec_sql_missing") {
      console.log("\nRPC exec_sql nao disponivel. Tentando Supabase SQL API alternativa...");
      const alt = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      if (alt.ok) {
        console.log(`  OK (pg/query)`);
        continue;
      }
      console.warn(`  AVISO: aplique manualmente no painel Supabase → SQL Editor:\n  ${file}`);
      console.warn(`  ${(await alt.text()).slice(0, 200)}`);
    } else if (String(result.reason).includes("already exists") || String(result.reason).includes("duplicate")) {
      console.log(`  OK (ja existia)`);
    } else {
      console.warn(`  AVISO: ${String(result.reason).slice(0, 300)}`);
    }
  }

  console.log("\nConcluido. Verifique no Supabase se as tabelas/colunas existem.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
