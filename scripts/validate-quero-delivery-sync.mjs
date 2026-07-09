#!/usr/bin/env node
/**
 * Valida estrutura da integracao Quero Delivery (tabelas + upsert tenant_integrations).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";

function parseEnv(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, "utf8")
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

const env = parseEnv(resolve(process.cwd(), ".env"));
const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("=== Validacao Quero Delivery sync ===");

  const tables = ["tenant_integrations", "quero_delivery_order_map", "quero_delivery_sync_logs"];
  for (const table of tables) {
    const { error } = await admin.from(table).select(table === "tenant_integrations" ? "tenant_id" : "id").limit(1);
    if (error) {
      console.error(`FAIL tabela ${table}:`, error.message);
      process.exit(1);
    }
    console.log(`OK tabela ${table}`);
  }

  const { error: upsertError } = await admin.from("tenant_integrations").upsert({
    tenant_id: TENANT_ID,
    quero_delivery_enabled: false,
    quero_delivery_place_id: "test-place",
    updated_at: new Date().toISOString(),
  });
  if (upsertError) {
    console.error("FAIL upsert tenant_integrations:", upsertError.message);
    process.exit(1);
  }
  console.log("OK upsert tenant_integrations");

  const { error: logError } = await admin.from("quero_delivery_sync_logs").insert({
    tenant_id: TENANT_ID,
    level: "info",
    message: "validate-quero-delivery-sync smoke test",
  });
  if (logError) {
    console.error("FAIL insert sync log:", logError.message);
    process.exit(1);
  }
  console.log("OK insert quero_delivery_sync_logs");
  console.log("Validacao concluida.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
