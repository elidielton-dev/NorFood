#!/usr/bin/env node
/**
 * Validação rápida de prontidão em produção.
 * Uso: npm run validate:ready
 */
import { spawn } from "node:child_process";

const steps = [
  "validate:production",
  "validate:approval",
  "validate:loja-delivery-e2e",
  "validate:billing:e2e",
  "validate:system:e2e",
];

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script], { stdio: "inherit", shell: true });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}`))));
  });
}

console.log("=== Norfood — validação de prontidão ===\n");
const results = [];

for (const script of steps) {
  try {
    await run(script);
    results.push({ script, ok: true });
  } catch (e) {
    results.push({ script, ok: false, error: e.message });
  }
}

console.log("\n" + "=".repeat(50));
console.log("RESUMO");
for (const r of results) {
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.script}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error("\nFalhas:", failed.map((f) => f.script).join(", "));
  process.exit(1);
}

console.log("\nSistema core validado. Veja GAPs acima (Resend, WABA, fiscal).");
