/**
 * Remove fundo branco da logo NorFood → PNG transparente.
 * Uso: node scripts/remove-logo-background.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("python", [path.join(root, "scripts", "remove-logo-background.py")], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
