#!/usr/bin/env node
import { existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobileRoot = join(root, "mobile");
const nodeModules = join(mobileRoot, "node_modules");

console.log("=== Setup mobile / Expo Go ===\n");

const doctor = spawnSync(process.execPath, [join(root, "scripts/check-mobile-expo.mjs")], {
  encoding: "utf8",
  stdio: "pipe",
});

if (doctor.status === 0) {
  console.log(doctor.stdout);
  console.log("Nada a fazer.");
  process.exit(0);
}

console.log(doctor.stdout || doctor.stderr);

if (existsSync(nodeModules)) {
  console.log("\nRemovendo mobile/node_modules corrompido...");
  rmSync(nodeModules, { recursive: true, force: true });
}

console.log("\nInstalando dependencias (mobile)...");
const install = spawnSync("npm", ["install"], {
  cwd: mobileRoot,
  stdio: "inherit",
  shell: true,
});

if (install.status !== 0) {
  console.error("\nFalhou. Verifique espaco em disco (min. 2 GB livres no C:).");
  process.exit(install.status ?? 1);
}

console.log("\nOK. Agora rode:");
console.log("  npm run mobile:tunnel");
console.log("Escaneie o QR que aparecer no terminal (modo tunnel evita timeout).");
