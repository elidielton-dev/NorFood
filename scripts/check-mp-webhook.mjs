#!/usr/bin/env node
/**
 * Verifica webhook Mercado Pago: endpoint, credenciais e notificações recentes.
 * Uso: node scripts/check-mp-webhook.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";

function loadEnv(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, eq).trim()] = value;
  }
  return env;
}

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, "deploy/.env")) };
const token = env.MP_ACCESS_TOKEN?.trim();
const secret = env.MP_WEBHOOK_SECRET?.trim();
const webhookUrl = `${BASE}/api/mercado-pago/webhook`;

console.log("=== Webhook Mercado Pago Norfood ===\n");

const getRes = await fetch(webhookUrl);
const summary = await getRes.json();
console.log("1. Endpoint GET:", getRes.status);
console.log("   hasAccessToken:", summary.hasAccessToken);
console.log("   hasWebhookSecret:", summary.hasWebhookSecret);
console.log("   hasPublicKey:", summary.hasPublicKey);
console.log("   webhookUrl:", summary.webhookUrl);

console.log("\n2. POST sem assinatura (deve rejeitar):");
const badPost = await fetch(webhookUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "payment", data: { id: "12345" } }),
});
const badBody = await badPost.json().catch(() => ({}));
console.log("   status:", badPost.status, badBody.error ?? badBody);

if (secret) {
  console.log("\n3. POST com assinatura simulada (teste interno):");
  const dataId = "999999999";
  const requestId = "test-request-id";
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  const goodPost = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": requestId,
    },
    body: JSON.stringify({ type: "payment", data: { id: dataId } }),
  });
  const goodBody = await goodPost.text();
  console.log("   status:", goodPost.status);
  console.log("   body:", goodBody.slice(0, 300));
  if (goodPost.status === 200) {
    console.log("   ✓ Assinatura aceita (200 OK para simulação MP)");
  }
}

if (token) {
  console.log("\n4. Webhooks cadastrados no Mercado Pago:");
  for (const path of ["/v1/webhooks", "/checkout/preferences/search?limit=1"]) {
    try {
      const res = await fetch(`https://api.mercadopago.com${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      console.log(`   ${path}: HTTP ${res.status}`);
      if (path.includes("webhooks") && res.ok) {
        const data = JSON.parse(text);
        const items = Array.isArray(data) ? data : data.results ?? data.webhooks ?? [];
        if (!items.length) {
          console.log("   ⚠ Nenhum webhook cadastrado no painel MP ainda.");
          console.log("   Cadastre em: https://www.mercadopago.com.br/developers/panel/app");
          console.log("   URL:", webhookUrl);
        } else {
          for (const w of items) {
            console.log("   -", w.url ?? w.notification_url ?? JSON.stringify(w).slice(0, 120));
          }
        }
      }
    } catch (err) {
      console.log(`   ${path}: erro`, err.message);
    }
  }

  console.log("\n5. Pagamentos recentes (últimos 5):");
  const payRes = await fetch(
    "https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=5",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (payRes.ok) {
    const payData = await payRes.json();
    const results = payData.results ?? [];
    if (!results.length) {
      console.log("   Nenhum pagamento ainda — webhook só dispara após um pagamento.");
    } else {
      for (const p of results) {
        const ref = p.external_reference ?? "-";
        console.log(`   #${p.id} ${p.status} R$${p.transaction_amount} ref=${ref}`);
      }
    }
  } else {
    console.log("   HTTP", payRes.status);
  }
}

console.log("\n=== Resumo ===");
if (summary.hasAccessToken && summary.hasWebhookSecret && badPost.status === 401) {
  console.log("Servidor pronto para receber notificações.");
  console.log("Se o MP ainda não enviou nada, cadastre o webhook no painel com o secret do deploy/.env");
} else {
  console.log("Verifique credenciais ou configuração do endpoint.");
}
