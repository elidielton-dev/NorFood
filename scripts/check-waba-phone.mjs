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
  if (!process.env[k]) process.env[k] = v;
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfg } = await db.from("waba_config").select("*").eq("workspace_id", "default").single();
const [iv, ct, tag] = cfg.access_token.split(":");
const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(process.env.ENCRYPTION_KEY, "hex"), Buffer.from(iv, "hex"));
d.setAuthTag(Buffer.from(tag, "hex"));
const token = d.update(ct, "hex", "utf8") + d.final("utf8");

const r = await fetch(
  `https://graph.facebook.com/v21.0/${cfg.phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,status,code_verification_status`,
  { headers: { Authorization: `Bearer ${token}` } },
);
console.log(JSON.stringify(await r.json(), null, 2));
