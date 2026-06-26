/**
 * Preenche NCM/CFOP/CSOSN em produtos sem dados fiscais.
 * Uso: node ./scripts/backfill-produtos-fiscal.mjs
 */
import { adminClient } from "./supabase-real-tracking-tools.mjs";

const DEFAULT_CFOP = "5102";
const DEFAULT_CSOSN = "102";

function resolveNcm(nome) {
  const text = nome.toLowerCase();

  if (text.includes("h2oh") || text.includes("agua") || text.includes("refriger") || text.includes("suco")) {
    return "22021000";
  }
  if (text.includes("mel")) {
    return "04090000";
  }
  if (text.includes("chocolate") || text.includes("trufa")) {
    return "18069000";
  }
  if (text.includes("cafe") || text.includes("café")) {
    return "21011110";
  }

  return "19059090";
}

async function main() {
  const { data: produtos, error } = await adminClient
    .from("produtos")
    .select("id, nome, ncm, cfop, csosn")
    .order("nome");

  if (error) throw error;

  const pendentes = (produtos ?? []).filter((p) => !p.ncm?.trim());
  if (pendentes.length === 0) {
    console.log("Todos os produtos ja possuem NCM.");
    return;
  }

  console.log(`Atualizando ${pendentes.length} produto(s) sem NCM...`);

  for (const produto of pendentes) {
    const ncm = resolveNcm(produto.nome);
    const { error: updateError } = await adminClient
      .from("produtos")
      .update({
        ncm,
        cfop: produto.cfop?.trim() || DEFAULT_CFOP,
        csosn: produto.csosn?.trim() || DEFAULT_CSOSN,
      })
      .eq("id", produto.id);

    if (updateError) throw updateError;
    console.log(`  - ${produto.nome}: NCM ${ncm}, CFOP ${DEFAULT_CFOP}, CSOSN ${DEFAULT_CSOSN}`);
  }

  const { count: withNcm, error: countError } = await adminClient
    .from("produtos")
    .select("id", { count: "exact", head: true })
    .not("ncm", "is", null)
    .neq("ncm", "");

  if (countError) throw countError;

  console.log(`Concluido. Produtos com NCM: ${withNcm ?? 0}/${produtos?.length ?? 0}`);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
