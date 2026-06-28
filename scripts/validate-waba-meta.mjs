#!/usr/bin/env node
/** Validação Atendimento Meta — config, mensagens, webhook POST */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { injectDeployEnv } from "./load-deploy-env.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
injectDeployEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const META_APP_SECRET = process.env.META_APP_SECRET;
const WEBHOOK_URL =
  process.env.WABA_WEBHOOK_URL ?? "https://abelhaemel.vercel.app/api/waba/webhook";

function signBody(rawBody, secret) {
  return (
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  );
}

async function main() {
  console.log("=== Validação Atendimento Meta ===\n");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("FAIL: faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: config, error: cfgErr } = await db
    .from("waba_config")
    .select("phone_number_id, waba_id, status, display_phone_number, access_token, verify_token, updated_at")
    .eq("workspace_id", "default")
    .maybeSingle();

  if (cfgErr) {
    console.error("FAIL waba_config:", cfgErr.message);
    process.exit(1);
  }

  if (!config?.phone_number_id) {
    console.error("FAIL: waba_config vazio — rode setup-waba-meta.mjs");
    process.exit(1);
  }

  console.log("OK config:", {
    phone_number_id: config.phone_number_id,
    display: config.display_phone_number,
    status: config.status,
    has_token: Boolean(config.access_token),
    has_verify: Boolean(config.verify_token),
    updated_at: config.updated_at,
  });

  const { count: convCount } = await db
    .from("waba_conversations")
    .select("*", { count: "exact", head: true });
  const { count: msgCount } = await db
    .from("waba_messages")
    .select("*", { count: "exact", head: true });
  const { data: recentMsgs } = await db
    .from("waba_messages")
    .select("id, content_text, sender_type, wa_message_id, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("\nBanco:", { conversas: convCount ?? 0, mensagens: msgCount ?? 0 });
  if (recentMsgs?.length) {
    console.log("Últimas mensagens:");
    for (const m of recentMsgs) {
      console.log(`  - [${m.sender_type}] ${m.content_text?.slice(0, 60) ?? "—"} (${m.created_at})`);
    }
  } else {
    console.log("WARN: nenhuma mensagem em waba_messages — webhook não gravou nada ainda");
  }

  // GET verify
  const getUrl = `${WEBHOOK_URL}?hub.mode=subscribe&hub.challenge=validation-challenge&hub.verify_token=abelha-mel-2026`;
  const getRes = await fetch(getUrl);
  const getText = await getRes.text();
  console.log("\nWebhook GET:", getRes.status, getText === "validation-challenge" ? "OK" : getText.slice(0, 80));

  // POST sem assinatura (deve falhar se META_APP_SECRET na Vercel)
  const fakePayload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: config.phone_number_id },
              contacts: [{ profile: { name: "Teste Validação" }, wa_id: "558781541408" }],
              messages: [
                {
                  id: `wamid.validation.${Date.now()}`,
                  from: "558781541408",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Mensagem de teste automático validação" },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const postNoSig = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: fakePayload,
  });
  const postNoSigText = await postNoSig.text();
  console.log("\nWebhook POST sem assinatura:", postNoSig.status, postNoSigText.slice(0, 120));
  if (postNoSig.status === 403) {
    console.log(
      ">>> PROVÁVEL CAUSA: Meta envia POST com assinatura, mas rejeitamos se inválida.",
      "Se META_APP_SECRET na Vercel ≠ App Secret atual, TODAS mensagens são bloqueadas.",
    );
  }

  if (META_APP_SECRET) {
    const sig = signBody(fakePayload, META_APP_SECRET);
    const postSig = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sig,
      },
      body: fakePayload,
    });
    const postSigText = await postSig.text();
    console.log("\nWebhook POST com assinatura (local secret):", postSig.status, postSigText);

    if (postSig.ok) {
      const { count: afterCount } = await db
        .from("waba_messages")
        .select("*", { count: "exact", head: true });
      console.log("Mensagens após inject:", afterCount ?? 0);
    }
  } else {
    console.log("\nSKIP POST assinado: META_APP_SECRET não está no .env local");
  }

  // Meta API token check + WABA subscription
  let accessToken = null;
  if (config.access_token && process.env.ENCRYPTION_KEY) {
    const parts = config.access_token.split(":");
    if (parts.length === 3) {
      const [ivHex, ctHex, tagHex] = parts;
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        Buffer.from(process.env.ENCRYPTION_KEY, "hex"),
        Buffer.from(ivHex, "hex"),
      );
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      accessToken = decipher.update(ctHex, "hex", "utf8");
      accessToken += decipher.final("utf8");

      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${config.phone_number_id}?fields=display_phone_number`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const metaJson = await metaRes.json();
      console.log(
        "\nMeta API token:",
        metaRes.ok ? `OK ${metaJson.display_phone_number ?? ""}` : `FAIL ${JSON.stringify(metaJson.error ?? metaJson).slice(0, 200)}`,
      );

      if (config.waba_id) {
        const wabaSubs = await fetch(
          `https://graph.facebook.com/v21.0/${config.waba_id}/subscribed_apps`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const wabaJson = await wabaSubs.json();
        const apps = wabaJson.data ?? [];
        console.log(
          "\nWABA inscrito no app:",
          wabaSubs.ok && apps.length > 0 ? `OK (${apps.length} app(s))` : `FAIL ou vazio — ${JSON.stringify(wabaJson.error ?? wabaJson).slice(0, 200)}`,
        );
        if (!wabaSubs.ok || apps.length === 0) {
          console.log(
            ">>> CAUSA PROVÁVEL: WABA não inscrito no app. Rode: node scripts/setup-waba-meta.mjs (com token novo)",
          );
        }
      }

      const appId = process.env.META_APP_ID;
      if (appId) {
        const appSubs = await fetch(`https://graph.facebook.com/v21.0/${appId}/subscriptions`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const appJson = await appSubs.json();
        if (appSubs.ok && appJson.data?.length) {
          console.log("\nApp webhook subscriptions:");
          for (const s of appJson.data) {
            console.log(`  - object=${s.object} fields=${(s.fields ?? []).join(",")} callback=${s.callback_url ?? "—"}`);
          }
          const wabaSub = appJson.data.find((s) => s.object === "whatsapp_business_account");
          if (!wabaSub?.fields?.includes("messages")) {
            console.log(">>> CAUSA PROVÁVEL: campo 'messages' não assinado no webhook do app");
          }
        } else {
          console.log(
            "\nApp subscriptions:",
            appSubs.ok ? "nenhuma (configure webhook na Meta)" : `FAIL ${JSON.stringify(appJson.error ?? appJson).slice(0, 200)}`,
          );
          console.log(
            ">>> CAUSA PROVÁVEL: webhook não configurado em Meta → WhatsApp → Configuration",
          );
        }
      }
    }
  }

  // Mensagem real do usuário (5587981189176) no banco?
  const USER_PHONE = process.env.WABA_TEST_USER_PHONE ?? "5587981189176";
  const { data: userMsgs } = await db
    .from("waba_messages")
    .select("content_text, created_at, wa_message_id")
    .ilike("content_text", "%Oi%")
    .order("created_at", { ascending: false })
    .limit(3);
  const { data: userContact } = await db
    .from("waba_contacts")
    .select("id, phone, name")
    .or(`phone.eq.${USER_PHONE},phone.ilike.%981189176%`)
    .limit(1);

  console.log(`\nMensagem real do celular ${USER_PHONE}:`);
  if (userContact?.length) {
    console.log("  Contato encontrado:", userContact[0].name, userContact[0].phone);
  } else {
    console.log("  NENHUM contato — Meta nunca entregou webhook da sua mensagem 'Oi'");
  }
  if (userMsgs?.length) {
    for (const m of userMsgs) console.log(`  - "${m.content_text}" (${m.created_at})`);
  }

  // Simula inbound "Oi" do usuário (prova que UI gravaria se Meta entregasse)
  if (META_APP_SECRET) {
    const oiPayload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: config.phone_number_id },
                contacts: [{ profile: { name: "Guilherme" }, wa_id: USER_PHONE }],
                messages: [
                  {
                    id: `wamid.useroi.${Date.now()}`,
                    from: USER_PHONE,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Oi" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const oiSig = signBody(oiPayload, META_APP_SECRET);
    const oiRes = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": oiSig },
      body: oiPayload,
    });
    console.log("\nSimulação webhook 'Oi' do seu celular:", oiRes.status, (await oiRes.text()).slice(0, 80));
    if (oiRes.ok) {
      console.log(">>> Pipeline OK — atualize Conversas: deve aparecer conversa com Guilherme / Oi");
    }
  }

  const { data: allConvs } = await db
    .from("waba_conversations")
    .select("last_message_text, contact:waba_contacts(phone, name)")
    .order("updated_at", { ascending: false })
    .limit(5);
  if (allConvs?.length) {
    console.log("\nConversas atuais:");
    for (const c of allConvs) {
      const ct = c.contact;
      console.log(`  - ${ct?.name ?? "?"} (${ct?.phone ?? "?"}) — "${c.last_message_text?.slice(0, 40) ?? ""}"`);
    }
  }

  console.log("\n=== Fim ===");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
