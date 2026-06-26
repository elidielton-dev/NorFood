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
const supabaseUrl = env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = env.SUPABASE_ACCESS_TOKEN;
const projectRef = env.SUPABASE_PROJECT_ID ?? "soakwbbhhjcygwkbthft";

const MIGRATIONS = [
  "20260624120000_atendimento_improvements.sql",
  "20260625120000_atendimento_assigned_agent.sql",
  "20260625130000_whatsapp_phone_verified.sql",
  "20260625140000_whatsapp_profile_pic_phone.sql",
];

async function columnExists(admin, table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return !error;
}

async function applyViaExecSqlRpc(sql) {
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

async function applyViaManagementApi(sql) {
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

async function applyMigration(admin, file) {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations", file), "utf8").trim();

  if (file.includes("assigned_agent")) {
    if (await columnExists(admin, "whatsapp_chats", "assigned_agent_id")) {
      console.log(`SKIP ${file}: assigned_agent_id ja existe.`);
      return;
    }
  }

  if (file.includes("phone_verified")) {
    if (await columnExists(admin, "whatsapp_chats", "phone_verified_at")) {
      console.log(`SKIP ${file}: phone_verified_at ja existe.`);
      return;
    }
  }

  if (file.includes("profile_pic_phone")) {
    if (await columnExists(admin, "whatsapp_chats", "profile_pic_phone_digits")) {
      console.log(`SKIP ${file}: profile_pic_phone_digits ja existe.`);
      return;
    }
  }

  if (file.includes("atendimento_improvements")) {
    const hasReply = await columnExists(admin, "waba_messages", "reply_to_wa_message_id");
    const hasPrefs = await columnExists(admin, "staff_atendimento_prefs", "user_id");
    if (hasReply && hasPrefs) {
      console.log(`SKIP ${file}: ja aplicada.`);
      return;
    }
  }

  const attempts = [];
  let applied = false;

  try {
    await applyViaExecSqlRpc(sql);
    attempts.push("exec_sql");
    applied = true;
  } catch (error) {
    attempts.push(`exec_sql: ${error.message}`);
  }

  if (accessToken) {
    try {
      await applyViaManagementApi(sql);
      attempts.push("management_api");
      applied = true;
    } catch (error) {
      attempts.push(`management_api: ${error.message}`);
    }
  }

  const verified = await verifyMigrationApplied(admin, file);
  if (!verified) {
    throw new Error(
      `${file} nao foi aplicada. Rode scripts/production-atendimento-migrations.sql no Supabase SQL Editor ou defina SUPABASE_ACCESS_TOKEN no .env.`,
    );
  }

  console.log(`OK ${file} (${attempts.join(", ") || "ja existia"})`);
}

async function verifyMigrationApplied(admin, file) {
  if (file.includes("assigned_agent")) {
    return columnExists(admin, "whatsapp_chats", "assigned_agent_id");
  }
  if (file.includes("phone_verified")) {
    return columnExists(admin, "whatsapp_chats", "phone_verified_at");
  }
  if (file.includes("profile_pic_phone")) {
    return columnExists(admin, "whatsapp_chats", "profile_pic_phone_digits");
  }
  if (file.includes("atendimento_improvements")) {
    const hasReply = await columnExists(admin, "waba_messages", "reply_to_wa_message_id");
    const hasPrefs = await columnExists(admin, "staff_atendimento_prefs", "user_id");
    return hasReply && hasPrefs;
  }
  return true;
}

async function main() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios no .env");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const file of MIGRATIONS) {
    await applyMigration(admin, file);
  }

  console.log("Migrations de atendimento concluidas.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
