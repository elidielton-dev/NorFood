import { adminClient } from "./supabase-real-tracking-tools.mjs";

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? "https://abelhaemel.vercel.app";

const ROUTES = [
  "/",
  "/auth",
  "/painel/produtos",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkProductionRoutes() {
  console.log(`1/2 Verificando rotas em ${PRODUCTION_URL}...`);
  for (const route of ROUTES) {
    const url = `${PRODUCTION_URL}${route}`;
    const response = await fetch(url, { redirect: "follow" });
    assert(
      response.status >= 200 && response.status < 400,
      `${route} respondeu ${response.status}`,
    );
    const html = await response.text();
    assert(html.length > 200, `${route} retornou HTML vazio.`);
    console.log(`  - ${route}: HTTP ${response.status}`);
  }
}

async function checkSupabaseModule() {
  console.log("2/2 Verificando modulo de produtos no Supabase (producao)...");
  const tables = [
    "produto_variacoes",
    "produto_ficha_tecnica",
    "grupos_adicionais",
    "produto_adicionais",
    "produto_promocoes",
    "produto_movimentos_estoque",
  ];

  for (const table of tables) {
    const { error } = await adminClient.from(table).select("id").limit(1);
    assert(!error, `Tabela ${table} indisponivel: ${error?.message}`);
    console.log(`  - tabela ${table}: ok`);
  }

  const { count: produtoCount, error: produtoCountError } = await adminClient
    .from("produtos")
    .select("id", { count: "exact", head: true });
  if (produtoCountError) throw produtoCountError;

  const { count: skuCount, error: skuCountError } = await adminClient
    .from("produtos")
    .select("id", { count: "exact", head: true })
    .not("sku", "is", null);
  if (skuCountError) throw skuCountError;

  console.log(`  - catalogo: ${produtoCount ?? 0} produto(s), ${skuCount ?? 0} com SKU`);
  assert((produtoCount ?? 0) > 0, "Catalogo de producao vazio.");
}

async function main() {
  await checkProductionRoutes();
  await checkSupabaseModule();
  console.log("Validacao de producao concluida com sucesso.");
}

main().catch((error) => {
  console.error("Falha na validacao de producao:");
  console.error(error?.message ?? error);
  process.exit(1);
});
