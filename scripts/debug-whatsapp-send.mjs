#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL) {
  const { injectDeployEnv } = await import("./load-deploy-env.mjs");
  injectDeployEnv();
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const gatewayKey = process.env.WHATSAPP_GATEWAY_KEY ?? "";

function parseArgs(argv) {
  const out = { phone: null, text: null, name: null };
  for (const arg of argv) {
    if (arg.startsWith("--phone=")) out.phone = arg.slice("--phone=".length).replace(/\D/g, "");
    else if (arg.startsWith("--text=")) out.text = arg.slice("--text=".length);
    else if (arg.startsWith("--name=")) out.name = arg.slice("--name=".length);
  }
  return out;
}

function formatWaId(waMessageId) {
  if (!waMessageId) return "wa=(vazio)";
  if (String(waMessageId).startsWith("local-")) {
    return `wa=${waMessageId} [FANTASMA — nao enviado ao WhatsApp]`;
  }
  return `wa=${waMessageId}`;
}

function printRecommendations({ gatewayConfigured, connectionState, phantomCount }) {
  console.log("\n=== Recomendacoes ===");
  if (!gatewayConfigured) {
    console.log("- WHATSAPP_GATEWAY_URL/KEY ausentes no container norfood. Envio pelo painel grava FANTASMA.");
    return;
  }
  if (connectionState !== "open" && connectionState !== "connected") {
    console.log("- Gateway nao conectado. Reconecte em Atendimento > Configuracoes antes de enviar.");
  }
  if (phantomCount > 0) {
    console.log(`- ${phantomCount} mensagem(ns) outbound com ID local-* (gravadas sem gateway).`);
  }
  if (gatewayConfigured && (connectionState === "open" || connectionState === "connected") && phantomCount === 0) {
    console.log("- Configuracao OK. Use --phone=... --text=... para testar envio direto no gateway.");
  }
}

async function gateway(path, body) {
  const res = await fetch(`${gatewayUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: gatewayKey,
      Authorization: `Bearer ${gatewayKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function sessionAnchorIssue(chat) {
  if (!chat?.attendance_opened_at || !chat?.last_message_at) return null;
  const anchorMs = new Date(chat.attendance_opened_at).getTime();
  const lastMs = new Date(chat.last_message_at).getTime();
  if (!Number.isFinite(anchorMs) || !Number.isFinite(lastMs)) return null;
  if (anchorMs > lastMs + 2000) {
    return {
      attendance_opened_at: chat.attendance_opened_at,
      last_message_at: chat.last_message_at,
      deltaMs: anchorMs - lastMs,
      likelyHiddenMessages: true,
    };
  }
  return { likelyHiddenMessages: false };
}

async function loadChatDiagnostics({ phone, name }) {
  let query = admin
    .from("whatsapp_chats")
    .select(
      "id, name, phone, remote_jid, last_message, last_message_at, attendance_opened_at, inbox_status",
    );

  if (phone) {
    const digits = phone.replace(/\D/g, "");
    query = query.or(`phone.ilike.%${digits.slice(-8)}%,remote_jid.ilike.%${digits}%`);
  } else if (name) {
    query = query.ilike("name", `%${name}%`);
  } else {
    return;
  }

  const { data: chats, error } = await query.limit(5);
  if (error) throw error;
  if (!chats?.length) {
    console.log("\n=== Chat diagnostics ===\n(nenhum chat encontrado)");
    return;
  }

  console.log("\n=== Chat diagnostics ===");
  for (const chat of chats) {
    const issue = sessionAnchorIssue(chat);
    console.log(JSON.stringify({ chat, sessionAnchor: issue }, null, 2));

    const { data: msgs } = await admin
      .from("whatsapp_messages")
      .select("id, direction, body, wa_message_id, status, message_type, sent_at")
      .eq("chat_id", chat.id)
      .order("sent_at", { ascending: false })
      .limit(10);

    console.log(`\n--- Messages for ${chat.name ?? chat.id} ---`);
    for (const m of msgs ?? []) {
      const tag = m.direction === "outbound" ? formatWaId(m.wa_message_id) : `wa=${m.wa_message_id}`;
      console.log(
        `- ${m.sent_at} | ${m.direction} | ${m.message_type} | ${m.status} | ${tag} | ${m.body ?? "(sem texto)"}`,
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { data: waba } = await admin
    .from("waba_config")
    .select("active_provider, status, phone_number_id")
    .eq("workspace_id", "default")
    .maybeSingle();

  const { data: wa } = await admin
    .from("whatsapp_config")
    .select("provider, status, phone_number, profile_name, connected_at")
    .maybeSingle();

  const { data: msgs } = await admin
    .from("whatsapp_messages")
    .select("id, body, wa_message_id, status, message_type, sent_at, remote_jid")
    .eq("direction", "outbound")
    .order("sent_at", { ascending: false })
    .limit(8);

  const health = await gateway("/health");
  const connection = await gateway("/connection");
  const connectionState = String(
    connection.json?.state ?? connection.json?.instance?.state ?? health.json?.connection ?? "",
  ).toLowerCase();

  const gatewayConfigured = Boolean(gatewayUrl && gatewayKey);
  const phantomCount = (msgs ?? []).filter((m) => String(m.wa_message_id).startsWith("local-")).length;

  console.log("=== Config ===");
  console.log(
    JSON.stringify(
      {
        waba,
        wa,
        gatewayUrl,
        gatewayKey: gatewayKey ? "(set)" : "(missing)",
        gatewayConfigured,
      },
      null,
      2,
    ),
  );
  console.log("\n=== Gateway ===");
  console.log(JSON.stringify({ health, connection, connectionState }, null, 2));
  console.log("\n=== Recent outbound ===");
  for (const m of msgs ?? []) {
    console.log(
      `- ${m.sent_at} | ${m.message_type} | ${m.status} | ${formatWaId(m.wa_message_id)} | ${m.body ?? "(sem texto)"} | ${m.remote_jid}`,
    );
  }

  await loadChatDiagnostics(args);

  if (args.phone && args.text) {
    const digits = args.phone.replace(/\D/g, "");
    console.log(`\n=== Test send to ${digits} ===`);
    const send = await gateway("/message/text", { number: digits, text: args.text });
    console.log(JSON.stringify(send, null, 2));
    const keyId =
      send.json?.result?.key?.id ??
      send.json?.key?.id ??
      send.json?.message?.key?.id ??
      null;
    if (keyId) console.log(`Confirmed wa_message_id: ${keyId}`);
    else console.log("ERRO: gateway nao confirmou wa_message_id");
  }

  printRecommendations({ gatewayConfigured, connectionState, phantomCount });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
