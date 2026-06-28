import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[trimmed.slice(0, eq).trim()] = value;
    }
  } catch {
    /* optional */
  }
  return env;
}

/** Carrega `.env` e `deploy/.env` (deploy sobrescreve). */
export function loadDeployEnv() {
  return {
    ...parseEnvFile(resolve(root, ".env")),
    ...parseEnvFile(resolve(root, "deploy/.env")),
  };
}

/** Injeta em process.env (sem sobrescrever variáveis já definidas). */
export function injectDeployEnv() {
  const env = loadDeployEnv();
  for (const [key, value] of Object.entries(env)) {
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
  return env;
}

export { root as projectRoot };
