/**
 * Repara horarios e config_operacional por tenant em bancos ja em producao.
 * Uso: node scripts/repair-tenant-horarios.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_TENANT_ID = "a0000000-0000-4000-8000-000000000001";

const DEFAULT_HORARIOS = [
  { dia_semana: 0, ativo: true, abre: "08:00", fecha: "14:00" },
  { dia_semana: 1, ativo: true, abre: "08:00", fecha: "20:00" },
  { dia_semana: 2, ativo: true, abre: "08:00", fecha: "20:00" },
  { dia_semana: 3, ativo: true, abre: "08:00", fecha: "20:00" },
  { dia_semana: 4, ativo: true, abre: "08:00", fecha: "20:00" },
  { dia_semana: 5, ativo: true, abre: "08:00", fecha: "20:00" },
  { dia_semana: 6, ativo: true, abre: "08:00", fecha: "18:00" },
];

function parseEnv(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const env = parseEnv(resolve(process.cwd(), ".env"));
const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureTenantHorarios(tenantId) {
  const { data: existing, error } = await admin
    .from("horarios_funcionamento")
    .select("dia_semana")
    .eq("tenant_id", tenantId);

  if (error) throw error;
  if ((existing ?? []).length >= 7) return { tenantId, horarios: "ok" };

  let source = DEFAULT_HORARIOS;
  const { data: templateRows } = await admin
    .from("horarios_funcionamento")
    .select("dia_semana, ativo, abre, fecha")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .order("dia_semana");

  if (templateRows?.length) {
    source = templateRows.map((row) => ({
      dia_semana: row.dia_semana,
      ativo: row.ativo,
      abre: String(row.abre).slice(0, 5),
      fecha: String(row.fecha).slice(0, 5),
    }));
  }

  const payload = source.map((h) => ({
    tenant_id: tenantId,
    dia_semana: h.dia_semana,
    ativo: h.ativo,
    abre: h.abre,
    fecha: h.fecha,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await admin
    .from("horarios_funcionamento")
    .upsert(payload, { onConflict: "tenant_id,dia_semana" });

  if (upsertError) throw upsertError;
  return { tenantId, horarios: "seeded" };
}

async function ensureTenantConfig(tenantId) {
  const { data: existing } = await admin
    .from("config_operacional")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existing) return { tenantId, config: "ok" };

  const { data: settings } = await admin
    .from("tenant_settings")
    .select("pedido_minimo, delivery_fee_default, loja_aberta, pontos_por_real")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { error } = await admin.from("config_operacional").upsert({
    id: tenantId,
    tenant_id: tenantId,
    pedido_minimo: Number(settings?.pedido_minimo ?? 0),
    valor_padrao_entrega: Number(settings?.delivery_fee_default ?? 5),
    loja_aberta: settings?.loja_aberta ?? true,
    pontos_por_real: Number(settings?.pontos_por_real ?? 1),
    horario_automatico: true,
    pausa_imediata: false,
    fuso_horario: "America/Recife",
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
  return { tenantId, config: "seeded" };
}

async function main() {
  const { data: tenants, error } = await admin.from("tenants").select("id, slug");
  if (error) throw error;

  const results = [];
  for (const tenant of tenants ?? []) {
    results.push(await ensureTenantConfig(tenant.id));
    results.push(await ensureTenantHorarios(tenant.id));
    console.log(`[repair] ${tenant.slug}: config + horarios verificados`);
  }

  console.log(JSON.stringify(results, null, 2));
  console.log("Repair concluido.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
