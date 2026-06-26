/**
 * Cria secrets do EAS a partir do .env da raiz (Supabase publico do app mobile).
 * Uso: node ./scripts/setup-eas-secrets.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const envPath = resolve(process.cwd(), ".env");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

function createEasEnv(name, value) {
  const result = spawnSync(
    "npx",
    ["eas-cli", "env:create", "--name", name, "--value", value, "--environment", "preview", "--force"],
    {
      cwd: resolve(process.cwd(), "mobile"),
      encoding: "utf8",
      shell: true,
    },
  );

  if (result.status === 0) {
    console.log(`  EAS env ${name} (preview): ok`);
    return true;
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (output.includes("already exists") || output.includes("Updated")) {
    console.log(`  EAS env ${name}: atualizado`);
    return true;
  }

  console.warn(`  EAS env ${name}: ${output || "falhou — rode npx eas-cli login"}`);
  return false;
}

async function main() {
  const env = loadEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key =
    env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("EXPO_PUBLIC_SUPABASE_* ou VITE_SUPABASE_* ausentes no .env");
  }

  console.log("Configurando variaveis EAS para build mobile...");
  createEasEnv("EXPO_PUBLIC_SUPABASE_URL", url);
  createEasEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
  console.log("\nDepois rode: npx eas-cli login && npm run mobile:build:apk");
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
