import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

const STORE_TIMEZONE = "America/Recife";

function getWeekdayInTimezone(date, timeZone) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

function getMinutesInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function timeToMinutes(value) {
  const [h, m] = String(value).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

async function main() {
  const { data: config, error: configErr } = await admin
    .from("config_operacional")
    .select("loja_aberta, horario_automatico, pausa_imediata, attendance_close_marker")
    .eq("id", "default")
    .maybeSingle();

  const { data: horarios, error: horErr } = await admin
    .from("horarios_funcionamento")
    .select("dia_semana, ativo, abre, fecha")
    .order("dia_semana");

  const { data: activeChats, error: chatErr } = await admin
    .from("whatsapp_chats")
    .select("id, name, inbox_status, last_message_at, attendance_opened_at")
    .or("inbox_status.is.null,inbox_status.eq.open,inbox_status.eq.pending")
    .order("last_message_at", { ascending: false })
    .limit(20);

  const { count: activeCount } = await admin
    .from("whatsapp_chats")
    .select("id", { count: "exact", head: true })
    .or("inbox_status.is.null,inbox_status.eq.open,inbox_status.eq.pending");

  const { count: closedCount } = await admin
    .from("whatsapp_chats")
    .select("id", { count: "exact", head: true })
    .eq("inbox_status", "closed");

  const now = new Date();
  const dia = getWeekdayInTimezone(now, STORE_TIMEZONE);
  const minutesNow = getMinutesInTimezone(now, STORE_TIMEZONE);
  const horarioHoje = (horarios ?? []).find((h) => h.dia_semana === dia);

  let abertaAgora = true;
  if (config?.pausa_imediata) abertaAgora = false;
  else if (!config?.horario_automatico) abertaAgora = Boolean(config?.loja_aberta);
  else if (!horarioHoje?.ativo) abertaAgora = false;
  else {
    const start = timeToMinutes(horarioHoje.abre);
    const end = timeToMinutes(horarioHoje.fecha);
    abertaAgora = minutesNow >= start && minutesNow < end;
  }

  console.log("=== Validacao encerramento atendimento ===");
  console.log("Agora (UTC):", now.toISOString());
  console.log("Loja aberta agora:", abertaAgora);
  console.log("Horario hoje:", horarioHoje ? `${horarioHoje.abre} - ${horarioHoje.fecha}` : "sem expediente");
  console.log("Config:", config);
  if (configErr) console.error("config_err", configErr.message);
  if (horErr) console.error("hor_err", horErr.message);
  if (chatErr) console.error("chat_err", chatErr.message);

  console.log("\nContagens whatsapp_chats:");
  console.log("  Ativas (open/pending/null):", activeCount ?? 0);
  console.log("  Resolvidas (closed):", closedCount ?? 0);

  if (activeChats?.length) {
    console.log("\nAmostra de conversas ainda ATIVAS:");
    for (const chat of activeChats) {
      console.log(
        `  - ${chat.name ?? "(sem nome)"} | status=${chat.inbox_status ?? "null"} | ultima=${chat.last_message_at ?? "null"}`,
      );
    }
  } else {
    console.log("\nNenhuma conversa ativa no banco.");
  }

  if (!abertaAgora && (activeCount ?? 0) > 0) {
    console.log("\n⚠ PROBLEMA: loja fechada mas ainda ha conversas ativas — sync deve encerrar ao abrir o inbox.");
  } else if (abertaAgora && (activeCount ?? 0) > 0) {
    console.log("\nLoja aberta: conversas ativas com mensagem apos o ultimo fechamento sao esperadas.");
  } else {
    console.log("\nOK: estado consistente com o horario.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
