#!/usr/bin/env node
/**
 * Checklist ponta a ponta antes de apresentar o projeto em producao.
 * Uso: npm run demo:ready
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? "https://abelhaemel.vercel.app";

function parseEnv() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(process.cwd(), ".env"), "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...parseEnv(), ...process.env };
const issues = [];
const warnings = [];
const ok = [];

function pass(msg) {
  ok.push(msg);
  console.log(`  OK  ${msg}`);
}

function warn(msg) {
  warnings.push(msg);
  console.log(`  AVISO  ${msg}`);
}

function fail(msg) {
  issues.push(msg);
  console.log(`  FALHA  ${msg}`);
}

async function checkRoutes() {
  console.log("\n== Rotas publicas ==");
  for (const route of ["/", "/auth", "/painel/produtos", "/painel/atendimento/conversas"]) {
    try {
      const response = await fetch(`${PRODUCTION_URL}${route}`, { redirect: "follow" });
      if (response.status >= 200 && response.status < 400) {
        pass(`${route} HTTP ${response.status}`);
      } else {
        fail(`${route} HTTP ${response.status}`);
      }
    } catch (error) {
      fail(`${route} ${error instanceof Error ? error.message : error}`);
    }
  }
}

async function checkSupabase(envVars) {
  console.log("\n== Supabase ==");
  const url = envVars.SUPABASE_URL;
  const key = envVars.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    fail("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env");
    return;
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  for (const table of [
    "produtos",
    "whatsapp_chats",
    "whatsapp_config",
    "waba_config",
    "waba_contacts",
    "staff_atendimento_prefs",
  ]) {
    const { error } = await sb.from(table).select("*").limit(1);
    if (error) fail(`tabela ${table}: ${error.message}`);
    else pass(`tabela ${table}`);
  }

  const { count, error: prodErr } = await sb.from("produtos").select("id", { count: "exact", head: true });
  if (prodErr) fail(`catalogo: ${prodErr.message}`);
  else if ((count ?? 0) === 0) fail("catalogo vazio — cadastre produtos antes do demo");
  else pass(`catalogo com ${count} produto(s)`);

  for (const col of ["inbox_status", "assigned_agent_id", "attendance_opened_at"]) {
    const { error } = await sb.from("whatsapp_chats").select(col).limit(1);
    if (error) fail(`whatsapp_chats.${col}: ${error.message}`);
    else pass(`whatsapp_chats.${col}`);
  }

  for (const col of ["phone_verified_at", "profile_pic_phone_digits"]) {
    const { error } = await sb.from("whatsapp_chats").select(col).limit(1);
    if (error) {
      warn(
        `whatsapp_chats.${col} ausente — rode scripts/production-atendimento-migrations.sql no Supabase`,
      );
    } else pass(`whatsapp_chats.${col}`);
  }
}

function checkEnv(envVars) {
  console.log("\n== Variaveis de ambiente (local .env) ==");
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ];
  for (const key of required) {
    if (envVars[key]?.trim()) pass(key);
    else fail(`${key} ausente`);
  }

  if (envVars.VITE_DEMO_MODE === "true") fail("VITE_DEMO_MODE=true — desative em producao");
  else pass("VITE_DEMO_MODE nao esta true");

  const evolution =
    envVars.EVOLUTION_API_URL?.trim() && envVars.EVOLUTION_API_KEY?.trim();
  const meta = envVars.META_APP_ID?.trim() && envVars.ENCRYPTION_KEY?.trim();
  if (evolution) pass("Evolution API configurada");
  else if (meta) pass("Meta WABA configurada");
  else warn("Nenhum provedor WhatsApp (Evolution ou Meta) no .env local");

  if (!envVars.CRON_SECRET?.trim()) warn("CRON_SECRET ausente — auto-fechamento de atendimento pode falhar");
  else pass("CRON_SECRET definido");

  if (!envVars.MP_WEBHOOK_SECRET?.trim()) warn("MP_WEBHOOK_SECRET ausente");
  else pass("MP_WEBHOOK_SECRET definido");
}

async function checkEvolution(envVars) {
  console.log("\n== Evolution VPS ==");
  const base = envVars.EVOLUTION_API_URL?.replace(/\/$/, "");
  const apiKey = envVars.EVOLUTION_API_KEY;
  const instance = envVars.EVOLUTION_INSTANCE_NAME ?? "abelha-mel";
  if (!base || !apiKey) {
    warn("Evolution nao configurada — pule se for demo so com Meta");
    return;
  }

  try {
    const stateRes = await fetch(`${base}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
    });
    const stateJson = await stateRes.json().catch(() => ({}));
    const state = stateJson?.instance?.state ?? stateJson?.state ?? "desconhecido";
    if (state === "open") pass(`WhatsApp conectado (${instance})`);
    else fail(`WhatsApp nao conectado: state=${state}`);
  } catch (error) {
    fail(`Evolution inacessivel: ${error instanceof Error ? error.message : error}`);
  }
}

async function main() {
  console.log(`Demo ready check — ${PRODUCTION_URL}`);
  await checkRoutes();
  checkEnv(env);
  await checkSupabase(env);
  await checkEvolution(env);

  console.log("\n== Resumo ==");
  console.log(`OK: ${ok.length} | Avisos: ${warnings.length} | Falhas: ${issues.length}`);
  if (issues.length > 0) {
    console.log("\nCorrija as falhas antes da apresentacao.");
    process.exit(1);
  }
  if (warnings.length > 0) {
    console.log("\nAvisos nao bloqueiam, mas revise antes do demo.");
  } else {
    console.log("\nProjeto pronto para apresentacao.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
