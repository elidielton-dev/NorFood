#!/usr/bin/env node
/**
 * Seed tenants iniciais da plataforma Norfood.
 * Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";

const TENANTS = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    name: "Norfood",
    slug: "norfood",
    subtitle: "Sistema de Delivery",
    primary_color: "#FF7A00",
    secondary_color: "#111111",
    accent_color: "#FF5A00",
    status: "active",
    timezone: "America/Sao_Paulo",
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    name: "Restaurante Demo",
    slug: "demo-restaurante",
    subtitle: "Cliente exemplo",
    primary_color: "#FF7A00",
    secondary_color: "#111111",
    accent_color: "#FF5A00",
    status: "active",
    timezone: "America/Sao_Paulo",
  },
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  for (const tenant of TENANTS) {
    const { error } = await supabase.from("tenants").upsert(tenant, { onConflict: "id" });
    if (error) console.warn(`[tenants] ${tenant.slug}:`, error.message);
    else console.log(`✓ ${tenant.name} (${tenant.slug})`);

    await supabase
      .from("tenant_settings")
      .upsert({ tenant_id: tenant.id }, { onConflict: "tenant_id" });
  }
  console.log("\nConcluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
