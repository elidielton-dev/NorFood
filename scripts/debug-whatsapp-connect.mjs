#!/usr/bin/env node
/**
 * Testa fluxo completo: reset + QR + poll ate connected ou profile com telefone.
 *
 * Uso:
 *   node scripts/debug-whatsapp-connect.mjs
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

function mapConnection(payload) {
  const raw = String(
    payload?.connection ?? payload?.connectionState ?? payload?.state ?? "",
  ).toLowerCase();
  if (raw === "open" || raw === "connected") return "connected";
  if (raw === "connecting") return "connecting";
  return "disconnected";
}

function qrInfo(payload) {
  const raw =
    payload?.qrcode ?? payload?.base64 ?? payload?.qrCode ?? null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return { length: raw.length };
}

async function main() {
  console.log("=== debug-whatsapp-connect ===");
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

  let qrSeen = false;

  for (let i = 0; i < 30; i += 1) {
    await sleep(2000);

    const [snap, conn, profile] = await Promise.all([
      gateway("/connect/qr/snapshot"),
      gateway("/connection"),
      gateway("/profile"),
    ]);

    const connection =
      mapConnection(conn.json) === "connected"
        ? "connected"
        : mapConnection(snap.json);
    const qr = qrInfo(snap.json);
    if (qr) qrSeen = true;

    const phone =
      profile.json?.phoneNumber ??
      profile.json?.ownerJid?.split("@")[0]?.split(":")[0] ??
      null;
    const err = snap.json?.lastAuthError ?? null;

    console.log(
      `poll ${i + 1}: connection=${connection} qr=${qr ? `yes(${qr.length})` : qrSeen ? "cleared" : "no"} phone=${phone ?? ""} error=${err ?? ""}`,
    );

    if (connection === "connected" || phone) {
      console.log("\nOK — sessao conectada no gateway.");
      console.log("profile:", JSON.stringify(profile.json, null, 2));
      return;
    }

    if (err && connection === "disconnected" && !qr) {
      console.error("\nFalha:", err);
      process.exit(1);
    }
  }

  console.error(
    "\nTimeout: gateway nao ficou connected em 60s. Escaneie o QR no celular e rode de novo.",
  );
  process.exit(qrSeen ? 2 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
