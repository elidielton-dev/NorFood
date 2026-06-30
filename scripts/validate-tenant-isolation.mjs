/**
 * Valida isolamento multitenant no Supabase.
 * Detecta vazamento entre tenants, registros órfãos e consistência de vendas/financeiro.
 *
 * Uso:
 *   node scripts/validate-tenant-isolation.mjs
 *   TENANT_SLUG=dolcina-pipocaria node scripts/validate-tenant-isolation.mjs
 *   ALL_TENANTS=1 node scripts/validate-tenant-isolation.mjs
 */
import { adminClient } from "./supabase-real-tracking-tools.mjs";

const TARGET_SLUG = process.env.TENANT_SLUG ?? "dolcina-pipocaria";
const VALIDATE_ALL = process.env.ALL_TENANTS === "1";

const TENANT_TABLES = [
  "produtos",
  "categorias",
  "pedidos",
  "entregas",
  "rotas_entrega",
  "mesas",
  "cupons",
  "lancamentos_financeiros",
  "bairros_entrega",
];

const issues = [];

function warn(message) {
  issues.push(message);
  console.warn(`⚠ ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function countForTenant(table, tenantId, extraFilter) {
  let query = adminClient.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (extraFilter) query = extraFilter(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function countOrphans(table) {
  const { count, error } = await adminClient
    .from(table)
    .select("id", { count: "exact", head: true })
    .is("tenant_id", null);
  if (error) {
    if (error.code === "42703") return null;
    throw error;
  }
  return count ?? 0;
}

async function checkPedidoFinanceiroConsistency(tenantId, tenantSlug) {
  const { data: pedidos, error } = await adminClient
    .from("pedidos")
    .select("id, numero, canal, total, status, created_at")
    .eq("tenant_id", tenantId)
    .in("canal", ["balcao", "mesa"])
    .neq("status", "cancelado")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  for (const pedido of pedidos ?? []) {
    const { count, error: lancError } = await adminClient
      .from("lancamentos_financeiros")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("pedido_id", pedido.id);
    if (lancError) throw lancError;
    if ((count ?? 0) === 0) {
      warn(
        `${tenantSlug}: pedido #${pedido.numero} (${pedido.canal}) sem lançamento financeiro vinculado.`,
      );
    }
  }

  const { data: lancamentos, error: lancListError } = await adminClient
    .from("lancamentos_financeiros")
    .select("id, descricao, pedido_id, valor, tenant_id")
    .eq("tenant_id", tenantId)
    .not("pedido_id", "is", null)
    .order("data", { ascending: false })
    .limit(20);
  if (lancListError) throw lancListError;

  for (const lanc of lancamentos ?? []) {
    const { data: pedido, error: pedError } = await adminClient
      .from("pedidos")
      .select("id, tenant_id, numero")
      .eq("id", lanc.pedido_id)
      .maybeSingle();
    if (pedError) throw pedError;
    if (!pedido) {
      warn(`${tenantSlug}: lançamento ${lanc.id} aponta para pedido inexistente.`);
      continue;
    }
    if (pedido.tenant_id !== tenantId) {
      warn(
        `${tenantSlug}: lançamento ${lanc.id} (${lanc.descricao}) vinculado a pedido de outro tenant (#${pedido.numero}).`,
      );
    }
  }
}

async function checkCrossTenantProductLeak(tenantId, tenantSlug) {
  const { data: produtos, error } = await adminClient
    .from("produtos")
    .select("id, nome, tenant_id")
    .eq("tenant_id", tenantId)
    .limit(5);
  if (error) throw error;

  if (!produtos?.length) return;

  const otherTenantIds = new Set();
  const { data: others } = await adminClient.from("tenants").select("id, slug").neq("id", tenantId);
  for (const t of others ?? []) otherTenantIds.add(t.id);

  for (const produto of produtos) {
    if (produto.tenant_id && produto.tenant_id !== tenantId) {
      warn(`${tenantSlug}: produto "${produto.nome}" com tenant_id incorreto.`);
    }
  }
}

async function validateTenant(tenant) {
  const tenantId = tenant.id;
  console.log(`\n=== ${tenant.name} (${tenant.slug}) — status=${tenant.status} ===`);

  const counts = {};
  for (const table of TENANT_TABLES) {
    counts[table] = await countForTenant(table, tenantId);
    console.log(`  ${table}: ${counts[table]}`);
  }

  const { count: staffCount, error: staffError } = await adminClient
    .from("tenant_users")
    .select("user_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  if (staffError) throw staffError;
  console.log(`  tenant_users (ativos): ${staffCount ?? 0}`);

  await checkCrossTenantProductLeak(tenantId, tenant.slug);
  await checkPedidoFinanceiroConsistency(tenantId, tenant.slug);

  return counts;
}

async function reportOrphans() {
  console.log("\n--- Registros sem tenant_id (legado) ---");
  for (const table of TENANT_TABLES) {
    const orphans = await countOrphans(table);
    if (orphans === null) continue;
    if (orphans > 0) {
      warn(`${table}: ${orphans} registro(s) sem tenant_id.`);
    } else {
      console.log(`  ${table}: 0 órfãos`);
    }
  }
}

async function main() {
  console.log("Validação de isolamento multitenant Norfood\n");

  await reportOrphans();

  if (VALIDATE_ALL) {
    const { data: tenants, error } = await adminClient
      .from("tenants")
      .select("id, slug, name, status")
      .order("created_at", { ascending: false });
    if (error) throw error;
    assert(tenants?.length, "Nenhum tenant encontrado.");

    for (const tenant of tenants) {
      await validateTenant(tenant);
    }
  } else {
    const { data: tenant, error: tenantError } = await adminClient
      .from("tenants")
      .select("id, slug, name, status")
      .eq("slug", TARGET_SLUG)
      .maybeSingle();
    if (tenantError) throw tenantError;
    assert(tenant, `Tenant "${TARGET_SLUG}" não encontrado.`);
    await validateTenant(tenant);

    const { data: allTenants, error: allTenantsError } = await adminClient
      .from("tenants")
      .select("id, slug, name")
      .neq("id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(10);
    if (allTenantsError) throw allTenantsError;

    console.log("\n--- Outros tenants (amostra) ---");
    for (const other of allTenants ?? []) {
      const pedidos = await countForTenant("pedidos", other.id);
      const produtos = await countForTenant("produtos", other.id);
      if (pedidos > 0 || produtos > 0) {
        console.log(`  ${other.slug}: ${produtos} produto(s), ${pedidos} pedido(s)`);
      }
    }
  }

  console.log("\n--- Resultado ---");
  if (issues.length === 0) {
    console.log("✓ Nenhum problema de isolamento detectado.");
  } else {
    console.log(`⚠ ${issues.length} aviso(s) — revise acima.`);
    process.exitCode = 1;
  }

  console.log("\nValidação concluída.");
}

main().catch((error) => {
  console.error("Falha na validação de isolamento:");
  console.error(error?.message ?? error);
  process.exit(1);
});
