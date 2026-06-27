#!/usr/bin/env node
/**
 * Configura Mercado Pago em deploy/.env e opcionalmente na VPS.
 *
 * Uso:
 *   node scripts/setup-mp-production.mjs
 *   node scripts/setup-mp-production.mjs APP_USR-xxx APP_USR-xxx-public
 *   node scripts/setup-mp-production.mjs APP_USR-xxx APP_USR-xxx-public --deploy
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, "deploy/.env");
const deployFlag = process.argv.includes("--deploy");
const positional = process.argv.slice(2).filter((arg) => arg !== "--deploy");
const accessToken = positional[0]?.trim();
const publicKey = positional[1]?.trim();

function loadEnvText() {
  if (!existsSync(envPath)) {
    console.error("Arquivo deploy/.env não encontrado.");
    process.exit(1);
  }
  return readFileSync(envPath, "utf8");
}

function upsertEnvKey(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text.trimEnd()}\n${line}\n`;
}

function readEnvValue(text, key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return "";
  return match[1].replace(/^["']|["']$/g, "").trim();
}

async function main() {
  let envText = loadEnvText();
  const domain = readEnvValue(envText, "DOMAIN") || "norfood.com.br";
  const publicUrl = readEnvValue(envText, "PUBLIC_APP_URL") || `https://${domain}`;
  const webhookUrl = `${publicUrl.replace(/\/+$/, "")}/api/mercado-pago/webhook`;

  envText = upsertEnvKey(envText, "MP_WEBHOOK_URL", webhookUrl);
  envText = upsertEnvKey(envText, "MP_ENVIRONMENT", "production");

  const currentSecret = readEnvValue(envText, "MP_WEBHOOK_SECRET");
  if (!currentSecret) {
    envText = upsertEnvKey(envText, "MP_WEBHOOK_SECRET", randomBytes(32).toString("hex"));
    console.log("MP_WEBHOOK_SECRET: gerado");
  }

  if (accessToken) {
    envText = upsertEnvKey(envText, "MP_ACCESS_TOKEN", accessToken);
    console.log("MP_ACCESS_TOKEN: atualizado");
  }
  if (publicKey) {
    envText = upsertEnvKey(envText, "VITE_MP_PUBLIC_KEY", publicKey);
    console.log("VITE_MP_PUBLIC_KEY: atualizado");
  }

  writeFileSync(envPath, envText, "utf8");
  console.log("\n=== deploy/.env atualizado ===");
  console.log("Webhook URL:", webhookUrl);

  const token = readEnvValue(envText, "MP_ACCESS_TOKEN");
  const pk = readEnvValue(envText, "VITE_MP_PUBLIC_KEY");
  if (!token || !pk) {
    console.log("\nPendente: obtenha no painel Mercado Pago Developers:");
    console.log("  1. Access Token (produção) → MP_ACCESS_TOKEN");
    console.log("  2. Public Key → VITE_MP_PUBLIC_KEY");
    console.log("\nDepois rode:");
    console.log("  node scripts/setup-mp-production.mjs SEU_TOKEN SUA_PUBLIC_KEY --deploy");
    console.log("\nNo MP, cadastre webhook Payments:");
    console.log(" ", webhookUrl);
    console.log("  Secret = valor de MP_WEBHOOK_SECRET em deploy/.env");
  } else {
    const res = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    console.log("\nValidação MP API:", res.status, body.nickname ?? body.message ?? "ok");
  }

  if (deployFlag) {
    console.log("\n==> Enviando deploy/.env para VPS e rebuild...");
    const scp = spawnSync(
      "scp",
      [
        "-i",
        resolve(process.env.NORFOOD_SSH_KEY ?? "C:/Users/elidi/Downloads/norfood.pem"),
        "-o",
        "StrictHostKeyChecking=no",
        envPath,
        "ubuntu@15.228.214.190:/opt/norfood/deploy/.env",
      ],
      { stdio: "inherit", shell: true },
    );
    if (scp.status !== 0) process.exit(scp.status ?? 1);

    const ssh = spawnSync(
      "ssh",
      [
        "-i",
        resolve(process.env.NORFOOD_SSH_KEY ?? "C:/Users/elidi/Downloads/norfood.pem"),
        "-o",
        "StrictHostKeyChecking=no",
        "ubuntu@15.228.214.190",
        "bash /opt/norfood/deploy/update-vps.sh",
      ],
      { stdio: "inherit", shell: true },
    );
    if (ssh.status !== 0) process.exit(ssh.status ?? 1);

    const health = await fetch(`${publicUrl}/api/mercado-pago/webhook`);
    console.log("\nProdução webhook:", health.status, await health.text());
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
