import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

async function isMetroRunning(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`);
    const body = await response.text();
    return body.includes("packager-status:running");
  } catch {
    return false;
  }
}

async function pickPort() {
  if (await isMetroRunning(8081)) {
    console.log("Metro ja esta rodando em http://localhost:8081");
    console.log("Escaneie o QR Code desse terminal ou rode: npm run mobile:open");
    return null;
  }

  for (const port of [8081, 8082, 8083, 8084]) {
    if (await isPortFree(port)) return port;
  }

  return undefined;
}

function resolveExpoLaunch(port, extraArgs) {
  const baseArgs = ["start", "--port", String(port), ...extraArgs];
  const cliJs = path.join(mobileRoot, "node_modules", "expo", "bin", "cli.js");
  const winBin = path.join(mobileRoot, "node_modules", ".bin", "expo.cmd");
  const unixBin = path.join(mobileRoot, "node_modules", ".bin", "expo");

  if (existsSync(cliJs)) {
    return { command: process.execPath, args: [cliJs, ...baseArgs], shell: false };
  }
  if (process.platform === "win32" && existsSync(winBin)) {
    return { command: winBin, args: baseArgs, shell: true };
  }
  if (existsSync(unixBin)) {
    return { command: unixBin, args: baseArgs, shell: false };
  }

  console.error("Expo nao encontrado em mobile/node_modules.");
  console.error("Rode na raiz do projeto: npm run mobile:setup");
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const port = await pickPort();

if (port === null) {
  process.exit(0);
}

if (port === undefined) {
  console.error("Nenhuma porta livre (8081-8084). Feche outros processos Metro/Expo e tente de novo.");
  process.exit(1);
}

if (port !== 8081) {
  console.log(`Porta 8081 ocupada. Iniciando Metro na porta ${port}.`);
}

if (extraArgs.includes("--tunnel")) {
  console.log("Modo tunnel: funciona mesmo com celular em outra rede (evita timeout).");
}

const launch = resolveExpoLaunch(port, extraArgs);
const child = spawn(launch.command, launch.args, {
  stdio: "inherit",
  shell: launch.shell,
  cwd: mobileRoot,
});

child.on("exit", (code) => process.exit(code ?? 0));
