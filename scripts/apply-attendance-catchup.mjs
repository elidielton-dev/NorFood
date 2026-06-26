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
const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const STORE_TIMEZONE = "America/Recife";

function calendarDay(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const now = new Date();
  const today = calendarDay(now, STORE_TIMEZONE);
  console.log("Hoje (Recife):", today);

  const { data: active, error } = await admin
    .from("whatsapp_chats")
    .select("id, name, last_message_at, inbox_status")
    .or("inbox_status.is.null,inbox_status.eq.open,inbox_status.eq.pending");

  if (error) throw error;

  const toClose = (active ?? []).filter((row) => {
    if (!row.last_message_at) return true;
    const day = calendarDay(new Date(row.last_message_at), STORE_TIMEZONE);
    return day < today;
  });

  console.log("Conversas de dias anteriores para encerrar:", toClose.length);
  for (const row of toClose.slice(0, 15)) {
    const day = row.last_message_at
      ? calendarDay(new Date(row.last_message_at), STORE_TIMEZONE)
      : "sem data";
    console.log(`  - ${row.name ?? "(sem nome)"} | dia=${day} | ${row.last_message_at}`);
  }

  if (toClose.length === 0) {
    console.log("Nada a encerrar.");
    return;
  }

  const ids = toClose.map((row) => row.id);
  const { error: updateError } = await admin
    .from("whatsapp_chats")
    .update({ inbox_status: "closed", updated_at: now.toISOString() })
    .in("id", ids);
  if (updateError) throw updateError;

  console.log("Encerradas:", ids.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
