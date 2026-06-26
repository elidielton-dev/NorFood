import { spawn } from "node:child_process";
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

const child = spawn("npx", ["expo", "start", "--port", String(port), ...extraArgs], {
  stdio: "inherit",
  shell: true,
  cwd: mobileRoot,
});

child.on("exit", (code) => process.exit(code ?? 0));
