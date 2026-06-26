/**
 * Gera CRON_SECRET e MP_WEBHOOK_SECRET e atualiza .env local (se ausentes).
 * Para Vercel: imprime comandos ou aplica via CLI se VERCEL_TOKEN estiver definido.
 * Uso: node ./scripts/setup-production-secrets.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const envPath = resolve(process.cwd(), ".env");

function loadEnvText() {
  if (!existsSync(envPath)) return "";
  return readFileSync(envPath, "utf8");
}

function upsertEnvKey(text, key, value) {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) {
    return text.replace(pattern, line);
  }
  const suffix = text.endsWith("\n") || text.length === 0 ? "" : "\n";
  return `${text}${suffix}${line}\n`;
}

function generateSecret() {
  return randomBytes(32).toString("hex");
}

function setVercelEnv(name, value) {
  const result = spawnSync(
    "npx",
    ["vercel", "env", "add", name, "production", "--force"],
    {
      input: value,
      encoding: "utf8",
      shell: true,
      cwd: process.cwd(),
    },
  );

  if (result.status === 0) {
    console.log(`  Vercel production: ${name} configurado.`);
    return true;
  }

  console.warn(`  Vercel ${name}: ${result.stderr?.trim() || result.stdout?.trim() || "falhou"}`);
  return false;
}

async function main() {
  let envText = loadEnvText();
  const generated = {};

  for (const key of ["CRON_SECRET", "MP_WEBHOOK_SECRET"]) {
    const current = envText.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "").trim();
    if (current) {
      console.log(`${key}: ja existe no .env local (mantido).`);
      generated[key] = current;
    } else {
      generated[key] = generateSecret();
      envText = upsertEnvKey(envText, key, generated[key]);
      console.log(`${key}: gerado e salvo no .env local.`);
    }
  }

  writeFileSync(envPath, envText, "utf8");

  console.log("\nAplicando na Vercel (production)...");
  for (const [key, value] of Object.entries(generated)) {
    setVercelEnv(key, value);
  }

  console.log("\nSecrets prontos. Faca redeploy se a Vercel nao redeployar automaticamente.");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
