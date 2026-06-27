#!/usr/bin/env node
/** Aplica migration rider multitenant + avatars no Supabase remoto */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = resolve(root, "supabase/migrations/20260627200000_rider_multitenant_mobile.sql");

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_POSTGRES_URL;

if (!connectionString) {
  console.error("Defina SUPABASE_DB_URL ou DATABASE_URL para aplicar a migration.");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log("Migration rider multitenant mobile aplicada com sucesso.");
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await client.end();
}
