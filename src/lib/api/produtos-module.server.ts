import type {
  AddonGroup,
  ModuleStore,
  ProductAddon,
  ProductCategory,
  ProductPromotion,
  ProductRecord,
  ProductStatus,
  ProductVariation,
  SellChannel,
  SimulatedSale,
  StockMovement,
  TechnicalItem,
} from "@/lib/produtos-module";
import {
  createSku,
  defaultAddonGroups,
  defaultAddons,
  defaultCategories,
  isUuid,
  sanitizeProductForPersistence,
} from "@/lib/produtos-module";

type DbCategoria = {
  id: string;
  nome: string;
  emoji: string | null;
  ordem: number;
  ativo: boolean;
  descricao?: string | null;
  status_categoria?: string | null;
};

type DbProduto = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  imagem_url: string | null;
  tempo_preparo_min: number;
  destaque: boolean;
  ativo: boolean;
  estoque: number | null;
  categoria_id: string | null;
  sku?: string | null;
  subcategoria?: string | null;
  preco_promocional?: number | null;
  custo_producao?: number | null;
  estoque_minimo?: number | null;
  unidade?: string | null;
  descricao_curta?: string | null;
  ingredientes?: string | null;
  alergenos?: string[] | null;
  peso_aproximado?: string | null;
  serve_pessoas?: string | null;
  validade?: string | null;
  recomendado?: boolean | null;
  novo?: boolean | null;
  mais_vendido?: boolean | null;
  status_produto?: string | null;
  disponivel_canais?: SellChannel[] | null;
  auto_pause_sem_estoque?: boolean | null;
  vendas_count?: number | null;
  receita_total?: number | null;
  codigo_barras?: string | null;
  frete_gratis?: boolean | null;
  primeiro_pedido?: boolean | null;
  pesavel?: boolean | null;
  quero_desconto?: boolean | null;
  ncm?: string | null;
  cfop?: string | null;
  csosn?: string | null;
  origem?: number | null;
  gtin?: string | null;
  categorias?: { nome: string } | null;
};

type DbVariacao = {
  id: string;
  produto_id: string;
  nome: string;
  preco: number;
  estoque: number;
  tempo_preparo: number;
  status: string;
};

type DbFicha = {
  id: string;
  produto_id: string;
  ingrediente: string;
  quantidade: number;
  unidade: string;
  custo_unitario: number;
  fornecedor: string | null;
};

type DbGrupo = { id: string; nome: string; descricao: string | null };
type DbAdicional = {
  id: string;
  grupo_id: string;
  nome: string;
  preco: number;
  estoque: number;
  obrigatorio: boolean;
  minimo: number;
  maximo: number;
};
type DbPromocao = {
  id: string;
  produto_id: string;
  tipo: string;
  valor: number;
  titulo: string;
  inicio: string | null;
  fim: string | null;
  ativa: boolean;
};
type DbMovimento = {
  id: string;
  produto_id: string;
  acao: string;
  quantidade: number;
  canal: string | null;
  observacao: string | null;
  created_at: string;
};

export type ProdutosModuleFetchResult = ModuleStore & {
  needsMigration: boolean;
  extrasSchemaReady: boolean;
};

function isMissingExtrasColumnError(message: string) {
  return /codigo_barras|frete_gratis|primeiro_pedido|pesavel|quero_desconto/.test(message);
}

function isMissingFiscalColumnError(message: string) {
  return /\b(ncm|cfop|csosn|origem|gtin)\b/.test(message);
}

function isMissingModuleColumnError(message: string) {
  return /sku|subcategoria|preco_promocional|custo_producao|estoque_minimo|unidade|descricao_curta|ingredientes|alergenos|peso_aproximado|serve_pessoas|validade|recomendado|novo|mais_vendido|status_produto|disponivel_canais|auto_pause_sem_estoque|vendas_count|receita_total/.test(
    message,
  );
}

function stripRowKeys(row: Record<string, unknown>, keys: string[]) {
  const next = { ...row };
  for (const key of keys) delete next[key];
  return next;
}

export async function checkProdutosExtrasSchema(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("produtos").select("codigo_barras").limit(1);
  return !error;
}

async function upsertProdutoRow(
  supabaseAdmin: Awaited<
    ReturnType<typeof import("@/integrations/supabase/client.server")>
  >["supabaseAdmin"],
  row: Record<string, unknown>,
) {
  let current = { ...row };
  let lastError: { message: string } | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabaseAdmin.from("produtos").upsert(current, { onConflict: "id" });
    if (!error) return;

    lastError = error;

    if (isMissingExtrasColumnError(error.message)) {
      current = stripRowKeys(current, [
        "codigo_barras",
        "frete_gratis",
        "primeiro_pedido",
        "pesavel",
        "quero_desconto",
      ]);
      continue;
    }

    if (isMissingFiscalColumnError(error.message)) {
      current = stripRowKeys(current, ["ncm", "cfop", "csosn", "origem", "gtin"]);
      continue;
    }

    if (isMissingModuleColumnError(error.message)) {
      current = stripRowKeys(current, [
        "sku",
        "subcategoria",
        "preco_promocional",
        "custo_producao",
        "estoque_minimo",
        "unidade",
        "descricao_curta",
        "ingredientes",
        "alergenos",
        "peso_aproximado",
        "serve_pessoas",
        "validade",
        "recomendado",
        "novo",
        "mais_vendido",
        "status_produto",
        "disponivel_canais",
        "auto_pause_sem_estoque",
        "vendas_count",
        "receita_total",
      ]);
      continue;
    }

    throw new Error(`Erro ao salvar produto: ${error.message}`);
  }

  throw new Error(
    lastError?.message
      ? `Erro ao salvar produto: ${lastError.message}`
      : "Nao foi possivel salvar produto: schema do banco incompleto.",
  );
}

function buildProdutoRow(
  produto: ProductRecord,
  tenantId: string,
  productId: string,
  categoriaId: string | null,
) {
  return {
    id: productId,
    tenant_id: tenantId,
    nome: produto.nome,
    descricao: produto.descricaoCompleta || produto.descricaoCurta || null,
    preco: produto.precoVenda,
    imagem_url: produto.foto || null,
    tempo_preparo_min: produto.tempoPreparo,
    destaque: produto.destaque,
    ativo: produto.status === "ativo",
    estoque: produto.estoque,
    categoria_id: categoriaId,
    sku: produto.sku,
    subcategoria: produto.subcategoria,
    preco_promocional: produto.precoPromocional,
    custo_producao: produto.custoProducao,
    estoque_minimo: produto.estoqueMinimo,
    unidade: produto.unidade,
    descricao_curta: produto.descricaoCurta,
    ingredientes: produto.ingredientes,
    alergenos: produto.alergenos,
    peso_aproximado: produto.pesoAproximado,
    serve_pessoas: produto.servePessoas,
    validade: produto.validade,
    recomendado: produto.recomendado,
    novo: produto.novo,
    mais_vendido: produto.maisVendido,
    status_produto: produto.status,
    disponivel_canais: produto.disponivelCanais,
    auto_pause_sem_estoque: produto.autoPauseSemEstoque,
    vendas_count: produto.vendas,
    receita_total: produto.receita,
    codigo_barras: produto.codigoBarras || null,
    frete_gratis: produto.freteGratis,
    primeiro_pedido: produto.primeiroPedido,
    pesavel: produto.pesavel,
    quero_desconto: produto.queroDesconto,
    ncm: produto.ncm?.trim() || null,
    cfop: produto.cfop?.trim() || "5102",
    csosn: produto.csosn?.trim() || "102",
    origem: produto.origem ?? 0,
    gtin: produto.gtin?.trim() || produto.codigoBarras?.trim() || null,
  };
}

async function upsertProdutoVariacoesAndFicha(
  supabaseAdmin: Awaited<
    ReturnType<typeof import("@/integrations/supabase/client.server")>
  >["supabaseAdmin"],
  produto: ProductRecord,
  productId: string,
) {
  await supabaseAdmin.from("produto_variacoes").delete().eq("produto_id", productId);
  if (produto.variacoes.length > 0) {
    const { error: varError } = await supabaseAdmin.from("produto_variacoes").insert(
      produto.variacoes.map((variacao) => ({
        id: isUuid(variacao.id) ? variacao.id : undefined,
        produto_id: productId,
        nome: variacao.nome.trim(),
        preco: variacao.preco,
        estoque: variacao.estoque,
        tempo_preparo: variacao.tempoPreparo,
        status: variacao.status,
      })),
    );
    if (varError) throw new Error(`Erro ao salvar variações: ${varError.message}`);
  }

  await supabaseAdmin.from("produto_ficha_tecnica").delete().eq("produto_id", productId);
  if (produto.fichaTecnica.length > 0) {
    const { error: fichaError } = await supabaseAdmin.from("produto_ficha_tecnica").insert(
      produto.fichaTecnica.map((item) => ({
        id: isUuid(item.id) ? item.id : undefined,
        produto_id: productId,
        ingrediente: item.ingrediente,
        quantidade: item.quantidade,
        unidade: item.unidade,
        custo_unitario: item.custoUnitario,
        fornecedor: item.fornecedor,
      })),
    );
    if (fichaError) throw new Error(`Erro ao salvar ficha técnica: ${fichaError.message}`);
  }
}

/** Salva um único produto (sem regravar promoções/movimentos de todo o tenant). */
export async function saveProductRecord(
  product: ProductRecord,
  categorias: ProductCategory[],
  tenantId: string,
): Promise<{ productId: string }> {
  const produto = sanitizeProductForPersistence(product);

  if (!produto.nome.trim()) throw new Error("Informe o nome do produto.");
  if (!produto.categoria.trim()) {
    throw new Error("Escolha uma categoria. Cadastre em Produtos → Categorias se necessário.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const categoriaIdByNome = await upsertCategorias(supabaseAdmin, categorias, tenantId);
  const categoriaId = categoriaIdByNome.get(produto.categoria) ?? null;
  if (!categoriaId) {
    throw new Error(
      `Categoria "${produto.categoria}" não encontrada. Atualize a página e tente novamente.`,
    );
  }

  const productId = isUuid(produto.id) ? produto.id : crypto.randomUUID();
  await upsertProdutoRow(supabaseAdmin, buildProdutoRow(produto, tenantId, productId, categoriaId));
  await upsertProdutoVariacoesAndFicha(supabaseAdmin, produto, productId);

  return { productId };
}

function parseCanais(value: unknown): SellChannel[] {
  if (Array.isArray(value)) return value as SellChannel[];
  return ["balcao", "mesas", "delivery", "qrcode"];
}

function parseAlergenos(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function mapCategoria(row: DbCategoria): ProductCategory {
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao ?? "",
    icone: row.emoji ?? "🍯",
    ordem: row.ordem,
    status: row.ativo && row.status_categoria !== "pausado" ? "ativo" : "pausado",
  };
}

function mapProduto(
  row: DbProduto,
  variacoes: ProductVariation[],
  fichaTecnica: TechnicalItem[],
): ProductRecord {
  const categoriaNome =
    (row.categorias as { nome: string } | null)?.nome ??
    defaultCategories.find((c) => c.nome === row.subcategoria)?.nome ??
    "Sem categoria";

  const status = (row.status_produto as ProductStatus) ?? (row.ativo ? "ativo" : "pausado");

  return {
    id: row.id,
    nome: row.nome,
    sku: row.sku ?? createSku(row.nome),
    categoria: categoriaNome,
    subcategoria: row.subcategoria ?? "",
    precoVenda: Number(row.preco),
    precoPromocional: row.preco_promocional != null ? Number(row.preco_promocional) : null,
    custoProducao: Number(row.custo_producao ?? 0),
    tempoPreparo: row.tempo_preparo_min,
    estoque: row.estoque ?? 0,
    estoqueMinimo: row.estoque_minimo ?? 0,
    unidade: (row.unidade as ProductRecord["unidade"]) ?? "unidade",
    descricaoCurta: row.descricao_curta ?? row.descricao ?? "",
    descricaoCompleta: row.descricao ?? "",
    ingredientes: row.ingredientes ?? "",
    alergenos: parseAlergenos(row.alergenos),
    pesoAproximado: row.peso_aproximado ?? "",
    servePessoas: row.serve_pessoas ?? "",
    validade: row.validade ?? "",
    foto: row.imagem_url ?? "",
    destaque: row.destaque,
    recomendado: Boolean(row.recomendado),
    novo: Boolean(row.novo),
    maisVendido: Boolean(row.mais_vendido),
    status,
    disponivelCanais: parseCanais(row.disponivel_canais),
    variacoes,
    fichaTecnica,
    autoPauseSemEstoque: row.auto_pause_sem_estoque ?? true,
    vendas: row.vendas_count ?? 0,
    receita: Number(row.receita_total ?? 0),
    codigoBarras: row.codigo_barras ?? "",
    freteGratis: Boolean(row.frete_gratis),
    primeiroPedido: Boolean(row.primeiro_pedido),
    pesavel: Boolean(row.pesavel),
    queroDesconto: Boolean(row.quero_desconto),
    ncm: row.ncm ?? "",
    cfop: row.cfop ?? "5102",
    csosn: row.csosn ?? "102",
    origem: row.origem ?? 0,
    gtin: row.gtin ?? "",
  };
}

export async function fetchProdutosModuleStore(tenantId: string): Promise<ProdutosModuleFetchResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [
    categoriasResult,
    produtosResult,
    gruposResult,
    adicionaisResult,
    promocoesResult,
    movimentosResult,
  ] = await Promise.all([
    supabaseAdmin.from("categorias").select("*").eq("tenant_id", tenantId).order("ordem"),
    supabaseAdmin
      .from("produtos")
      .select("*, categorias(nome)")
      .eq("tenant_id", tenantId)
      .order("nome"),
    supabaseAdmin
      .from("grupos_adicionais")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at"),
    supabaseAdmin
      .from("produto_adicionais")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at"),
    supabaseAdmin
      .from("produto_promocoes")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("produto_movimentos_estoque")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (categoriasResult.error) throw categoriasResult.error;
  if (produtosResult.error) throw produtosResult.error;
  if (gruposResult.error) throw gruposResult.error;
  if (adicionaisResult.error) throw adicionaisResult.error;
  if (promocoesResult.error) throw promocoesResult.error;
  if (movimentosResult.error) throw movimentosResult.error;

  const produtosDb = (produtosResult.data ?? []) as DbProduto[];
  const productIds = produtosDb.map((produto) => produto.id);

  const [variacoesResult, fichaResult] = await Promise.all([
    productIds.length
      ? supabaseAdmin.from("produto_variacoes").select("*").in("produto_id", productIds)
      : Promise.resolve({ data: [] as DbVariacao[], error: null }),
    productIds.length
      ? supabaseAdmin.from("produto_ficha_tecnica").select("*").in("produto_id", productIds)
      : Promise.resolve({ data: [] as DbFicha[], error: null }),
  ]);

  if (variacoesResult.error) throw variacoesResult.error;
  if (fichaResult.error) throw fichaResult.error;

  const extrasSchemaReady = await checkProdutosExtrasSchema();

  const needsMigration =
    produtosDb.length > 0 && !produtosDb.some((produto) => Boolean(produto.sku));

  const variacoesByProduto = new Map<string, ProductVariation[]>();
  for (const row of (variacoesResult.data ?? []) as DbVariacao[]) {
    const list = variacoesByProduto.get(row.produto_id) ?? [];
    list.push({
      id: row.id,
      nome: row.nome,
      preco: Number(row.preco),
      estoque: row.estoque,
      tempoPreparo: row.tempo_preparo,
      status: row.status as ProductStatus,
    });
    variacoesByProduto.set(row.produto_id, list);
  }

  const fichaByProduto = new Map<string, TechnicalItem[]>();
  for (const row of (fichaResult.data ?? []) as DbFicha[]) {
    const list = fichaByProduto.get(row.produto_id) ?? [];
    list.push({
      id: row.id,
      ingrediente: row.ingrediente,
      quantidade: Number(row.quantidade),
      unidade: row.unidade,
      custoUnitario: Number(row.custo_unitario),
      fornecedor: row.fornecedor ?? "",
    });
    fichaByProduto.set(row.produto_id, list);
  }

  const categorias =
    (categoriasResult.data ?? []).length > 0
      ? (categoriasResult.data as DbCategoria[]).map(mapCategoria)
      : [];

  const produtos = produtosDb.map((row) =>
    mapProduto(row, variacoesByProduto.get(row.id) ?? [], fichaByProduto.get(row.id) ?? []),
  );

  if (produtos.length === 0) {
    return {
      produtos: [],
      categorias: defaultCategories,
      gruposAdicionais: defaultAddonGroups,
      adicionais: defaultAddons,
      promocoes: [],
      movimentos: [],
      vendasSimuladas: [],
      needsMigration: true,
      extrasSchemaReady,
    };
  }

  const gruposAdicionais =
    (gruposResult.data ?? []).length > 0
      ? (gruposResult.data as DbGrupo[]).map((grupo) => ({
          id: grupo.id,
          nome: grupo.nome,
          descricao: grupo.descricao ?? "",
        }))
      : defaultAddonGroups;

  const adicionais =
    (adicionaisResult.data ?? []).length > 0
      ? (adicionaisResult.data as DbAdicional[]).map((item) => ({
          id: item.id,
          nome: item.nome,
          preco: Number(item.preco),
          estoque: item.estoque,
          obrigatorio: item.obrigatorio,
          min: item.minimo,
          max: item.maximo,
          grupoId: item.grupo_id,
        }))
      : defaultAddons;

  const promocoes = (promocoesResult.data ?? []).map((row: DbPromocao) => ({
    id: row.id,
    productId: row.produto_id,
    tipo: row.tipo as ProductPromotion["tipo"],
    valor: Number(row.valor),
    titulo: row.titulo,
    inicio: row.inicio ?? "",
    fim: row.fim ?? "",
    ativa: row.ativa,
  }));

  const movimentos = (movimentosResult.data ?? []).map((row: DbMovimento) => ({
    id: row.id,
    productId: row.produto_id,
    acao: row.acao as StockMovement["acao"],
    quantidade: row.quantidade,
    canal: (row.canal as SellChannel | "") ?? "",
    observacao: row.observacao ?? "",
    createdAt: row.created_at,
  }));

  return {
    produtos,
    categorias,
    gruposAdicionais,
    adicionais,
    promocoes,
    movimentos,
    vendasSimuladas: [] as SimulatedSale[],
    needsMigration,
    extrasSchemaReady,
  };
}

async function upsertCategorias(
  supabaseAdmin: Awaited<
    ReturnType<typeof import("@/integrations/supabase/client.server")>
  >["supabaseAdmin"],
  categorias: ProductCategory[],
  tenantId: string,
) {
  const idByNome = new Map<string, string>();

  for (const categoria of categorias) {
    const payload = {
      nome: categoria.nome,
      emoji: categoria.icone,
      ordem: categoria.ordem,
      ativo: categoria.status === "ativo",
      descricao: categoria.descricao,
      status_categoria: categoria.status,
      tenant_id: tenantId,
    };

    if (isUuid(categoria.id)) {
      const { data, error } = await supabaseAdmin
        .from("categorias")
        .upsert({ id: categoria.id, ...payload })
        .select("id, nome")
        .single();
      if (error) throw error;
      idByNome.set(categoria.nome, data.id);
      continue;
    }

    const { data: existing } = await supabaseAdmin
      .from("categorias")
      .select("id, nome")
      .eq("tenant_id", tenantId)
      .eq("nome", categoria.nome)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("categorias")
        .update(payload)
        .eq("id", existing.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      idByNome.set(categoria.nome, existing.id);
      continue;
    }

    const { data, error } = await supabaseAdmin
      .from("categorias")
      .insert(payload)
      .select("id, nome")
      .single();
    if (error) throw error;
    idByNome.set(categoria.nome, data.id);
  }

  return idByNome;
}

async function upsertGrupos(
  supabaseAdmin: Awaited<
    ReturnType<typeof import("@/integrations/supabase/client.server")>
  >["supabaseAdmin"],
  grupos: AddonGroup[],
  tenantId: string,
) {
  const idMap = new Map<string, string>();

  for (const grupo of grupos) {
    const payload = { nome: grupo.nome, descricao: grupo.descricao, tenant_id: tenantId };

    if (isUuid(grupo.id)) {
      const { error } = await supabaseAdmin
        .from("grupos_adicionais")
        .upsert({ id: grupo.id, ...payload });
      if (error) throw error;
      idMap.set(grupo.id, grupo.id);
      continue;
    }

    const { data, error } = await supabaseAdmin
      .from("grupos_adicionais")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    idMap.set(grupo.id, data.id);
  }

  return idMap;
}

export async function saveProdutosModuleStore(store: ModuleStore, tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const categoriaIdByNome = await upsertCategorias(supabaseAdmin, store.categorias, tenantId);
  const grupoIdMap = await upsertGrupos(supabaseAdmin, store.gruposAdicionais, tenantId);

  const productIdMap = new Map<string, string>();
  const keptProductIds: string[] = [];

  for (const rawProduto of store.produtos) {
    const produto = sanitizeProductForPersistence(rawProduto);
    const categoriaId = categoriaIdByNome.get(produto.categoria) ?? null;
    const productId = isUuid(produto.id) ? produto.id : crypto.randomUUID();
    productIdMap.set(produto.id, productId);
    keptProductIds.push(productId);

    await upsertProdutoRow(
      supabaseAdmin,
      buildProdutoRow(produto, tenantId, productId, categoriaId),
    );
    await upsertProdutoVariacoesAndFicha(supabaseAdmin, produto, productId);
  }

  const { data: allProducts } = await supabaseAdmin
    .from("produtos")
    .select("id")
    .eq("tenant_id", tenantId);
  const toDelete = (allProducts ?? [])
    .map((row) => row.id)
    .filter((id) => !keptProductIds.includes(id));
  if (toDelete.length > 0) {
    const { error } = await supabaseAdmin
      .from("produtos")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", toDelete);
    if (error) throw error;
  }

  const { data: allGrupos } = await supabaseAdmin
    .from("grupos_adicionais")
    .select("id")
    .eq("tenant_id", tenantId);
  const keptGrupoIds = [...grupoIdMap.values()];
  const gruposToDelete = (allGrupos ?? [])
    .map((row) => row.id)
    .filter((id) => !keptGrupoIds.includes(id));
  if (gruposToDelete.length > 0) {
    await supabaseAdmin
      .from("grupos_adicionais")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", gruposToDelete);
  }

  const { data: allAdicionais } = await supabaseAdmin
    .from("produto_adicionais")
    .select("id")
    .eq("tenant_id", tenantId);
  const keptAdicionalIds: string[] = [];

  for (const adicional of store.adicionais) {
    const grupoId = grupoIdMap.get(adicional.grupoId) ?? adicional.grupoId;
    const adicionalId = isUuid(adicional.id) ? adicional.id : crypto.randomUUID();
    keptAdicionalIds.push(adicionalId);

    const { error } = await supabaseAdmin.from("produto_adicionais").upsert({
      id: adicionalId,
      tenant_id: tenantId,
      grupo_id: grupoId,
      nome: adicional.nome,
      preco: adicional.preco,
      estoque: adicional.estoque,
      obrigatorio: adicional.obrigatorio,
      minimo: adicional.min,
      maximo: adicional.max,
    });
    if (error) throw error;
  }

  const adicionaisToDelete = (allAdicionais ?? [])
    .map((row) => row.id)
    .filter((id) => !keptAdicionalIds.includes(id));
  if (adicionaisToDelete.length > 0) {
    await supabaseAdmin
      .from("produto_adicionais")
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", adicionaisToDelete);
  }

  const resolveProductId = (id: string) => productIdMap.get(id) ?? id;

  await supabaseAdmin.from("produto_promocoes").delete().eq("tenant_id", tenantId);
  if (store.promocoes.length > 0) {
    const { error } = await supabaseAdmin.from("produto_promocoes").insert(
      store.promocoes.map((promocao) => ({
        id: isUuid(promocao.id) ? promocao.id : undefined,
        tenant_id: tenantId,
        produto_id: resolveProductId(promocao.productId),
        tipo: promocao.tipo,
        valor: promocao.valor,
        titulo: promocao.titulo,
        inicio: promocao.inicio || null,
        fim: promocao.fim || null,
        ativa: promocao.ativa,
      })),
    );
    if (error) throw error;
  }

  await supabaseAdmin.from("produto_movimentos_estoque").delete().eq("tenant_id", tenantId);
  if (store.movimentos.length > 0) {
    const { error } = await supabaseAdmin.from("produto_movimentos_estoque").insert(
      store.movimentos.map((movimento) => ({
        id: isUuid(movimento.id) ? movimento.id : undefined,
        tenant_id: tenantId,
        produto_id: resolveProductId(movimento.productId),
        acao: movimento.acao,
        quantidade: movimento.quantidade,
        canal: movimento.canal || null,
        observacao: movimento.observacao,
        created_at: movimento.createdAt,
      })),
    );
    if (error) throw error;
  }
}
