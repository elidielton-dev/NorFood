#!/usr/bin/env node
/**
 * Validação completa do sistema NorFood em produção.
 * Uso: node scripts/validate-system-full.mjs
 */
import { spawn } from "node:child_process";

const steps = [
  { name: "Cadastro SaaS", script: "validate:signup" },
  { name: "Faturamento E2E", script: "validate:billing:e2e" },
  { name: "Sistema E2E", script: "validate:system:e2e" },
  { name: "Produtos módulo", script: "validate:produtos-module" },
  { name: "Checkout cliente", script: "validate:real-checkout" },
  { name: "Delivery completo", script: "validate:real-complete-delivery" },
  { name: "App entregador", script: "validate:real-rider-app" },
  { name: "Rotas produção HTTP", script: "validate:production" },
];

function run(cmd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [], { stdio: "inherit", shell: true, cwd: process.cwd() });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
}

async function runStep(step) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`>> ${step.name}`);
  console.log("=".repeat(60));
  await run(`npm run ${step.script}`);
}

const results = [];
console.log("=== Validação completa NorFood ===");
console.log(`Início: ${new Date().toISOString()}\n`);

for (const step of steps) {
  try {
    await runStep(step);
    results.push({ name: step.name, ok: true });
    console.log(`\n✓ ${step.name} — OK`);
  } catch (e) {
    results.push({ name: step.name, ok: false, error: e.message });
    console.error(`\n✗ ${step.name} — FALHOU (${e.message})`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log("RESUMO FINAL");
console.log("=".repeat(60));
const ok = results.filter((r) => r.ok);
const fail = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}`);
}
console.log(`\nTotal: ${ok.length}/${results.length} módulos OK`);

if (fail.length) {
  console.error("\nMódulos com falha:", fail.map((f) => f.name).join(", "));
  process.exit(1);
}

console.log("\nSistema validado ponta a ponta.");
