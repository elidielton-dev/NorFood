#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(rootDir, ".env"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[trimmed.slice(0, eq).trim()] = value;
}

const lidJid = process.argv[2] ?? "257096775905472@lid";
const base = env.EVOLUTION_API_URL.replace(/\/$/, "");
const key = env.EVOLUTION_API_KEY;
const instance = env.EVOLUTION_INSTANCE_NAME;

function request(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
          } catch {
            resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const msgs = await request(`/chat/findMessages/${instance}`, {
  where: { key: { remoteJid: lidJid } },
  limit: 5,
});
console.log("=== findMessages @lid ===");
console.log(JSON.stringify(msgs.body?.messages?.records?.[0]?.key ?? msgs.body, null, 2));

const contacts = await request(`/chat/findContacts/${instance}`, {
  where: { remoteJid: lidJid },
});
console.log("\n=== findContacts @lid ===");
console.log(JSON.stringify(contacts.body, null, 2));

const chats = await request(`/chat/findChats/${instance}`, { limit: 200 });
const list = Array.isArray(chats.body) ? chats.body : chats.body?.chats ?? chats.body?.records ?? [];
const match = list.filter((c) => String(c?.remoteJid ?? c?.id ?? "").includes("257096775905472"));
console.log("\n=== findChats match ===");
console.log(JSON.stringify(match, null, 2));
