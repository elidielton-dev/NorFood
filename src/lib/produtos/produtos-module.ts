import type { Produto } from "@/lib/shared/db";

export type ProductStatus = "ativo" | "pausado" | "indisponivel";
export type SellChannel =
  | "balcao"
  | "mesas"
  | "delivery"
  | "qrcode"
  | "quero_delivery"
  | "ifood"
  | "whatsapp";
export type UnitType = "unidade" | "fatia" | "kg" | "grama" | "caixa" | "cento";
export type StockAction = "entrada" | "saida" | "ajuste" | "venda";
export type PromotionType = "percentual" | "valor" | "leve3pague2" | "combo";

export type ProductVariation = {
  id: string;
  nome: string;
  preco: number;
  estoque: number;
  tempoPreparo: number;
  status: ProductStatus;
};

export type ProductAddon = {
  id: string;
  nome: string;
  preco: number;
  estoque: number;
  obrigatorio: boolean;
  min: number;
  max: number;
  grupoId: string;
};

export type AddonGroup = {
  id: string;
  nome: string;
  descricao: string;
};

export type TechnicalItem = {
  id: string;
  ingrediente: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
  fornecedor: string;
};

export type ProductPromotion = {
  id: string;
  productId: string;
  tipo: PromotionType;
  valor: number;
  titulo: string;
  inicio: string;
  fim: string;
  ativa: boolean;
};

export type StockMovement = {
  id: string;
  productId: string;
  acao: StockAction;
  quantidade: number;
  canal?: SellChannel | "";
  observacao: string;
  createdAt: string;
};

export type SimulatedSale = {
  id: string;
  productId: string;
  quantidade: number;
  canal: SellChannel;
  total: number;
  createdAt: string;
};

export type ProductCategory = {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  ordem: number;
  status: "ativo" | "pausado";
};

export type ProductRecord = {
  id: string;
  nome: string;
  sku: string;
  categoria: string;
  subcategoria: string;
  precoVenda: number;
  precoPromocional: number | null;
  custoProducao: number;
  tempoPreparo: number;
  estoque: number;
  estoqueMinimo: number;
  unidade: UnitType;
  descricaoCurta: string;
  descricaoCompleta: string;
  ingredientes: string;
  alergenos: string[];
  pesoAproximado: string;
  servePessoas: string;
  validade: string;
  foto: string;
  destaque: boolean;
  recomendado: boolean;
  novo: boolean;
  maisVendido: boolean;
  status: ProductStatus;
  disponivelCanais: SellChannel[];
  variacoes: ProductVariation[];
  fichaTecnica: TechnicalItem[];
  autoPauseSemEstoque: boolean;
  vendas: number;
  receita: number;
  codigoBarras: string;
  freteGratis: boolean;
  primeiroPedido: boolean;
  pesavel: boolean;
  queroDesconto: boolean;
  ncm: string;
  cfop: string;
  csosn: string;
  origem: number;
  gtin: string;
};

export type ModuleStore = {
  produtos: ProductRecord[];
  categorias: ProductCategory[];
  gruposAdicionais: AddonGroup[];
  adicionais: ProductAddon[];
  promocoes: ProductPromotion[];
  movimentos: StockMovement[];
  vendasSimuladas: SimulatedSale[];
};

export const PRODUTOS_MODULE_STORAGE_KEY = "abelha-mel-produtos-modulo-v2";

export const CHANNEL_LABELS: Record<SellChannel, string> = {
  balcao: "PDV balcão",
  mesas: "Mesas",
  delivery: "Delivery próprio",
  qrcode: "QR Code da mesa",
  quero_delivery: "Quero Delivery",
  ifood: "iFood",
  whatsapp: "WhatsApp",
};

export const PRODUCT_IMAGES = [
  "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=900&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1541783245831-57d6fb0926d3?w=900&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1464306076886-da185f6a9d05?w=900&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1559622214-f8a9850965bb?w=900&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=900&auto=format&fit=crop&q=80",
];

export const defaultCategories: ProductCategory[] = [
  {
    id: "cat-bolos",
    nome: "Bolos",
    descricao: "Bolos inteiros e especiais",
    icone: "🎂",
    ordem: 1,
    status: "ativo",
  },
  {
    id: "cat-fatias",
    nome: "Fatias",
    descricao: "Fatias individuais",
    icone: "🍰",
    ordem: 2,
    status: "ativo",
  },
  {
    id: "cat-brigadeiros",
    nome: "Brigadeiros",
    descricao: "Doces e brigadeiros",
    icone: "🍫",
    ordem: 3,
    status: "ativo",
  },
  {
    id: "cat-tortas",
    nome: "Tortas",
    descricao: "Tortas doces",
    icone: "🥧",
    ordem: 4,
    status: "ativo",
  },
  {
    id: "cat-caixas",
    nome: "Caixas presenteáveis",
    descricao: "Kits e presentes",
    icone: "🎁",
    ordem: 5,
    status: "ativo",
  },
  {
    id: "cat-bebidas",
    nome: "Bebidas",
    descricao: "Bebidas da vitrine",
    icone: "☕",
    ordem: 6,
    status: "ativo",
  },
];

export const defaultAddonGroups: AddonGroup[] = [
  { id: "grupo-cobertura", nome: "Escolha sua cobertura", descricao: "Coberturas e finalizações" },
  {
    id: "grupo-extras",
    nome: "Adicione extras",
    descricao: "Itens opcionais para valorizar o pedido",
  },
  { id: "grupo-embalagem", nome: "Embalagem", descricao: "Embalagens especiais e presenteáveis" },
];

export const defaultAddons: ProductAddon[] = [
  {
    id: "add-1",
    nome: "Morango",
    preco: 4.5,
    estoque: 32,
    obrigatorio: false,
    min: 0,
    max: 3,
    grupoId: "grupo-extras",
  },
  {
    id: "add-2",
    nome: "Nutella",
    preco: 5.9,
    estoque: 18,
    obrigatorio: false,
    min: 0,
    max: 2,
    grupoId: "grupo-cobertura",
  },
  {
    id: "add-3",
    nome: "Leite Ninho",
    preco: 3.5,
    estoque: 24,
    obrigatorio: false,
    min: 0,
    max: 2,
    grupoId: "grupo-cobertura",
  },
  {
    id: "add-4",
    nome: "Calda extra",
    preco: 2.5,
    estoque: 28,
    obrigatorio: false,
    min: 0,
    max: 2,
    grupoId: "grupo-extras",
  },
  {
    id: "add-5",
    nome: "Embalagem para presente",
    preco: 8.5,
    estoque: 12,
    obrigatorio: false,
    min: 0,
    max: 1,
    grupoId: "grupo-embalagem",
  },
  {
    id: "add-6",
    nome: "Vela de aniversário",
    preco: 1.9,
    estoque: 40,
    obrigatorio: false,
    min: 0,
    max: 5,
    grupoId: "grupo-embalagem",
  },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_RE.test(value);
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSku(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18)
    .toUpperCase();
}

export function sanitizeProductForPersistence(product: ProductRecord): ProductRecord {
  let foto = product.foto?.trim() ?? "";
  if (foto.startsWith("data:")) {
    foto = PRODUCT_IMAGES[0] ?? "";
  }

  const variacoes = (product.variacoes ?? []).filter((variacao) => variacao.nome.trim().length > 0);
  const fichaTecnica = (product.fichaTecnica ?? []).filter(
    (item) => item.ingrediente.trim().length > 0,
  );

  return {
    ...product,
    nome: product.nome.trim(),
    categoria: product.categoria.trim(),
    foto,
    variacoes,
    fichaTecnica,
    alergenos: Array.isArray(product.alergenos) ? product.alergenos : [],
    disponivelCanais: Array.isArray(product.disponivelCanais) ? product.disponivelCanais : [],
  };
}

export function blankProduct(): ProductRecord {
  return {
    id: createId("prod"),
    nome: "",
    sku: "",
    categoria: "",
    subcategoria: "",
    precoVenda: 18.9,
    precoPromocional: null,
    custoProducao: 8.5,
    tempoPreparo: 12,
    estoque: 20,
    estoqueMinimo: 5,
    unidade: "unidade",
    descricaoCurta: "",
    descricaoCompleta: "",
    ingredientes: "",
    alergenos: ["leite", "glúten", "ovos"],
    pesoAproximado: "250g",
    servePessoas: "1 a 2 pessoas",
    validade: "3 dias refrigerado",
    foto: "",
    destaque: false,
    recomendado: false,
    novo: true,
    maisVendido: false,
    status: "ativo",
    disponivelCanais: ["balcao", "mesas", "delivery", "qrcode", "quero_delivery", "whatsapp"],
    variacoes: [],
    fichaTecnica: [],
    autoPauseSemEstoque: true,
    vendas: 0,
    receita: 0,
    codigoBarras: "",
    freteGratis: false,
    primeiroPedido: false,
    pesavel: false,
    queroDesconto: false,
    ncm: "19059090",
    cfop: "5102",
    csosn: "102",
    origem: 0,
    gtin: "",
  };
}

export function normalizeProduct(produto: ProductRecord): ProductRecord {
  return { ...blankProduct(), ...produto, id: produto.id };
}

export function seedProduct(produto: Produto, index: number): ProductRecord {
  const categoria = defaultCategories[index % defaultCategories.length]?.nome ?? "Bolos";
  const preco = Number(produto.preco);
  const custo = Number((preco * 0.42).toFixed(2));
  const estoque = produto.estoque ?? 6 + index * 3;

  return {
    id: produto.id,
    nome: produto.nome,
    sku: createSku(produto.nome),
    categoria,
    subcategoria:
      categoria === "Fatias"
        ? "Fatias premium"
        : categoria === "Bolos"
          ? "Bolos especiais"
          : "Linha artesanal",
    precoVenda: preco,
    precoPromocional: produto.destaque ? Number((preco * 0.92).toFixed(2)) : null,
    custoProducao: custo,
    tempoPreparo: produto.tempo_preparo_min,
    estoque,
    estoqueMinimo: 4,
    unidade: categoria === "Fatias" ? "fatia" : "unidade",
    descricaoCurta: produto.descricao ?? "Doce artesanal da vitrine Abelha & Mel.",
    descricaoCompleta:
      produto.descricao ??
      "Produzido com cuidado, acabamento delicado e perfil premium para salão, balcão e delivery.",
    ingredientes: "Farinha, ovos, leite condensado, mel artesanal e acabamento premium.",
    alergenos: ["leite", "glúten", "ovos"],
    pesoAproximado: categoria === "Fatias" ? "180g" : "600g",
    servePessoas: categoria === "Fatias" ? "1 pessoa" : "4 a 6 pessoas",
    validade: "3 dias refrigerado",
    foto: produto.imagem_url || PRODUCT_IMAGES[index % PRODUCT_IMAGES.length],
    destaque: produto.destaque,
    recomendado: index < 2,
    novo: index % 2 === 0,
    maisVendido: index === 0,
    status: produto.ativo ? "ativo" : "pausado",
    disponivelCanais: ["balcao", "mesas", "delivery", "qrcode", "quero_delivery", "whatsapp"],
    variacoes: [
      {
        id: createId("var"),
        nome: "Padrão",
        preco,
        estoque,
        tempoPreparo: produto.tempo_preparo_min,
        status: "ativo",
      },
      ...(categoria === "Fatias"
        ? [
            {
              id: createId("var"),
              nome: "Caixa com 4",
              preco: Number((preco * 3.8).toFixed(2)),
              estoque: Math.max(1, Math.floor(estoque / 2)),
              tempoPreparo: produto.tempo_preparo_min + 4,
              status: "ativo" as ProductStatus,
            },
          ]
        : []),
    ],
    fichaTecnica: [
      {
        id: createId("tec"),
        ingrediente: "Ingrediente base",
        quantidade: 1,
        unidade: "un",
        custoUnitario: Number((custo * 0.35).toFixed(2)),
        fornecedor: "Fornecedor local",
      },
      {
        id: createId("tec"),
        ingrediente: "Cobertura",
        quantidade: 1,
        unidade: "un",
        custoUnitario: Number((custo * 0.25).toFixed(2)),
        fornecedor: "Distribuidora doce",
      },
      {
        id: createId("tec"),
        ingrediente: "Embalagem",
        quantidade: 1,
        unidade: "un",
        custoUnitario: Number((custo * 0.12).toFixed(2)),
        fornecedor: "Papelaria gourmet",
      },
    ],
    autoPauseSemEstoque: true,
    vendas: index === 0 ? 18 : index === 1 ? 11 : 4 + index,
    receita: (index === 0 ? 18 : index === 1 ? 11 : 4 + index) * preco,
    codigoBarras: "",
    freteGratis: false,
    primeiroPedido: index === 0,
    pesavel: false,
    queroDesconto: Boolean(produto.destaque),
    ncm: "19059090",
    cfop: "5102",
    csosn: "102",
    origem: 0,
    gtin: "",
  };
}

export function buildSeedModuleStore(baseProdutos: Produto[]): ModuleStore {
  const seededProducts = baseProdutos.map((produto, index) => seedProduct(produto, index));
  return {
    produtos: seededProducts,
    categorias: defaultCategories,
    gruposAdicionais: defaultAddonGroups,
    adicionais: defaultAddons,
    promocoes: [
      {
        id: createId("promo"),
        productId: seededProducts[0]?.id ?? "",
        tipo: "percentual",
        valor: 12,
        titulo: "Doce da semana",
        inicio: new Date().toISOString().slice(0, 10),
        fim: "",
        ativa: true,
      },
    ].filter((item) => item.productId),
    movimentos: [],
    vendasSimuladas: [],
  };
}

export function readLegacyModuleStore(): ModuleStore | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(PRODUTOS_MODULE_STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as ModuleStore;
  } catch {
    return null;
  }
}

export function clearLegacyModuleStore() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PRODUTOS_MODULE_STORAGE_KEY);
}
