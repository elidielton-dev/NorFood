import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Beaker,
  ClipboardList,
  Copy,
  DollarSign,
  Eye,
  FlaskConical,
  Layers3,
  Lock,
  Package,
  PackageCheck,
  PackageX,
  Pencil,
  Percent,
  Plus,
  Power,
  Sparkles,
  Store,
  Trash2,
  Unlock,
  WandSparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchProdutosModuleStoreServer,
  saveProdutosModuleStoreServer,
} from "@/lib/api/produtos-module.functions";
import { formatBRL, listarProdutos } from "@/lib/db";
import {
  blankProduct,
  buildSeedModuleStore,
  CHANNEL_LABELS,
  clearLegacyModuleStore,
  createId,
  createSku,
  defaultAddonGroups,
  defaultAddons,
  defaultCategories,
  normalizeProduct,
  PRODUCT_IMAGES,
  PRODUTOS_MODULE_STORAGE_KEY,
  readLegacyModuleStore,
  type ModuleStore,
  type ProductRecord,
  type ProductStatus,
  type PromotionType,
  type SellChannel,
  type StockAction,
} from "@/lib/produtos-module";
import { hasBrowserSupabaseConfig } from "@/lib/runtime";
import { usePainelNavigate } from "@/lib/painel/use-painel-navigate";
import { usePainelSearch } from "@/lib/painel/use-painel-search";
import {
  isModuleProductSincronizado,
  labelMotivoModuloNaoSincronizado,
  partitionProdutosBySync,
  PRODUTOS_MODULE_PRODUCTS_QUERY_KEY,
} from "@/lib/produtos-sync";
import { toast } from "sonner";
import { isValidNcm } from "@/lib/fiscal/fiscal-validation";
import { ProductFormModal } from "@/components/product-form-modal";
import {
  GestaoAlert,
  GestaoButton,
  GestaoCard,
  GestaoEmptyState,
  GestaoPage,
  GestaoSearch,
  GestaoSectionTitle,
  GestaoSelect,
  GestaoTable,
  GestaoTableHead,
  GestaoTabs,
  GestaoToolbar,
  StatusPill,
} from "@/components/gestao-ui";

type TabId =
  | "visao-geral"
  | "produtos"
  | "categorias"
  | "adicionais"
  | "estoque"
  | "promocoes"
  | "disponibilidade"
  | "integracoes";

export const Route = createFileRoute("/_authenticated/painel/produtos")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? (search.tab as TabId) : undefined,
    editar: typeof search.editar === "string" ? search.editar : undefined,
  }),
  component: ProdutosPage,
});

const parseProdutosSearch = (search: Record<string, unknown>) => ({
  tab: typeof search.tab === "string" ? (search.tab as TabId) : undefined,
  editar: typeof search.editar === "string" ? search.editar : undefined,
});

function ProdutosPage() {
  const { tab: tabFromSearch, editar: editarFromSearch } = usePainelSearch(parseProdutosSearch);
  const navigate = usePainelNavigate();
  const queryClient = useQueryClient();
  const useSupabase = hasBrowserSupabaseConfig();

  const [extrasSchemaReady, setExtrasSchemaReady] = useState(true);

  const { data: moduleStore, isLoading } = useQuery({
    queryKey: ["produtos-module"],
    queryFn: async (): Promise<ModuleStore> => {
      if (!useSupabase) {
        const legacy = readLegacyModuleStore();
        if (legacy) return legacy;
        const baseProdutos = await listarProdutos();
        return buildSeedModuleStore(baseProdutos);
      }

      const remote = await fetchProdutosModuleStoreServer();
      setExtrasSchemaReady(remote.extrasSchemaReady);
      const legacy = readLegacyModuleStore();
      if (legacy && remote.needsMigration) {
        await saveProdutosModuleStoreServer({ data: { store: legacy } });
        clearLegacyModuleStore();
        const synced = await fetchProdutosModuleStoreServer();
        const { needsMigration: _ignored, ...store } = synced;
        return store;
      }

      if (remote.needsMigration) {
        const { needsMigration: _ignored, ...store } = remote;
        await saveProdutosModuleStoreServer({ data: { store } });
        return store;
      }

      const { needsMigration: _ignored, ...store } = remote;
      return store;
    },
  });

  const saveMutation = useMutation({
    mutationFn: (store: ModuleStore) => saveProdutosModuleStoreServer({ data: { store } }),
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Falha ao salvar no Supabase.";
      toast.error(message);
    },
  });

  const [tab, setTab] = useState<TabId>(tabFromSearch ?? "visao-geral");

  useEffect(() => {
    if (tabFromSearch && tabFromSearch !== tab) {
      setTab(tabFromSearch);
    }
  }, [tabFromSearch, tab]);

  useEffect(() => {
    if (!editarFromSearch || !moduleStore || isLoading) return;
    const produto = moduleStore.produtos.find((item) => item.id === editarFromSearch);
    if (!produto) return;
    setTab("produtos");
    setEditingId(produto.id);
    setForm(normalizeProduct(produto));
    setProductModalOpen(true);
    void navigate({ to: "/painel/produtos", search: { tab: "produtos" }, replace: true });
  }, [editarFromSearch, isLoading, moduleStore, navigate]);

  useEffect(() => {
    if (moduleStore?.produtos) {
      queryClient.setQueryData(PRODUTOS_MODULE_PRODUCTS_QUERY_KEY, moduleStore.produtos);
    }
  }, [moduleStore?.produtos, queryClient]);
  const [query, setQuery] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroCanal, setFiltroCanal] = useState("todos");
  const [ordenacao, setOrdenacao] = useState("nome");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [fichaProdutoId, setFichaProdutoId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductRecord>(() => blankProduct());
  const [novaCategoria, setNovaCategoria] = useState({ nome: "", descricao: "", icone: "🍯" });
  const [novoGrupo, setNovoGrupo] = useState({ nome: "", descricao: "" });
  const [novoAdicional, setNovoAdicional] = useState({
    nome: "",
    preco: 0,
    estoque: 0,
    obrigatorio: false,
    min: 0,
    max: 1,
    grupoId: defaultAddonGroups[0].id,
  });
  const [novaPromocao, setNovaPromocao] = useState({
    productId: "",
    tipo: "percentual" as PromotionType,
    valor: 10,
    titulo: "",
    inicio: "",
    fim: "",
  });
  const [movimento, setMovimento] = useState({
    productId: "",
    acao: "entrada" as StockAction,
    quantidade: 1,
    observacao: "",
  });

  function persistStore(next: ModuleStore) {
    queryClient.setQueryData(["produtos-module"], next);
    queryClient.setQueryData(PRODUTOS_MODULE_PRODUCTS_QUERY_KEY, next.produtos);
    if (useSupabase) {
      saveMutation.mutate(next);
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PRODUTOS_MODULE_STORAGE_KEY, JSON.stringify(next));
    }
  }

  function validateProductForm(product: ProductRecord) {
    if (!product.nome.trim()) return "Informe o nome do produto.";
    if (!product.categoria.trim()) return "Escolha uma categoria.";
    if (!(Number(product.precoVenda) > 0)) return "Informe um preco de venda maior que zero.";
    if (product.ncm.trim() && !isValidNcm(product.ncm)) {
      return "NCM invalido. Use 8 digitos (ex.: 22021000).";
    }
    return null;
  }

  async function handleSaveProduct() {
    if (!moduleStore) return;

    const prepared = {
      ...form,
      nome: form.nome.trim(),
      sku: form.sku.trim() || createSku(form.nome),
      codigoBarras: form.codigoBarras.replace(/\D/g, ""),
      gtin: (form.gtin.trim() || form.codigoBarras).replace(/\D/g, "") || "",
      ncm: form.ncm.replace(/\D/g, "").slice(0, 8),
      status:
        form.estoque <= 0 ? (form.autoPauseSemEstoque ? "indisponivel" : form.status) : form.status,
      foto: form.foto || PRODUCT_IMAGES[Math.floor(Math.random() * PRODUCT_IMAGES.length)],
      fichaTecnica: form.fichaTecnica ?? [],
      variacoes: form.variacoes ?? [],
    };

    const validationError = validateProductForm(prepared);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const nextStore: ModuleStore = {
      ...moduleStore,
      produtos: moduleStore.produtos.some((produto) => produto.id === prepared.id)
        ? moduleStore.produtos.map((produto) => (produto.id === prepared.id ? prepared : produto))
        : [prepared, ...moduleStore.produtos],
    };

    if (useSupabase) {
      const toastId = "produto-save";
      toast.loading("Salvando produto...", { id: toastId });
      try {
        await saveProdutosModuleStoreServer({ data: { store: nextStore } });
        queryClient.setQueryData(["produtos-module"], nextStore);
        queryClient.setQueryData(PRODUTOS_MODULE_PRODUCTS_QUERY_KEY, nextStore.produtos);
        toast.success(
          editingId ? "Produto atualizado e salvo no banco." : "Produto criado e salvo no banco.",
          { id: toastId },
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Nao foi possivel salvar o produto no Supabase.";
        toast.error(message, { id: toastId });
        return;
      }
    } else {
      persistStore(nextStore);
      toast.success(editingId ? "Produto atualizado na vitrine." : "Produto criado na vitrine.");
    }

    setEditingId(null);
    setForm(blankProduct());
    setProductModalOpen(false);
    setTab("produtos");
  }

  const produtos = useMemo(() => moduleStore?.produtos ?? [], [moduleStore]);
  const categorias = useMemo(() => moduleStore?.categorias ?? defaultCategories, [moduleStore]);
  const gruposAdicionais = useMemo(
    () => moduleStore?.gruposAdicionais ?? defaultAddonGroups,
    [moduleStore],
  );
  const adicionais = useMemo(() => moduleStore?.adicionais ?? defaultAddons, [moduleStore]);
  const promocoes = useMemo(() => moduleStore?.promocoes ?? [], [moduleStore]);
  const movimentos = useMemo(() => moduleStore?.movimentos ?? [], [moduleStore]);
  const vendasSimuladas = useMemo(() => moduleStore?.vendasSimuladas ?? [], [moduleStore]);

  const stats = useMemo(() => {
    const total = produtos.length;
    const ativos = produtos.filter((produto) => produto.status === "ativo").length;
    const pausados = produtos.filter((produto) => produto.status === "pausado").length;
    const semEstoque = produtos.filter((produto) => produto.estoque <= 0).length;
    const estoqueBaixo = produtos.filter(
      (produto) => produto.estoque > 0 && produto.estoque <= produto.estoqueMinimo,
    ).length;
    const receitaTotal = produtos.reduce((sum, produto) => sum + produto.receita, 0);
    const vendasTotais = produtos.reduce((sum, produto) => sum + produto.vendas, 0);
    const ticketMedio = vendasTotais ? receitaTotal / vendasTotais : 0;
    const maisVendido = [...produtos].sort((a, b) => b.vendas - a.vendas)[0];

    const receitaPorCategoria = categorias.map((categoria) => {
      const receita = produtos
        .filter((produto) => produto.categoria === categoria.nome)
        .reduce((sum, produto) => sum + produto.receita, 0);
      return { nome: categoria.nome, receita };
    });
    const categoriaMaisVendida = [...receitaPorCategoria].sort((a, b) => b.receita - a.receita)[0];
    const { totalSincronizados, totalPendentes } = partitionProdutosBySync(produtos);

    return {
      total,
      ativos,
      pausados,
      semEstoque,
      ticketMedio,
      produtoMaisVendido: maisVendido?.nome ?? "Sem histórico",
      categoriaMaisVendida: categoriaMaisVendida?.nome ?? "Sem histórico",
      alertasEstoque: estoqueBaixo,
      receitaPorCategoria,
      sincronizados: totalSincronizados,
      pendentes: totalPendentes,
    };
  }, [categorias, produtos]);

  const produtosFiltrados = useMemo(() => {
    let lista = [...produtos];

    if (query.trim()) {
      const termo = query.toLowerCase();
      lista = lista.filter(
        (produto) =>
          produto.nome.toLowerCase().includes(termo) ||
          produto.sku.toLowerCase().includes(termo) ||
          produto.descricaoCurta.toLowerCase().includes(termo),
      );
    }
    if (filtroCategoria !== "todas") {
      lista = lista.filter((produto) => produto.categoria === filtroCategoria);
    }
    if (filtroStatus !== "todos") {
      lista = lista.filter((produto) => produto.status === filtroStatus);
    }
    if (filtroCanal !== "todos") {
      lista = lista.filter((produto) =>
        produto.disponivelCanais.includes(filtroCanal as SellChannel),
      );
    }

    lista.sort((a, b) => {
      if (ordenacao === "preco") return a.precoVenda - b.precoVenda;
      if (ordenacao === "estoque") return a.estoque - b.estoque;
      if (ordenacao === "mais_vendido") return b.vendas - a.vendas;
      return a.nome.localeCompare(b.nome);
    });

    return lista;
  }, [filtroCanal, filtroCategoria, filtroStatus, ordenacao, produtos, query]);

  const lowStockProducts = useMemo(
    () => produtos.filter((produto) => produto.estoque <= produto.estoqueMinimo),
    [produtos],
  );

  const selectedFicha = useMemo(
    () => produtos.find((produto) => produto.id === fichaProdutoId) ?? produtos[0] ?? null,
    [fichaProdutoId, produtos],
  );

  const relatorioCanais = useMemo(() => {
    return Object.entries(CHANNEL_LABELS).map(([canal, label]) => {
      const total = vendasSimuladas
        .filter((venda) => venda.canal === canal)
        .reduce((sum, venda) => sum + venda.total, 0);
      return { canal: label, total };
    });
  }, [vendasSimuladas]);

  function updateStore(updater: (current: ModuleStore) => ModuleStore) {
    if (!moduleStore) return;
    persistStore(updater(moduleStore));
  }

  function handleOpenNewProduct() {
    setEditingId(null);
    setForm(blankProduct());
    setProductModalOpen(true);
  }

  function handleEditProduct(produto: ProductRecord) {
    setEditingId(produto.id);
    setForm(normalizeProduct(produto));
    setProductModalOpen(true);
  }

  function handleDuplicateProduct(produto: ProductRecord) {
    const duplicated = {
      ...produto,
      id: createId("prod"),
      nome: `${produto.nome} - cópia`,
      sku: createSku(`${produto.nome}-copia`),
      vendas: 0,
      receita: 0,
    };
    updateStore((current) => ({ ...current, produtos: [duplicated, ...current.produtos] }));
    toast.success("Produto duplicado.");
  }

  function handleDeleteProduct(id: string) {
    updateStore((current) => ({
      ...current,
      produtos: current.produtos.filter((produto) => produto.id !== id),
      promocoes: current.promocoes.filter((promocao) => promocao.productId !== id),
      movimentos: current.movimentos.filter((movimentoItem) => movimentoItem.productId !== id),
      vendasSimuladas: current.vendasSimuladas.filter((venda) => venda.productId !== id),
    }));
    toast.success("Produto removido.");
  }

  function handleToggleStatus(produto: ProductRecord) {
    updateStore((current) => ({
      ...current,
      produtos: current.produtos.map((item) =>
        item.id === produto.id
          ? {
              ...item,
              status:
                item.status === "ativo" ? "pausado" : item.estoque <= 0 ? "indisponivel" : "ativo",
            }
          : item,
      ),
    }));
  }

  function handleStockMovement() {
    if (!movimento.productId || !moduleStore) return toast.error("Escolha um produto.");
    if (movimento.quantidade <= 0) return toast.error("Informe uma quantidade válida.");

    updateStore((current) => {
      const target = current.produtos.find((produto) => produto.id === movimento.productId);
      if (!target) return current;

      let novoEstoque = target.estoque;
      if (movimento.acao === "entrada") novoEstoque += movimento.quantidade;
      if (movimento.acao === "saida")
        novoEstoque = Math.max(0, target.estoque - movimento.quantidade);
      if (movimento.acao === "ajuste") novoEstoque = movimento.quantidade;

      return {
        ...current,
        produtos: current.produtos.map((produto) =>
          produto.id === target.id
            ? {
                ...produto,
                estoque: novoEstoque,
                status:
                  novoEstoque <= 0 && produto.autoPauseSemEstoque
                    ? "indisponivel"
                    : produto.status === "indisponivel" && novoEstoque > 0
                      ? "ativo"
                      : produto.status,
              }
            : produto,
        ),
        movimentos: [
          {
            id: createId("mov"),
            productId: target.id,
            acao: movimento.acao,
            quantidade: movimento.quantidade,
            observacao: movimento.observacao || "Movimentação manual",
            createdAt: new Date().toISOString(),
          },
          ...current.movimentos,
        ],
      };
    });

    toast.success("Estoque atualizado.");
    setMovimento({
      productId: movimento.productId,
      acao: "entrada",
      quantidade: 1,
      observacao: "",
    });
  }

  function handleCreateCategory() {
    if (!novaCategoria.nome.trim()) return toast.error("Informe o nome da categoria.");
    updateStore((current) => ({
      ...current,
      categorias: [
        ...current.categorias,
        {
          id: createId("cat"),
          nome: novaCategoria.nome.trim(),
          descricao: novaCategoria.descricao.trim(),
          icone: novaCategoria.icone.trim() || "🍯",
          ordem: current.categorias.length + 1,
          status: "ativo",
        },
      ],
    }));
    setNovaCategoria({ nome: "", descricao: "", icone: "🍯" });
  }

  function handleCreateGroup() {
    if (!novoGrupo.nome.trim()) return toast.error("Informe o nome do grupo.");
    updateStore((current) => ({
      ...current,
      gruposAdicionais: [
        ...current.gruposAdicionais,
        {
          id: createId("grupo"),
          nome: novoGrupo.nome.trim(),
          descricao: novoGrupo.descricao.trim(),
        },
      ],
    }));
    setNovoGrupo({ nome: "", descricao: "" });
  }

  function handleCreateAddon() {
    if (!novoAdicional.nome.trim()) return toast.error("Informe o nome do adicional.");
    updateStore((current) => ({
      ...current,
      adicionais: [
        ...current.adicionais,
        { id: createId("add"), ...novoAdicional, nome: novoAdicional.nome.trim() },
      ],
    }));
    setNovoAdicional({
      nome: "",
      preco: 0,
      estoque: 0,
      obrigatorio: false,
      min: 0,
      max: 1,
      grupoId: gruposAdicionais[0]?.id ?? "",
    });
  }

  function handleCreatePromotion() {
    if (!novaPromocao.productId || !novaPromocao.titulo.trim()) {
      return toast.error("Escolha o produto e informe o título da promoção.");
    }
    updateStore((current) => ({
      ...current,
      promocoes: [
        {
          id: createId("promo"),
          productId: novaPromocao.productId,
          tipo: novaPromocao.tipo,
          valor: novaPromocao.valor,
          titulo: novaPromocao.titulo.trim(),
          inicio: novaPromocao.inicio,
          fim: novaPromocao.fim,
          ativa: true,
        },
        ...current.promocoes,
      ],
    }));
    setNovaPromocao({
      productId: "",
      tipo: "percentual",
      valor: 10,
      titulo: "",
      inicio: "",
      fim: "",
    });
  }

  if (isLoading || !moduleStore) {
    return (
      <GestaoCard className="text-sm text-muted-foreground">
        Carregando módulo de produtos e cardápio...
      </GestaoCard>
    );
  }

  const tabItems: { id: TabId; label: string }[] = [
    { id: "visao-geral", label: "Visão geral" },
    { id: "produtos", label: "Produtos cadastrados" },
    { id: "categorias", label: "Categorias" },
    { id: "adicionais", label: "Adicionais e complementos" },
    { id: "estoque", label: "Estoque e ficha técnica" },
    { id: "promocoes", label: "Promoções" },
    { id: "disponibilidade", label: "Disponibilidade" },
    { id: "integracoes", label: "Integrações" },
  ];

  return (
    <GestaoPage
      title="Produtos e Cardápio"
      subtitle="Cadastro avançado, estoque, ficha técnica, promoções e disponibilidade por canal em um só módulo."
      eyebrow="Gestão premium de doceria"
      actions={
        <GestaoButton type="button" onClick={handleOpenNewProduct}>
          <Plus className="size-4" />
          Novo produto
        </GestaoButton>
      }
    >
      {!extrasSchemaReady ? (
        <GestaoAlert tone="warning">
          Os campos extras do produto ainda nao estao no banco. Execute{" "}
          <code className="rounded bg-amber-100 px-1">npm run migrate:produtos-extras</code> e cole
          o SQL no Supabase, ou aplique a migration{" "}
          <code className="rounded bg-amber-100 px-1">
            20260617200000_produtos_campos_extras.sql
          </code>
          .
        </GestaoAlert>
      ) : null}

      <GestaoTabs value={tab} onChange={(id) => setTab(id as TabId)} items={tabItems} />

      {tab === "visao-geral" && (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-4">
            <SummaryCard
              label="Total de produtos"
              value={String(stats.total)}
              icon={<Package className="size-5" />}
              tone="gold"
            />
            <SummaryCard
              label="Produtos ativos"
              value={String(stats.ativos)}
              icon={<Store className="size-5" />}
              tone="success"
            />
            <SummaryCard
              label="Produtos pausados"
              value={String(stats.pausados)}
              icon={<Lock className="size-5" />}
              tone="warning"
            />
            <SummaryCard
              label="Sem estoque"
              value={String(stats.semEstoque)}
              icon={<AlertTriangle className="size-5" />}
              tone="danger"
            />
            <SummaryCard
              label="Ticket médio"
              value={formatBRL(stats.ticketMedio)}
              icon={<DollarSign className="size-5" />}
              tone="info"
            />
            <SummaryCard
              label="Produto mais vendido"
              value={stats.produtoMaisVendido}
              icon={<Sparkles className="size-5" />}
              tone="gold"
              compact
            />
            <SummaryCard
              label="Categoria mais vendida"
              value={stats.categoriaMaisVendida}
              icon={<Layers3 className="size-5" />}
              tone="info"
              compact
            />
            <SummaryCard
              label="Alertas de estoque baixo"
              value={String(stats.alertasEstoque)}
              icon={<AlertTriangle className="size-5" />}
              tone="warning"
            />
            <SummaryCard
              label="Sincronizados na vitrine"
              value={String(stats.sincronizados)}
              icon={<PackageCheck className="size-5" />}
              tone="success"
            />
            <SummaryCard
              label="Pendentes de ajuste"
              value={String(stats.pendentes)}
              icon={<PackageX className="size-5" />}
              tone="warning"
            />
          </div>

          <GestaoCard className="xl:col-span-2">
            <GestaoSectionTitle
              title="Sincronizacao com a vitrine"
              description="Produtos prontos para venda online e canais vs itens que ainda precisam de foto, preco ou ativacao."
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Link
                to="/painel/produtos/sincronizados"
                className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 transition hover:bg-emerald-50"
              >
                <p className="text-sm font-semibold text-emerald-800">
                  {stats.sincronizados} sincronizados
                </p>
                <p className="mt-1 text-xs text-emerald-700">
                  Nome, preco, foto, status ativo e canal de venda.
                </p>
              </Link>
              <Link
                to="/painel/produtos/nao-sincronizados"
                className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 transition hover:bg-amber-50"
              >
                <p className="text-sm font-semibold text-amber-800">{stats.pendentes} pendentes</p>
                <p className="mt-1 text-xs text-amber-700">
                  Revise e corrija antes de publicar na loja.
                </p>
              </Link>
            </div>
          </GestaoCard>

          <PanelCard
            title="Receita por categoria"
            subtitle="Leitura rápida da vitrine por desempenho"
          >
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.receitaPorCategoria}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(value) => `R$${Number(value).toFixed(0)}`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={(value: number) => formatBRL(value)} />
                  <Bar dataKey="receita" fill="var(--sage)" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>

          <PanelCard title="Vendas por canal" subtitle="Movimentos registrados por canal de venda">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={relatorioCanais.filter((item) => item.total > 0)}
                    dataKey="total"
                    nameKey="canal"
                    outerRadius={96}
                    innerRadius={48}
                  >
                    {relatorioCanais.map((entry, index) => (
                      <Cell
                        key={entry.canal}
                        fill={
                          [
                            "#4D5E4A",
                            "#D9A441",
                            "#E7BFA9",
                            "#C98B6E",
                            "#9BC3AE",
                            "#7C98B3",
                            "#8C6C96",
                          ][index % 7]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatBRL(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>

          <PanelCard
            title="Produtos com baixo estoque"
            subtitle="Atenção para reposição e pausa automática"
          >
            <div className="grid gap-3 md:grid-cols-2">
              {lowStockProducts.length === 0 ? (
                <EmptyState text="Nenhum alerta de estoque baixo no momento." />
              ) : (
                lowStockProducts.map((produto) => (
                  <div
                    key={produto.id}
                    className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[color:var(--gestao-ink)]">{produto.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {produto.categoria} · {produto.unidade}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-700">
                        {produto.estoque} em estoque
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-amber-800">
                      Estoque mínimo: {produto.estoqueMinimo} · Auto pausar:{" "}
                      {produto.autoPauseSemEstoque ? "sim" : "não"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        </div>
      )}

      {tab === "produtos" && (
        <PanelCard
          title="Produtos cadastrados"
          subtitle="Busca, filtros, ordenação e ações rápidas da vitrine"
        >
          <GestaoToolbar className="mb-4">
            <GestaoButton onClick={handleOpenNewProduct}>
              <Plus className="size-4" />
              Novo produto
            </GestaoButton>
          </GestaoToolbar>

          <div className="mb-4 grid gap-3 lg:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]">
            <GestaoSearch
              value={query}
              onChange={setQuery}
              placeholder="Buscar por nome, SKU ou descrição"
            />
            <GestaoSelect
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
            >
              <option value="todas">Todas categorias</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.nome}>
                  {categoria.nome}
                </option>
              ))}
            </GestaoSelect>
            <GestaoSelect value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="todos">Todos status</option>
              <option value="ativo">Ativos</option>
              <option value="pausado">Pausados</option>
              <option value="indisponivel">Sem estoque</option>
            </GestaoSelect>
            <GestaoSelect value={filtroCanal} onChange={(e) => setFiltroCanal(e.target.value)}>
              <option value="todos">Todos canais</option>
              {Object.entries(CHANNEL_LABELS).map(([canal, label]) => (
                <option key={canal} value={canal}>
                  {label}
                </option>
              ))}
            </GestaoSelect>
            <GestaoSelect value={ordenacao} onChange={(e) => setOrdenacao(e.target.value)}>
              <option value="nome">Ordenar por nome</option>
              <option value="preco">Ordenar por preço</option>
              <option value="estoque">Ordenar por estoque</option>
              <option value="mais_vendido">Mais vendido</option>
            </GestaoSelect>
          </div>

          {produtosFiltrados.length === 0 ? (
            <GestaoEmptyState
              title="Nenhum produto encontrado"
              description="Ajuste os filtros ou cadastre um novo item na vitrine."
              action={
                <GestaoButton onClick={handleOpenNewProduct}>
                  <Plus className="size-4" />
                  Novo produto
                </GestaoButton>
              }
            />
          ) : (
            <>
              <div className="hidden lg:block">
                <GestaoTable>
                  <GestaoTableHead>
                    <tr>
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Preço</th>
                      <th className="px-4 py-3">Estoque</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Vitrine</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </GestaoTableHead>
                  <tbody>
                    {produtosFiltrados.map((produto) => (
                      <tr
                        key={produto.id}
                        className="border-b border-[color:var(--honey-line)]/60 last:border-0"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={produto.foto}
                              alt={produto.nome}
                              className="size-11 rounded-xl object-cover"
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-[color:var(--gestao-ink)]">
                                {produto.nome}
                              </p>
                              <p className="text-xs text-muted-foreground">SKU {produto.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{produto.categoria}</td>
                        <td className="px-4 py-3">
                          {produto.precoPromocional ? (
                            <div>
                              <p className="font-semibold text-emerald-700">
                                {formatBRL(produto.precoPromocional)}
                              </p>
                              <p className="text-xs text-muted-foreground line-through">
                                {formatBRL(produto.precoVenda)}
                              </p>
                            </div>
                          ) : (
                            <p className="font-semibold">{formatBRL(produto.precoVenda)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {produto.estoque} {produto.unidade}
                        </td>
                        <td className="px-4 py-3">
                          <ProductStatusPill status={produto.status} />
                        </td>
                        <td className="px-4 py-3">
                          <SyncStatusPill produto={produto} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <ActionButton
                              icon={<Pencil className="size-3.5" />}
                              label="Editar"
                              onClick={() => handleEditProduct(produto)}
                            />
                            <ActionButton
                              icon={<Copy className="size-3.5" />}
                              label="Duplicar"
                              onClick={() => handleDuplicateProduct(produto)}
                            />
                            <ActionButton
                              icon={<Power className="size-3.5" />}
                              label={produto.status === "ativo" ? "Pausar" : "Ativar"}
                              onClick={() => handleToggleStatus(produto)}
                            />
                            <ActionButton
                              icon={<Trash2 className="size-3.5" />}
                              label="Excluir"
                              onClick={() => handleDeleteProduct(produto.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </GestaoTable>
              </div>

              <div className="space-y-3 lg:hidden">
                {produtosFiltrados.map((produto) => (
                  <div
                    key={produto.id}
                    className="overflow-hidden rounded-2xl border border-[color:var(--honey-line)] bg-card shadow-soft"
                  >
                    <div className="flex gap-3 p-4">
                      <img
                        src={produto.foto}
                        alt={produto.nome}
                        className="size-20 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-display text-lg text-[color:var(--gestao-ink)]">
                              {produto.nome}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {produto.categoria} · SKU {produto.sku}
                            </p>
                          </div>
                          <ProductStatusPill status={produto.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-emerald-700">
                            {formatBRL(produto.precoPromocional ?? produto.precoVenda)}
                          </span>
                          <span className="text-muted-foreground">
                            {produto.estoque} {produto.unidade}
                          </span>
                          <SyncStatusPill produto={produto} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <ActionButton
                            icon={<Pencil className="size-3.5" />}
                            label="Editar"
                            onClick={() => handleEditProduct(produto)}
                          />
                          <ActionButton
                            icon={<Power className="size-3.5" />}
                            label={produto.status === "ativo" ? "Pausar" : "Ativar"}
                            onClick={() => handleToggleStatus(produto)}
                          />
                          <ActionButton
                            icon={<Eye className="size-3.5" />}
                            label="Ficha"
                            onClick={() => {
                              setFichaProdutoId(produto.id);
                              setTab("estoque");
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </PanelCard>
      )}

      {tab === "categorias" && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <PanelCard title="Cadastrar categoria" subtitle="Ordem, ícone e status de exibição">
            <div className="grid gap-3">
              <TextField
                label="Nome da categoria"
                value={novaCategoria.nome}
                onChange={(value) => setNovaCategoria((current) => ({ ...current, nome: value }))}
              />
              <TextField
                label="Descrição"
                value={novaCategoria.descricao}
                onChange={(value) =>
                  setNovaCategoria((current) => ({ ...current, descricao: value }))
                }
              />
              <TextField
                label="Ícone / emoji"
                value={novaCategoria.icone}
                onChange={(value) => setNovaCategoria((current) => ({ ...current, icone: value }))}
              />
              <button
                onClick={handleCreateCategory}
                className="rounded-2xl bg-sage px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                Criar categoria
              </button>
            </div>
          </PanelCard>

          <PanelCard
            title="Categorias da vitrine"
            subtitle="Exibição organizada para doces, bebidas e kits"
          >
            <div className="space-y-3">
              {categorias
                .slice()
                .sort((a, b) => a.ordem - b.ordem)
                .map((categoria) => (
                  <div
                    key={categoria.id}
                    className="flex items-center justify-between rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/45 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid size-12 place-items-center rounded-2xl bg-white text-2xl">
                        {categoria.icone}
                      </div>
                      <div>
                        <p className="font-medium text-[color:var(--gestao-ink)]">
                          {categoria.nome}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {categoria.descricao || "Sem descrição"}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        updateStore((current) => ({
                          ...current,
                          categorias: current.categorias.map((item) =>
                            item.id === categoria.id
                              ? { ...item, status: item.status === "ativo" ? "pausado" : "ativo" }
                              : item,
                          ),
                        }))
                      }
                      className="rounded-full border border-[color:var(--honey-line)] px-3 py-1.5 text-xs font-medium"
                    >
                      {categoria.status === "ativo" ? "Pausar" : "Ativar"}
                    </button>
                  </div>
                ))}
            </div>
          </PanelCard>
        </div>
      )}

      {tab === "adicionais" && (
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <PanelCard
              title="Grupo de adicionais"
              subtitle="Ex: escolha sua cobertura, extras e embalagem"
            >
              <div className="grid gap-3">
                <TextField
                  label="Nome do grupo"
                  value={novoGrupo.nome}
                  onChange={(value) => setNovoGrupo((current) => ({ ...current, nome: value }))}
                />
                <TextField
                  label="Descrição"
                  value={novoGrupo.descricao}
                  onChange={(value) =>
                    setNovoGrupo((current) => ({ ...current, descricao: value }))
                  }
                />
                <button
                  onClick={handleCreateGroup}
                  className="rounded-2xl bg-sage px-4 py-3 text-sm font-semibold text-primary-foreground"
                >
                  Criar grupo
                </button>
              </div>
            </PanelCard>

            <PanelCard
              title="Novo adicional"
              subtitle="Precificação, estoque e obrigatoriedade do complemento"
            >
              <div className="grid gap-3">
                <TextField
                  label="Nome do adicional"
                  value={novoAdicional.nome}
                  onChange={(value) => setNovoAdicional((current) => ({ ...current, nome: value }))}
                />
                <NumberField
                  label="Preço"
                  value={novoAdicional.preco}
                  onChange={(value) =>
                    setNovoAdicional((current) => ({ ...current, preco: value }))
                  }
                />
                <NumberField
                  label="Estoque"
                  value={novoAdicional.estoque}
                  onChange={(value) =>
                    setNovoAdicional((current) => ({ ...current, estoque: value }))
                  }
                />
                <SelectField
                  label="Grupo"
                  value={novoAdicional.grupoId}
                  onChange={(value) =>
                    setNovoAdicional((current) => ({ ...current, grupoId: value }))
                  }
                  options={gruposAdicionais.map((grupo) => grupo.id)}
                  optionLabel={(value) =>
                    gruposAdicionais.find((grupo) => grupo.id === value)?.nome ?? value
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Qtd mínima"
                    value={novoAdicional.min}
                    onChange={(value) =>
                      setNovoAdicional((current) => ({ ...current, min: value }))
                    }
                  />
                  <NumberField
                    label="Qtd máxima"
                    value={novoAdicional.max}
                    onChange={(value) =>
                      setNovoAdicional((current) => ({ ...current, max: value }))
                    }
                  />
                </div>
                <ToggleLine
                  label="Obrigatório"
                  checked={novoAdicional.obrigatorio}
                  onChange={(checked) =>
                    setNovoAdicional((current) => ({ ...current, obrigatorio: checked }))
                  }
                />
                <button
                  onClick={handleCreateAddon}
                  className="rounded-2xl bg-sage px-4 py-3 text-sm font-semibold text-primary-foreground"
                >
                  Criar adicional
                </button>
              </div>
            </PanelCard>
          </div>

          <PanelCard
            title="Adicionais e complementos"
            subtitle="Organização por grupo e controle de estoque"
          >
            <div className="space-y-4">
              {gruposAdicionais.map((grupo) => (
                <div
                  key={grupo.id}
                  className="rounded-3xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/35 p-4"
                >
                  <p className="font-medium text-[color:var(--gestao-ink)]">{grupo.nome}</p>
                  <p className="text-xs text-muted-foreground">{grupo.descricao}</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {adicionais
                      .filter((adicional) => adicional.grupoId === grupo.id)
                      .map((adicional) => (
                        <div
                          key={adicional.id}
                          className="rounded-2xl border border-border bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{adicional.nome}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatBRL(adicional.preco)} · estoque {adicional.estoque}
                              </p>
                            </div>
                            <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px]">
                              {adicional.obrigatorio ? "Obrigatório" : "Opcional"}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Min {adicional.min} · Máx {adicional.max}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </PanelCard>
        </div>
      )}

      {tab === "estoque" && (
        <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="space-y-4">
            <PanelCard title="Movimentar estoque" subtitle="Entrada, saída, ajuste e histórico">
              <div className="grid gap-3">
                <select
                  value={movimento.productId}
                  onChange={(e) =>
                    setMovimento((current) => ({ ...current, productId: e.target.value }))
                  }
                  className="rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-3 text-sm"
                >
                  <option value="">Selecione o produto</option>
                  {produtos.map((produto) => (
                    <option key={produto.id} value={produto.id}>
                      {produto.nome}
                    </option>
                  ))}
                </select>
                <select
                  value={movimento.acao}
                  onChange={(e) =>
                    setMovimento((current) => ({ ...current, acao: e.target.value as StockAction }))
                  }
                  className="rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-3 text-sm"
                >
                  <option value="entrada">Entrada de estoque</option>
                  <option value="saida">Saída de estoque</option>
                  <option value="ajuste">Ajuste manual</option>
                </select>
                <NumberField
                  label="Quantidade"
                  value={movimento.quantidade}
                  onChange={(value) =>
                    setMovimento((current) => ({ ...current, quantidade: value }))
                  }
                />
                <TextField
                  label="Observação"
                  value={movimento.observacao}
                  onChange={(value) =>
                    setMovimento((current) => ({ ...current, observacao: value }))
                  }
                />
                <button
                  onClick={handleStockMovement}
                  className="rounded-2xl bg-sage px-4 py-3 text-sm font-semibold text-primary-foreground"
                >
                  Registrar movimentação
                </button>
              </div>
            </PanelCard>

            <PanelCard title="Histórico de movimentações" subtitle="Últimos lançamentos do estoque">
              <div className="space-y-2">
                {movimentos.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-border bg-[color:var(--gestao-cream)]/35 p-3 text-sm"
                  >
                    <p className="font-medium">
                      {produtos.find((produto) => produto.id === item.productId)?.nome ?? "Produto"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.acao} · {item.quantidade} ·{" "}
                      {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.observacao}</p>
                  </div>
                ))}
              </div>
            </PanelCard>
          </div>

          <PanelCard
            title="Ficha técnica do produto"
            subtitle="Custos, margem, sugestao de preco e baixa automatica"
          >
            <div className="mb-4 flex flex-col gap-3 lg:flex-row">
              <select
                value={selectedFicha?.id ?? ""}
                onChange={(e) => setFichaProdutoId(e.target.value)}
                className="rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-3 text-sm"
              >
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome}
                  </option>
                ))}
              </select>
            </div>

            {selectedFicha ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <FichaMetric
                    label="Custo total"
                    value={formatBRL(getTechnicalCost(selectedFicha))}
                  />
                  <FichaMetric
                    label="Lucro estimado"
                    value={formatBRL(
                      (selectedFicha.precoPromocional ?? selectedFicha.precoVenda) -
                        getTechnicalCost(selectedFicha),
                    )}
                  />
                  <FichaMetric
                    label="Margem %"
                    value={`${getMargin(selectedFicha.precoVenda, getTechnicalCost(selectedFicha)).toFixed(1)}%`}
                  />
                  <FichaMetric
                    label="Preço ideal"
                    value={formatBRL(getTechnicalCost(selectedFicha) * 2.35)}
                  />
                </div>

                <div className="grid gap-3">
                  {selectedFicha.fichaTecnica.map((item) => (
                    <div
                      key={item.id}
                      className="grid gap-2 rounded-2xl border border-border bg-[color:var(--gestao-cream)]/25 p-3 md:grid-cols-5"
                    >
                      <div>
                        <p className="text-xs text-muted-foreground">Ingrediente</p>
                        <p className="font-medium">{item.ingrediente}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Quantidade</p>
                        <p>
                          {item.quantidade} {item.unidade}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Custo unitário</p>
                        <p>{formatBRL(item.custoUnitario)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Custo total</p>
                        <p>{formatBRL(item.quantidade * item.custoUnitario)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fornecedor</p>
                        <p>{item.fornecedor}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState text="Selecione um produto para ver a ficha técnica." />
            )}
          </PanelCard>
        </div>
      )}

      {tab === "promocoes" && (
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <PanelCard title="Criar promoção" subtitle="Percentual, valor, leve 3 pague 2 ou combo">
            <div className="grid gap-3">
              <select
                value={novaPromocao.productId}
                onChange={(e) =>
                  setNovaPromocao((current) => ({ ...current, productId: e.target.value }))
                }
                className="rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-3 text-sm"
              >
                <option value="">Selecione o produto</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome}
                  </option>
                ))}
              </select>
              <TextField
                label="Título da promoção"
                value={novaPromocao.titulo}
                onChange={(value) => setNovaPromocao((current) => ({ ...current, titulo: value }))}
              />
              <SelectField
                label="Tipo"
                value={novaPromocao.tipo}
                onChange={(value) =>
                  setNovaPromocao((current) => ({ ...current, tipo: value as PromotionType }))
                }
                options={["percentual", "valor", "leve3pague2", "combo"]}
              />
              <NumberField
                label="Valor"
                value={novaPromocao.valor}
                onChange={(value) => setNovaPromocao((current) => ({ ...current, valor: value }))}
              />
              <TextField
                label="Início"
                value={novaPromocao.inicio}
                onChange={(value) => setNovaPromocao((current) => ({ ...current, inicio: value }))}
              />
              <TextField
                label="Fim"
                value={novaPromocao.fim}
                onChange={(value) => setNovaPromocao((current) => ({ ...current, fim: value }))}
              />
              <button
                onClick={handleCreatePromotion}
                className="rounded-2xl bg-sage px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                Criar promoção
              </button>
            </div>
          </PanelCard>

          <PanelCard
            title="Promoções e cupons"
            subtitle="Controle simples de campanhas do cardápio"
          >
            <div className="space-y-3">
              {promocoes.length === 0 ? (
                <EmptyState text="Nenhuma promoção criada ainda." />
              ) : (
                promocoes.map((promocao) => {
                  const produto = produtos.find((item) => item.id === promocao.productId);
                  return (
                    <div
                      key={promocao.id}
                      className="rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/45 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-[color:var(--gestao-ink)]">
                            {promocao.titulo}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {produto?.nome ?? "Produto"} · {promocao.tipo}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${promocao.ativa ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-muted-foreground"}`}
                        >
                          {promocao.ativa ? "Ativa" : "Pausada"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Valor:{" "}
                        {promocao.tipo === "valor"
                          ? formatBRL(promocao.valor)
                          : `${promocao.valor}%`}{" "}
                        · {promocao.inicio || "sem início"} até {promocao.fim || "sem fim"}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </PanelCard>
        </div>
      )}

      {tab === "disponibilidade" && (
        <PanelCard
          title="Disponibilidade por canal"
          subtitle="Ative ou desative onde cada produto aparece"
        >
          <div className="space-y-3">
            {produtos.map((produto) => (
              <div
                key={produto.id}
                className="rounded-3xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/25 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[color:var(--gestao-ink)]">{produto.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {produto.status} · estoque {produto.estoque}
                    </p>
                  </div>
                  <StatusBadge status={produto.status} />
                </div>
                <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-4">
                  {Object.entries(CHANNEL_LABELS).map(([canal, label]) => {
                    const checked = produto.disponivelCanais.includes(canal as SellChannel);
                    return (
                      <button
                        key={canal}
                        onClick={() =>
                          updateStore((current) => ({
                            ...current,
                            produtos: current.produtos.map((item) =>
                              item.id === produto.id
                                ? {
                                    ...item,
                                    disponivelCanais: checked
                                      ? item.disponivelCanais.filter((value) => value !== canal)
                                      : [...item.disponivelCanais, canal as SellChannel],
                                  }
                                : item,
                            ),
                          }))
                        }
                        className={`rounded-2xl border px-3 py-2 text-sm transition ${
                          checked
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-border bg-white text-muted-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </PanelCard>
      )}

      {tab === "integracoes" && (
        <PanelCard
          title="Integrações futuras"
          subtitle="Campos visuais preparados para conexão com APIs e webhooks"
        >
          <div className="grid gap-4 xl:grid-cols-2">
            {[
              ["API Quero Delivery", "Token, placeId e sincronização de pedidos/estoque"],
              ["API iFood", "Conector futuro para cardápio e pedidos externos"],
              ["Webhook de pedidos", "Entrada para pedidos externos e eventos operacionais"],
              [
                "Webhook de atualização de estoque",
                "Saída para sincronização após vendas e ajustes",
              ],
              ["Token de integração", "Credencial central para autenticação de parceiros"],
            ].map(([title, text]) => (
              <div
                key={title}
                className="rounded-3xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/35 p-4"
              >
                <p className="font-medium text-[color:var(--gestao-ink)]">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                <input
                  placeholder={`Configuração de ${title}`}
                  className="mt-3 w-full rounded-2xl border border-[color:var(--honey-line)] bg-white px-3 py-3 text-sm"
                />
              </div>
            ))}
          </div>
        </PanelCard>
      )}

      <ProductFormModal
        open={productModalOpen}
        onOpenChange={setProductModalOpen}
        form={form}
        setForm={setForm}
        editingId={editingId}
        categorias={categorias}
        onSave={handleSaveProduct}
      />
    </GestaoPage>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "gold" | "success" | "warning" | "danger" | "info";
  compact?: boolean;
}) {
  const tones = {
    gold: "bg-amber-100 text-amber-800",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-rose-100 text-rose-700",
    info: "bg-sky-100 text-sky-700",
  };

  return (
    <div className="rounded-[24px] border border-[color:var(--honey-line)] bg-card p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={`grid size-11 place-items-center rounded-2xl ${tones[tone]}`}>{icon}</div>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--gestao-gold-deep)]">
        {label}
      </p>
      <p
        className={`mt-2 text-[color:var(--gestao-ink)] ${compact ? "font-display text-xl" : "font-display text-3xl"}`}
      >
        {value}
      </p>
    </div>
  );
}

function PanelCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <GestaoCard>
      <GestaoSectionTitle title={title} description={subtitle} />
      <div className="mt-4">{children}</div>
    </GestaoCard>
  );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/25 text-center text-sm text-muted-foreground ${compact ? "px-4 py-5" : "px-4 py-10"}`}
    >
      {text}
    </div>
  );
}

function ProductStatusPill({ status }: { status: ProductStatus }) {
  const tones = {
    ativo: "success",
    pausado: "warning",
    indisponivel: "danger",
  } as const;
  return <StatusPill tone={tones[status]}>{status}</StatusPill>;
}

function SyncStatusPill({ produto }: { produto: ProductRecord }) {
  const sincronizado = isModuleProductSincronizado(produto);
  return (
    <StatusPill tone={sincronizado ? "success" : "warning"}>
      {sincronizado ? "Na vitrine" : labelMotivoModuloNaoSincronizado(produto)}
    </StatusPill>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  return <ProductStatusPill status={status} />;
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1 rounded-full border border-[color:var(--honey-line)] px-3 py-2 text-xs font-medium whitespace-nowrap"
    >
      {icon}
      {label}
    </button>
  );
}

function FichaMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/35 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--gestao-gold-deep)]">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl text-[color:var(--gestao-ink)]">{value}</p>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-3 text-sm"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-3 text-sm"
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="w-full rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/35 px-3 py-3 text-sm font-medium">
        {value}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  optionLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  optionLabel?: (value: string) => string;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-3 text-sm"
      >
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel ? optionLabel(option) : option}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleLine({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-3 py-2 text-sm">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`rounded-full px-3 py-1 text-xs font-semibold ${checked ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-muted-foreground"}`}
      >
        {checked ? "Ligado" : "Desligado"}
      </button>
    </label>
  );
}

function getMargin(preco: number, custo: number) {
  if (!preco || preco <= 0) return 0;
  return ((preco - custo) / preco) * 100;
}

function getTechnicalCost(produto: ProductRecord) {
  return produto.fichaTecnica.reduce((sum, item) => sum + item.quantidade * item.custoUnitario, 0);
}
