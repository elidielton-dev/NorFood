import { randomUUID } from "node:crypto";
import { adminClient } from "./supabase-real-tracking-tools.mjs";

const MARKER = "VALIDATE_PRODUTOS_MODULE";
const TEST_SKU = `VAL-${Date.now()}`;

const REQUIRED_TABLES = [
  "produto_variacoes",
  "produto_ficha_tecnica",
  "grupos_adicionais",
  "produto_adicionais",
  "produto_promocoes",
  "produto_movimentos_estoque",
];

const REQUIRED_PRODUCT_COLUMNS = [
  "sku",
  "subcategoria",
  "preco_promocional",
  "custo_producao",
  "estoque_minimo",
  "unidade",
  "descricao_curta",
  "ingredientes",
  "alergenos",
  "status_produto",
  "disponivel_canais",
  "auto_pause_sem_estoque",
  "vendas_count",
  "receita_total",
];

const OPTIONAL_PRODUCT_COLUMNS = [
  "codigo_barras",
  "frete_gratis",
  "primeiro_pedido",
  "pesavel",
  "quero_desconto",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkSchema() {
  console.log("1/5 Verificando schema da migration...");

  for (const table of REQUIRED_TABLES) {
    const { error } = await adminClient.from(table).select("id").limit(1);
    assert(!error, `Tabela ausente ou inacessivel: ${table} (${error?.message ?? "ok"})`);
    console.log(`  - tabela ${table}: ok`);
  }

  const { data: sampleProduct, error: productError } = await adminClient
    .from("produtos")
    .select(REQUIRED_PRODUCT_COLUMNS.join(","))
    .limit(1)
    .maybeSingle();
  assert(!productError, `Colunas estendidas em produtos ausentes: ${productError?.message}`);
  console.log("  - colunas estendidas em produtos: ok");

  const { error: extrasError } = await adminClient
    .from("produtos")
    .select(OPTIONAL_PRODUCT_COLUMNS.join(","))
    .limit(1)
    .maybeSingle();
  if (extrasError) {
    console.log(
      `  - colunas extras do modal (codigo_barras, frete_gratis...): pendente (${extrasError.message})`,
    );
  } else {
    console.log("  - colunas extras do modal: ok");
  }

  const { data: sampleCategory, error: categoryError } = await adminClient
    .from("categorias")
    .select("descricao,status_categoria")
    .limit(1)
    .maybeSingle();
  assert(!categoryError, `Colunas estendidas em categorias ausentes: ${categoryError?.message}`);
  console.log("  - colunas estendidas em categorias: ok");

  return { sampleProduct, sampleCategory };
}

async function cleanup(marker = MARKER) {
  const { data: products, error } = await adminClient
    .from("produtos")
    .select("id")
    .or(`nome.ilike.%${marker}%,sku.eq.${TEST_SKU}`);
  if (error) throw error;

  const productIds = (products ?? []).map((row) => row.id);
  if (!productIds.length) return;

  await adminClient.from("produto_movimentos_estoque").delete().in("produto_id", productIds);
  await adminClient.from("produto_promocoes").delete().in("produto_id", productIds);
  await adminClient.from("produto_ficha_tecnica").delete().in("produto_id", productIds);
  await adminClient.from("produto_variacoes").delete().in("produto_id", productIds);
  await adminClient.from("produtos").delete().in("id", productIds);

  const { data: grupos } = await adminClient
    .from("grupos_adicionais")
    .select("id")
    .ilike("nome", `%${marker}%`);
  const grupoIds = (grupos ?? []).map((row) => row.id);
  if (grupoIds.length) {
    await adminClient.from("produto_adicionais").delete().in("grupo_id", grupoIds);
    await adminClient.from("grupos_adicionais").delete().in("id", grupoIds);
  }
}

async function runRoundtrip() {
  console.log("2/5 Limpando dados de teste anteriores...");
  await cleanup();

  console.log("3/5 Criando produto de validacao com dados estendidos...");
  const productId = randomUUID();
  const grupoId = randomUUID();

  const { data: categoria, error: categoriaError } = await adminClient
    .from("categorias")
    .select("id,nome")
    .eq("ativo", true)
    .order("ordem")
    .limit(1)
    .maybeSingle();
  if (categoriaError) throw categoriaError;
  assert(categoria?.id, "Nenhuma categoria ativa encontrada para o teste.");

  const { error: grupoError } = await adminClient.from("grupos_adicionais").insert({
    id: grupoId,
    nome: `${MARKER} Grupo`,
    descricao: "Grupo criado pelo script de validacao",
  });
  if (grupoError) throw grupoError;

  const baseProductPayload = {
    id: productId,
    nome: `${MARKER} Brownie Teste`,
    sku: TEST_SKU,
    categoria_id: categoria.id,
    subcategoria: "Linha validacao",
    preco: 22.9,
    preco_promocional: 19.9,
    custo_producao: 9.5,
    estoque: 12,
    estoque_minimo: 3,
    unidade: "unidade",
    descricao: "Produto criado automaticamente para validar o modulo.",
    descricao_curta: "Brownie de validacao",
    ingredientes: "Chocolate, farinha, ovos",
    alergenos: ["leite", "ovos"],
    peso_aproximado: "120g",
    serve_pessoas: "1 pessoa",
    validade: "2 dias refrigerado",
    tempo_preparo_min: 15,
    destaque: false,
    ativo: true,
    recomendado: true,
    novo: true,
    mais_vendido: false,
    status_produto: "ativo",
    disponivel_canais: ["balcao", "delivery", "mesas"],
    auto_pause_sem_estoque: true,
    vendas_count: 4,
    receita_total: 91.6,
    imagem_url: null,
  };

  const { error: productError } = await adminClient.from("produtos").insert({
    ...baseProductPayload,
    codigo_barras: "7891234567890",
    frete_gratis: true,
    primeiro_pedido: false,
    pesavel: false,
    quero_desconto: true,
  });
  if (productError && /codigo_barras|frete_gratis|primeiro_pedido|pesavel|quero_desconto/.test(productError.message)) {
    const { error: legacyProductError } = await adminClient
      .from("produtos")
      .insert(baseProductPayload);
    if (legacyProductError) throw legacyProductError;
  } else if (productError) {
    throw productError;
  }

  const variacaoId = randomUUID();
  const fichaId = randomUUID();
  const adicionalId = randomUUID();
  const promocaoId = randomUUID();
  const movimentoId = randomUUID();

  const { error: variacaoError } = await adminClient.from("produto_variacoes").insert({
    id: variacaoId,
    produto_id: productId,
    nome: "Individual",
    preco: 22.9,
    estoque: 12,
    tempo_preparo: 15,
    status: "ativo",
  });
  if (variacaoError) throw variacaoError;

  const { error: fichaError } = await adminClient.from("produto_ficha_tecnica").insert({
    id: fichaId,
    produto_id: productId,
    ingrediente: "Chocolate 70%",
    quantidade: 0.08,
    unidade: "kg",
    custo_unitario: 28,
    fornecedor: "Fornecedor teste",
  });
  if (fichaError) throw fichaError;

  const { error: adicionalError } = await adminClient.from("produto_adicionais").insert({
    id: adicionalId,
    grupo_id: grupoId,
    nome: "Calda extra",
    preco: 2.5,
    estoque: 20,
    obrigatorio: false,
    minimo: 0,
    maximo: 2,
  });
  if (adicionalError) throw adicionalError;

  const { error: promocaoError } = await adminClient.from("produto_promocoes").insert({
    id: promocaoId,
    produto_id: productId,
    tipo: "percentual",
    valor: 10,
    titulo: `${MARKER} Promo`,
    inicio: new Date().toISOString().slice(0, 10),
    fim: null,
    ativa: true,
  });
  if (promocaoError) throw promocaoError;

  const { error: movimentoError } = await adminClient.from("produto_movimentos_estoque").insert({
    id: movimentoId,
    produto_id: productId,
    acao: "entrada",
    quantidade: 5,
    canal: "balcao",
    observacao: `${MARKER} movimento`,
  });
  if (movimentoError) throw movimentoError;

  console.log("4/5 Lendo dados gravados e conferindo roundtrip...");
  const { data: loaded, error: loadError } = await adminClient
    .from("produtos")
    .select(
      "id,nome,sku,subcategoria,preco,preco_promocional,custo_producao,estoque,estoque_minimo,status_produto,disponivel_canais,vendas_count,receita_total,categorias(nome),produto_variacoes(id,nome),produto_ficha_tecnica(id,ingrediente),produto_promocoes(id,titulo),produto_movimentos_estoque(id,acao)",
    )
    .eq("id", productId)
    .single();
  if (loadError) throw loadError;

  assert(loaded.sku === TEST_SKU, "SKU nao persistiu corretamente.");
  assert(Number(loaded.preco) === 22.9, "Preco nao persistiu corretamente.");
  assert(Number(loaded.custo_producao) === 9.5, "Custo de producao nao persistiu.");
  assert(loaded.status_produto === "ativo", "Status do produto nao persistiu.");
  assert(Array.isArray(loaded.disponivel_canais), "Canais disponiveis nao vieram como array.");
  assert(loaded.produto_variacoes?.length === 1, "Variacao nao foi relacionada ao produto.");
  assert(loaded.produto_ficha_tecnica?.length === 1, "Ficha tecnica nao foi relacionada ao produto.");
  assert(loaded.produto_promocoes?.length === 1, "Promocao nao foi relacionada ao produto.");
  assert(loaded.produto_movimentos_estoque?.length === 1, "Movimento de estoque nao foi relacionado.");

  const { data: grupoLoaded, error: grupoLoadError } = await adminClient
    .from("grupos_adicionais")
    .select("id,produto_adicionais(id,nome)")
    .eq("id", grupoId)
    .single();
  if (grupoLoadError) throw grupoLoadError;
  assert(grupoLoaded.produto_adicionais?.length === 1, "Adicional nao foi relacionado ao grupo.");

  console.log("5/5 Atualizando estoque e removendo dados de teste...");
  const { error: stockUpdateError } = await adminClient
    .from("produtos")
    .update({ estoque: 7, status_produto: "pausado" })
    .eq("id", productId);
  if (stockUpdateError) throw stockUpdateError;

  const { data: updated, error: updatedError } = await adminClient
    .from("produtos")
    .select("estoque,status_produto")
    .eq("id", productId)
    .single();
  if (updatedError) throw updatedError;
  assert(updated.estoque === 7, "Atualizacao de estoque falhou.");
  assert(updated.status_produto === "pausado", "Atualizacao de status falhou.");

  await cleanup();
  console.log("Validacao do modulo de produtos concluida com sucesso.");
}

async function checkCatalogBaseline() {
  const { count: produtoCount, error: produtoCountError } = await adminClient
    .from("produtos")
    .select("id", { count: "exact", head: true });
  if (produtoCountError) throw produtoCountError;

  const { count: skuCount, error: skuCountError } = await adminClient
    .from("produtos")
    .select("id", { count: "exact", head: true })
    .not("sku", "is", null);
  if (skuCountError) throw skuCountError;

  console.log(`Catalogo atual: ${produtoCount ?? 0} produto(s), ${skuCount ?? 0} com SKU.`);
  if ((produtoCount ?? 0) > 0 && (skuCount ?? 0) === 0) {
    console.log(
      "Aviso: existem produtos sem SKU. O painel deve enriquecer e salvar na primeira carga.",
    );
  }
}

async function main() {
  await checkSchema();
  await checkCatalogBaseline();
  await runRoundtrip();
}

main().catch((error) => {
  console.error("Falha na validacao do modulo de produtos:");
  console.error(error?.message ?? error);
  process.exit(1);
});
