#!/usr/bin/env node
/**
 * Validação ponta a ponta do WhatsApp (gateway Baileys ou Evolution legado).
 * Variáveis: WHATSAPP_GATEWAY_URL, WHATSAPP_GATEWAY_KEY
 * Legado: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME
 */

const useGateway = Boolean(process.env.WHATSAPP_GATEWAY_URL?.trim());
const baseUrl = (
  useGateway
    ? process.env.WHATSAPP_GATEWAY_URL
    : process.env.EVOLUTION_API_URL ?? "http://54.207.185.74:8080"
).replace(/\/$/, "");
const apiKey = useGateway
  ? (process.env.WHATSAPP_GATEWAY_KEY ?? "")
  : (process.env.EVOLUTION_API_KEY ?? "AbelhaMel2026Segura");
const instance = (process.env.WHATSAPP_INSTANCE_NAME ?? process.env.EVOLUTION_INSTANCE_NAME ?? "norfood").trim();
const testContact = process.env.WHATSAPP_TEST_CONTACT ?? "maykonvrumvrum";
const testMessage = process.env.WHATSAPP_TEST_MESSAGE ?? "teste validacao";
const webhookUrl =
  process.env.WHATSAPP_WEBHOOK_URL ?? "https://abelhaemel.vercel.app/api/whatsapp/webhook";

let failed = 0;

async function api(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const started = Date.now();
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, ms: Date.now() - started, body };
}

function log(step, result, extra = "") {
  const status = result.ok ? "OK" : "FAIL";
  if (!result.ok) failed += 1;
  console.log(`[${status}] ${step} (${result.ms}ms) ${extra}`.trim());
  if (!result.ok) console.log("  ", JSON.stringify(result.body).slice(0, 400));
}

async function main() {
  console.log(
    `\n=== Validação WhatsApp (${useGateway ? "Baileys gateway" : "Evolution"}) — ${instance} @ ${baseUrl} ===\n`,
  );

  if (useGateway) {
    const health = await api("/health");
    log("1. Health gateway", health);

    const connection = await api("/connection");
    log("2. Connection", connection);
    const state = String(connection.body?.state ?? connection.body?.instance?.state ?? "");
    const connected = state === "open";
    if (!connected) {
      console.error("WhatsApp não está conectado no gateway. Pareie o número antes de continuar.");
      process.exit(1);
    }

    const webhookPing = await fetch(webhookUrl, { method: "GET" }).catch(() => null);
    log("3. Webhook painel (GET)", {
      ok: webhookPing?.ok ?? false,
      status: webhookPing?.status ?? 0,
      ms: 0,
      body: webhookPing ? await webhookPing.json().catch(() => ({})) : {},
    });

    const chats = await api("/chats");
    const chatList = Array.isArray(chats.body) ? chats.body : [];
    log("4. /chats", chats, `→ ${chatList.length} conversas`);

    const contacts = await api("/contacts");
    const contactList = Array.isArray(contacts.body) ? contacts.body : [];
    log("5. /contacts", contacts, `→ ${contactList.length} contatos`);

    const match = contactList.find((c) =>
      String(c.pushName ?? "").toLowerCase().includes(testContact.toLowerCase()),
    );
    if (!match?.remoteJid) {
      console.warn(`\nContato "${testContact}" não encontrado — pulando envio de teste.`);
    } else {
      const number = match.remoteJid.split("@")[0];
      const send = await api("/message/text", {
        method: "POST",
        body: JSON.stringify({ number, text: testMessage }),
      });
      log("6. sendText", send, `"${testMessage}" para ${number}`);
    }

    console.log("\n--- Resumo ---");
    if (failed > 0) {
      console.error(`✗ ${failed} etapa(s) falharam.`);
      process.exit(1);
    }
    console.log("✓ Validação concluída. Gateway Baileys OK.\n");
    return;
  }

  const instances = await api(`/instance/fetchInstances?instanceName=${instance}`);
  log("1. Instância", instances);
  const row = Array.isArray(instances.body) ? instances.body[0] : instances.body;
  const connected = String(row?.connectionStatus ?? "").toLowerCase() === "open";
  console.log(`   connectionStatus: ${row?.connectionStatus ?? "?"} | profile: ${row?.profileName ?? "?"}\n`);
  if (!connected) {
    console.error("WhatsApp não está conectado. Escaneie o QR Code antes de continuar.");
    process.exit(1);
  }

  const webhook = await api(`/webhook/find/${instance}`);
  log("2. Webhook Evolution", webhook);
  const webhookNested = webhook.body?.webhook ?? webhook.body;
  const webhookConfigured = Boolean(webhookNested?.enabled && webhookNested?.url);
  console.log(`   url: ${webhookNested?.url ?? "?"} | enabled: ${webhookNested?.enabled ?? "?"}\n`);
  if (!webhookConfigured) {
    console.warn("⚠ Webhook não configurado na Evolution — mensagens podem não chegar ao painel.");
  } else if (webhookNested.url !== webhookUrl) {
    console.warn(`⚠ URL webhook diferente do esperado: ${webhookUrl}`);
  }

  const webhookPing = await fetch(webhookUrl, { method: "GET" }).catch(() => null);
  log("3. Webhook painel (GET)", {
    ok: webhookPing?.ok ?? false,
    status: webhookPing?.status ?? 0,
    ms: 0,
    body: webhookPing ? await webhookPing.json().catch(() => ({})) : {},
  });

  const chats = await api(`/chat/findChats/${instance}`, { method: "POST", body: "{}" });
  const chatList = Array.isArray(chats.body) ? chats.body : [];
  log("4. findChats", chats, `→ ${chatList.length} conversas`);

  const contacts = await api(`/chat/findContacts/${instance}`, { method: "POST", body: "{}" });
  const contactList = Array.isArray(contacts.body) ? contacts.body : [];
  log("5. findContacts", contacts, `→ ${contactList.length} contatos`);

  const match = contactList.find((c) =>
    String(c.pushName ?? "").toLowerCase().includes(testContact.toLowerCase()),
  );
  if (!match?.remoteJid) {
    console.error(`\nContato "${testContact}" não encontrado em findContacts.`);
    process.exit(1);
  }
  console.log(`\n6. Contato alvo: ${match.pushName} → ${match.remoteJid}`);

  const messages = await api(`/chat/findMessages/${instance}`, {
    method: "POST",
    body: JSON.stringify({
      where: { key: { remoteJid: match.remoteJid } },
      limit: 5,
    }),
  });
  const msgRecords = Array.isArray(messages.body)
    ? messages.body
    : (messages.body?.messages?.records ?? []);
  log("7. findMessages", messages, `→ ${msgRecords.length} mensagens recentes`);

  const number = match.remoteJid.split("@")[0];
  const send = await api(`/message/sendText/${instance}`, {
    method: "POST",
    body: JSON.stringify({ number, text: testMessage }),
  });
  log("8. sendText", send, `"${testMessage}" para ${number}`);

  console.log("\n--- Resumo ---");
  if (failed > 0) {
    console.error(`✗ ${failed} etapa(s) falharam.`);
    process.exit(1);
  }
  console.log("✓ Validação concluída. Evolution OK + webhook acessível + mensagens legíveis.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
