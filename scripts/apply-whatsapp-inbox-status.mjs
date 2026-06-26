import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function parseEnv(filePath) {
  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
      }),
  );
}

const env = parseEnv(resolve(process.cwd(), ".env"));
const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260622120000_whatsapp_inbox_status.sql",
);
const sql = readFileSync(migrationPath, "utf8").trim();

const supabaseUrl = env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const projectRef = env.SUPABASE_PROJECT_ID ?? "soakwbbhhjcygwkbthft";

async function columnExists() {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from("whatsapp_chats").select("inbox_status").limit(1);
  return !error;
}

async function applyViaExecSqlRpc() {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`exec_sql: ${response.status} ${body}`);
  }
}

async function applyViaManagementApi() {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`management api: ${response.status} ${body}`);
  }
}

async function main() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios no .env");
  }

  if (await columnExists()) {
    console.log("OK: coluna whatsapp_chats.inbox_status ja existe.");
    return;
  }

  const attempts = [];
  try {
    await applyViaExecSqlRpc();
    attempts.push("exec_sql rpc");
  } catch (error) {
    attempts.push(`exec_sql rpc falhou (${error.message})`);
  }

  if (!(await columnExists()) && accessToken) {
    try {
      await applyViaManagementApi();
      attempts.push("management api");
    } catch (error) {
      attempts.push(`management api falhou (${error.message})`);
    }
  }

  if (await columnExists()) {
    console.log("Migration inbox_status aplicada com sucesso.");
    return;
  }

  console.error("Nao foi possivel aplicar a migration automaticamente.");
  for (const attempt of attempts) console.error(`- ${attempt}`);
  console.error("\nExecute manualmente no SQL Editor do Supabase:\n");
  console.error(sql);
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
