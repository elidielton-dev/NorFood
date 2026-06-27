#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobileRoot = join(root, "mobile");
const expoCli = join(mobileRoot, "node_modules", "expo", "bin", "cli.js");

function freeDiskGb() {
  try {
    if (process.platform === "win32") {
      const out = execSync('powershell -NoProfile -Command "(Get-PSDrive C).Free / 1GB"', {
        encoding: "utf8",
      });
      return Number.parseFloat(out.trim());
    }
  } catch {
    /* optional */
  }
  return null;
}

async function isMetroRunning(port = 8081) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`);
    const body = await response.text();
    return body.includes("packager-status:running");
  } catch {
    return false;
  }
}

function checkExpoInstall() {
  if (!existsSync(expoCli)) {
    return {
      ok: false,
      message: "Pacote expo incompleto ou ausente (mobile/node_modules/expo/bin/cli.js).",
    };
  }
  try {
    if (statSync(expoCli).size < 100) {
      return { ok: false, message: "CLI do Expo corrompido (instalacao incompleta)." };
    }
  } catch {
    return { ok: false, message: "Nao foi possivel ler o CLI do Expo." };
  }
  return { ok: true };
}

const freeGb = freeDiskGb();
const expo = checkExpoInstall();
const metro = await isMetroRunning();

console.log("=== Diagnostico Expo Go (mobile) ===\n");
console.log(`Disco C livre: ${freeGb === null ? "?" : `${freeGb.toFixed(1)} GB`}`);
console.log(`Expo instalado: ${expo.ok ? "OK" : "FALHOU — " + expo.message}`);
console.log(`Metro (8081): ${metro ? "RODANDO" : "parado"}`);

const issues = [];
if (freeGb !== null && freeGb < 2) {
  issues.push("Libere pelo menos 2–3 GB no disco C antes de npm install.");
}
if (!expo.ok) {
  issues.push("Reinstale: npm run mobile:setup");
}
if (!metro) {
  issues.push("Inicie o Metro: npm run mobile:tunnel (tunnel evita timeout na Wi-Fi).");
}

if (issues.length) {
  console.log("\nCorrecoes:");
  issues.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));
  console.log("\nAlternativa imediata (producao): https://norfood.com.br/entregador");
  process.exit(1);
}

console.log("\nTudo pronto. Rode npm run mobile:tunnel e escaneie o QR do terminal.");
process.exit(0);
