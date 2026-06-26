#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  try {
    const raw = readFileSync(join(rootDir, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadDotEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = (process.env.EVOLUTION_INSTANCE_NAME ?? "abelha-mel").trim();

async function supabaseQuery(path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function evolution(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

const chats = await supabaseQuery(
  "whatsapp_chats?or=(name.ilike.*nataly*,remote_jid.ilike.*204728323547223*)&select=id,name,phone,remote_jid,profile_pic_url,last_message,last_message_at,inbox_status&order=last_message_at.desc",
);

console.log("=== SUPABASE CHATS (nataly / @lid) ===");
for (const c of chats) {
  console.log(JSON.stringify(c, null, 2));
  const msgs = await supabaseQuery(
    `whatsapp_messages?chat_id=eq.${c.id}&select=id,body,direction,sent_at,remote_jid&order=sent_at.desc&limit=3`,
  );
  console.log("  recent msgs:", msgs.map((m) => ({ body: m.body?.slice(0, 40), dir: m.direction, at: m.sent_at, jid: m.remote_jid })));
}

const noPhone = await supabaseQuery(
  "whatsapp_chats?last_message_at=not.is.null&or=(phone.is.null,phone.eq.)&select=id,name,phone,remote_jid,last_message,last_message_at&order=last_message_at.desc&limit=15",
);
console.log("\n=== CHATS SEM TELEFONE (recentes) ===");
for (const c of noPhone) {
  console.log(`- ${c.name ?? "?"} | jid=${c.remote_jid} | preview=${c.last_message?.slice(0, 30)}`);
}

if (baseUrl && apiKey) {
  const lidJid = "204728323547223@lid";
  console.log("\n=== EVOLUTION CONTACT ===");
  for (const path of [
    `/chat/findContacts/${instance}`,
    `/api/v1/chat/findContacts/${instance}`,
  ]) {
    try {
      const r = await evolution(path, { where: { remoteJid: lidJid } });
      const rows = Array.isArray(r.data) ? r.data : r.data?.contacts ?? r.data?.data ?? [];
      const match = rows.find((x) => String(x?.remoteJid ?? "") === lidJid) ?? rows[0];
      if (match) {
        console.log("contact:", JSON.stringify({
          remoteJid: match.remoteJid,
          pushName: match.pushName,
          profilePicUrl: match.profilePicUrl?.slice?.(0, 80),
        }));
        break;
      }
    } catch (e) {
      console.log("findContacts err", e.message);
    }
  }

  console.log("\n=== EVOLUTION PROFILE PIC (phone 5587981582587) ===");
  for (const number of ["5587981582587", "87981582587", "204728323547223"]) {
    const r = await evolution(`/chat/fetchProfilePictureUrl/${instance}`, { number });
    console.log(`number=${number}:`, r.status, typeof r.data === "object" ? JSON.stringify(r.data).slice(0, 200) : r.data);
  }

  console.log("\n=== EVOLUTION PROFILE PIC (remoteJid) ===");
  const r2 = await evolution(`/chat/fetchProfilePictureUrl/${instance}`, {
    number: "204728323547223@lid",
  });
  console.log("jid as number:", r2.status, JSON.stringify(r2.data).slice(0, 200));
}
