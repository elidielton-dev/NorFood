#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.PRODUCTION_URL ?? "https://norfood.com.br";
const EMAIL = process.env.ADMIN_EMAIL ?? "eltnxz@gmail.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "@Elton20!";

function loadEnv(path) {
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

const env = { ...loadEnv(resolve(root, ".env")), ...loadEnv(resolve(root, "deploy/.env")) };
const url = env.SUPABASE_URL;
const anon = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
const platformAdmins = (env.PLATFORM_ADMIN_EMAILS ?? env.VITE_PLATFORM_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

console.log("=== Debug platform admin login ===");
console.log("Email:", EMAIL);
console.log("Platform admins in env:", platformAdmins.join(", ") || "(empty)");
console.log("In list:", platformAdmins.includes(EMAIL.toLowerCase()));

const sb = createClient(url, anon, { auth: { persistSession: false } });
const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
console.log("Supabase login:", error?.message ?? "OK");
if (!data.session) process.exit(1);

const token = data.session.access_token;

// Check if VITE email is baked in JS bundles
const home = await fetch(`${BASE}/`);
const html = await home.text();
const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
console.log("\nScript bundles:", scripts.length);
for (const script of scripts.slice(0, 5)) {
  const js = await fetch(`${BASE}${script}`).then((r) => r.text());
  const hasEmail = js.includes("eltnxz@gmail.com");
  console.log(`${script}: hasEmail=${hasEmail}`);
}

// Test session API
const sessionRes = await fetch(`${BASE}/api/platform-admin/session`, {
  headers: { Authorization: `Bearer ${token}` },
});
const sessionBody = await sessionRes.text();
console.log("\nSession API:", sessionRes.status, sessionBody);
