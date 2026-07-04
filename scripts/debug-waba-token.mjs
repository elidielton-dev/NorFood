#!/usr/bin/env node
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfg } = await db.from("waba_config").select("access_token").eq("workspace_id", "default").single();
const [iv, ct, tag] = cfg.access_token.split(":");
const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(process.env.ENCRYPTION_KEY, "hex"), Buffer.from(iv, "hex"));
d.setAuthTag(Buffer.from(tag, "hex"));
const token = d.update(ct, "hex", "utf8") + d.final("utf8");

const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
const dbg = await fetch(
  `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`,
);
const dbgJson = await dbg.json();
  console.log("=== Debug Token ===");
  const data = dbgJson.data ?? {};
  console.log(JSON.stringify(dbgJson, null, 2));
  const granular = data.granular_scopes ?? [];
  const hasWabaTarget = granular.some(
    (g) =>
      (g.scope === "whatsapp_business_messaging" || g.scope === "whatsapp_business_management") &&
      Array.isArray(g.target_ids) &&
      g.target_ids.length > 0,
  );
  if (!hasWabaTarget) {
    console.log(
      "\n>>> AVISO: token sem target_ids no WABA — gere token em WhatsApp → API Setup do app NorFood",
    );
  }

// Últimas mensagens agent e status
const { data: msgs } = await db
  .from("waba_messages")
  .select("content_text, status, wa_message_id, created_at, sender_type")
  .eq("sender_type", "agent")
  .order("created_at", { ascending: false })
  .limit(5);
console.log("\n=== Últimos envios agent ===");
for (const m of msgs ?? []) {
  console.log(`${m.status} | ${m.content_text} | ${m.wa_message_id?.slice(-20)} | ${m.created_at}`);
}
