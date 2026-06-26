import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminClient } from "./supabase-real-tracking-tools.mjs";

const envPath = resolve(process.cwd(), ".env");
const envText = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      const value = line.slice(index + 1).replace(/^"|"$/g, "");
      return [key, value];
    }),
);

const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];

const missing = required.filter((key) => !env[key]);
if (missing.length > 0) {
  console.error("Variaveis ausentes no .env:", missing.join(", "));
  process.exit(1);
}

if (env.VITE_DEMO_MODE === "true") {
  console.error('VITE_DEMO_MODE esta "true". Para producao, use VITE_DEMO_MODE="false".');
  process.exit(1);
}

const recommended = [
  "MP_WEBHOOK_SECRET",
  "CRON_SECRET",
  "ENCRYPTION_KEY",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
];

const missingRecommended = recommended.filter((key) => !env[key]);
if (missingRecommended.length > 0) {
  console.warn("Variaveis recomendadas ausentes no .env:", missingRecommended.join(", "));
}

const maxTenants = env.NORFOOD_MAX_TENANTS;
if (maxTenants) {
  console.log(`Capacidade configurada: ate ${maxTenants} tenants (NORFOOD_MAX_TENANTS).`);
} else {
  console.log("Capacidade padrao VPS 8GB: ate 35 tenants (defina NORFOOD_MAX_TENANTS).");
}

if (!env.PUBLIC_APP_URL || env.PUBLIC_APP_URL.includes("localhost")) {
  console.warn("PUBLIC_APP_URL deve ser a URL HTTPS publica em producao.");
}

console.log("1/2 Variaveis de producao no .env: ok");

const { count, error } = await adminClient
  .from("produtos")
  .select("id", { count: "exact", head: true });

if (error) {
  console.error("Falha ao conectar no Supabase:", error.message);
  process.exit(1);
}

console.log(`2/2 Supabase conectado. Catalogo com ${count ?? 0} produto(s).`);
console.log("Ambiente pronto para modo producao.");
