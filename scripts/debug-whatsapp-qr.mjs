#!/usr/bin/env node
/**
 * Testa geracao de QR no gateway Baileys (reset + connect + poll snapshot).
 *
 * Uso:
 *   node scripts/debug-whatsapp-qr.mjs
 */
if (!process.env.WHATSAPP_GATEWAY_KEY) {
  const { injectDeployEnv } = await import("./load-deploy-env.mjs");
  injectDeployEnv();
}

const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
const gatewayKey = process.env.WHATSAPP_GATEWAY_KEY ?? "";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gateway(path, init = {}) {
  const res = await fetch(`${gatewayUrl}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      apikey: gatewayKey,
      Authorization: `Bearer ${gatewayKey}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
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

function qrInfo(payload) {
  const raw =
    payload?.qrcode ?? payload?.base64 ?? payload?.qrCode ?? null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return { length: raw.length, prefix: raw.slice(0, 48) };
}

async function main() {
  console.log("=== debug-whatsapp-qr ===");
  console.log("gateway:", gatewayUrl);

  const health = await gateway("/health");
  console.log("health:", JSON.stringify(health, null, 2));

  console.log("\nPOST /reset");
  const reset = await gateway("/reset", { method: "POST" });
  console.log(JSON.stringify(reset, null, 2));
  await sleep(1500);

  console.log("\nPOST /connect/qr");
  const start = await gateway("/connect/qr", { method: "POST", timeoutMs: 10_000 });
  console.log(JSON.stringify(start, null, 2));

  for (let i = 0; i < 15; i += 1) {
    await sleep(2000);
    const snap = await gateway("/connect/qr/snapshot");
    const qr = qrInfo(snap.json);
    const connection = snap.json?.connection ?? snap.json?.connectionState;
    const err = snap.json?.lastAuthError ?? null;
    console.log(
      `poll ${i + 1}: status=${snap.status} connection=${connection} qr=${qr ? `yes(${qr.length})` : "no"} error=${err ?? ""}`,
    );
    if (qr) {
      console.log("qr prefix:", qr.prefix);
      console.log("\nOK — QR disponivel no gateway.");
      return;
    }
    if (err && connection === "disconnected") {
      console.error("\nFalha:", err);
      process.exit(1);
    }
  }

  console.error("\nTimeout: gateway nao devolveu QR em 30s.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
