#!/usr/bin/env node
/**
 * Deploy NorFood na VPS: rsync código + rebuild Docker.
 * Uso: node scripts/deploy-vps.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.NORFOOD_VPS_HOST ?? "ubuntu@15.228.214.190";
const appDir = process.env.NORFOOD_VPS_DIR ?? "/opt/norfood";
const sshKey = resolve(
  process.env.NORFOOD_SSH_KEY ??
    process.env.SSH_KEY ??
    "C:/Users/elidi/Downloads/norfood.pem",
);

function run(label, command, args, options = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${label} falhou (exit ${result.status ?? 1})`);
  }
}

function sshArgs(remoteCmd) {
  const base = [];
  if (existsSync(sshKey)) {
    base.push("-i", sshKey, "-o", "StrictHostKeyChecking=no");
  }
  base.push(host, remoteCmd);
  return base;
}

function scpArgs(local, remote) {
  const base = [];
  if (existsSync(sshKey)) {
    base.push("-i", sshKey, "-o", "StrictHostKeyChecking=no");
  }
  base.push("-r", local, remote);
  return base;
}

async function main() {
  console.log("=== Deploy NorFood VPS ===");
  console.log(`Host: ${host}`);
  console.log(`Dir:  ${appDir}`);
  console.log(`Key:  ${existsSync(sshKey) ? sshKey : "(agente SSH padrão)"}`);

  // 1. Sincroniza código (exclui node_modules, .git pesado, mobile pesado)
  const excludes = [
    "node_modules",
    "mobile/node_modules",
    ".git",
    "Chave Servidor NorFood",
    ".output",
    "dist",
    ".cursor",
  ];
  const tarExcludes = excludes.map((e) => `--exclude=${e}`).join(" ");

  // Windows: use scp of deploy folder + git pull alternative via tar over ssh
  if (process.platform === "win32") {
    console.log("\n==> Empacotando e enviando código via SSH...");
    const packCmd = `tar -czf - ${tarExcludes} -C "${root.replace(/\\/g, "/")}" .`;
    const unpackCmd = `mkdir -p ${appDir} && tar -xzf - -C ${appDir}`;
    const sshBase = existsSync(sshKey)
      ? `ssh -i "${sshKey}" -o StrictHostKeyChecking=no ${host}`
      : `ssh ${host}`;

    const pack = spawnSync("powershell", [
      "-NoProfile",
      "-Command",
      `${packCmd.replace(/"/g, '`"')} | ${sshBase} "${unpackCmd}"`,
    ], { stdio: "inherit", shell: true, cwd: root });

    if (pack.status !== 0) {
      console.log("\nFallback: git push + pull na VPS...");
      run("git push", "git", ["push", "origin", "main"], { cwd: root });
      run("git pull VPS", "ssh", sshArgs(`cd ${appDir} && git pull --ff-only origin main`));
    }
  } else {
    run("rsync", "rsync", [
      "-az",
      "--delete",
      ...excludes.flatMap((e) => ["--exclude", e]),
      `${root}/`,
      `${host}:${appDir}/`,
    ]);
  }

  // 2. Preserva .env local da VPS se existir — não sobrescreve
  // (deploy/.env já está na VPS)

  // 3. Rebuild Docker
  run(
    "docker rebuild",
    "ssh",
    sshArgs(`cd ${appDir}/deploy && docker compose build && docker compose up -d`),
  );

  // 4. Health check
  run(
    "health check",
    "ssh",
    sshArgs(
      `sleep 8 && curl -fsS https://norfood.com.br/api/health && echo "" && docker compose -f ${appDir}/deploy/docker-compose.yml ps`,
    ),
  );

  console.log("\n=== Deploy concluído ===");
  console.log("Site: https://norfood.com.br");
  console.log("Entregador: https://norfood.com.br/entregador");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
