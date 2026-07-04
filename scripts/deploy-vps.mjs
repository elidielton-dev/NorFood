#!/usr/bin/env node
/**
 * Deploy NorFood na VPS: rsync código + rebuild Docker.
 * Uso: node scripts/deploy-vps.mjs
 */
import { spawn, spawnSync } from "node:child_process";
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
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${label} falhou (exit ${result.status ?? 1})`);
  }
}

function sshBaseArgs() {
  const base = ["-o", "StrictHostKeyChecking=no"];
  if (existsSync(sshKey)) base.unshift("-i", sshKey);
  return base;
}

function runSsh(label, remoteCmd) {
  run(label, "ssh", [...sshBaseArgs(), host, remoteCmd]);
}

function syncCodeWindows(excludes) {
  console.log("\n==> Empacotando e enviando código via SSH...");
  const tarArgs = [
    "-czf",
    "-",
    ...excludes.flatMap((e) => ["--exclude", e]),
    "-C",
    root,
    ".",
  ];
  const unpackCmd = `mkdir -p ${appDir} && tar -xzf - -C ${appDir}`;

  return new Promise((resolvePromise, reject) => {
    const ssh = spawn("ssh", [...sshBaseArgs(), host, unpackCmd], { stdio: ["pipe", "inherit", "inherit"] });
    const tar = spawn("tar", tarArgs, { stdio: ["ignore", "pipe", "inherit"], cwd: root });

    tar.stdout.pipe(ssh.stdin);
    tar.on("error", reject);
    ssh.on("error", reject);

    let tarCode = null;
    let sshCode = null;
    const done = () => {
      if (tarCode === null || sshCode === null) return;
      if (tarCode !== 0 || sshCode !== 0) {
        reject(new Error(`sync falhou (tar=${tarCode}, ssh=${sshCode})`));
      } else {
        resolvePromise();
      }
    };
    tar.on("close", (code) => {
      tarCode = code;
      ssh.stdin.end();
      done();
    });
    ssh.on("close", (code) => {
      sshCode = code;
      done();
    });
  });
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
  // Windows: tar pipe over ssh (rsync indisponível nativamente)
  if (process.platform === "win32") {
    try {
      await syncCodeWindows(excludes);
    } catch (error) {
      console.warn(`\nSync via tar falhou: ${error.message ?? error}`);
      console.log("\nFallback: git push + pull na VPS...");
      run("git push", "git", ["push", "origin", "main"], { cwd: root });
      runSsh("git pull VPS", `cd ${appDir} && git pull --ff-only origin main`);
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
  runSsh("docker rebuild", `cd ${appDir}/deploy && docker compose build && docker compose up -d`);

  // 4. Health check
  runSsh(
    "health check",
    `for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS https://norfood.com.br/api/health && echo "" && docker compose -f ${appDir}/deploy/docker-compose.yml ps && exit 0; sleep 3; done; exit 1`,
  );

  console.log("\n=== Deploy concluído ===");
  console.log("Site: https://norfood.com.br");
  console.log("Entregador: https://norfood.com.br/entregador");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
