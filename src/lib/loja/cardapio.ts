import bolo from "@/assets/doce-bolo.jpg";
import brigadeiro from "@/assets/doce-brigadeiro.jpg";
import cupcake from "@/assets/doce-cupcake.jpg";
import macaron from "@/assets/doce-macaron.jpg";
import mel from "@/assets/doce-mel.jpg";
import torta from "@/assets/doce-torta.jpg";

export type CategoriaCardapio = {
  id: string;
  nome: string;
  emoji: string;
};

export type CategoriaId = string;

export type Doce = {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  imagem: string;
  categoria: string;
  tempoPreparoMin: number;
  calorias: number;
  destaque?: boolean;
  avaliacao: number;
};

export const categoriasFallback: CategoriaCardapio[] = [
  { id: "todos", nome: "Todos", emoji: "🍽️" },
  { id: "pratos", nome: "Pratos", emoji: "🍛" },
  { id: "lanches", nome: "Lanches", emoji: "🥪" },
  { id: "bebidas", nome: "Bebidas", emoji: "🥤" },
  { id: "sobremesas", nome: "Sobremesas", emoji: "🍰" },
  { id: "combos", nome: "Combos", emoji: "⭐" },
];

export const docesFallback: Doce[] = [
  {
    id: "acaraje-especial",
    nome: "Acarajé Especial",
    descricao: "Baiana caprichada com vatapá, caruru e pimenta na medida.",
    preco: 18.9,
    imagem: mel,
    categoria: "pratos",
    tempoPreparoMin: 20,
    calorias: 420,
    destaque: true,
    avaliacao: 4.9,
  },
  {
    id: "tapioca-recheada",
    nome: "Tapioca Recheada",
    descricao: "Massa fresca com queijo coalho, carne de sol e molho da casa.",
    preco: 16.5,
    imagem: brigadeiro,
    categoria: "lanches",
    tempoPreparoMin: 12,
    calorias: 380,
    destaque: true,
    avaliacao: 4.8,
  },
  {
    id: "moqueca-individual",
    nome: "Moqueca Individual",
    descricao: "Peixe fresco, leite de coco, pimentões e arroz soltinho.",
    preco: 32.9,
    imagem: bolo,
    categoria: "pratos",
    tempoPreparoMin: 25,
    calorias: 510,
    avaliacao: 4.9,
  },
  {
    id: "suco-natural",
    nome: "Suco Natural 500ml",
    descricao: "Fruta da estação batida na hora, sem conservantes.",
    preco: 9.9,
    imagem: cupcake,
    categoria: "bebidas",
    tempoPreparoMin: 5,
    calorias: 120,
    avaliacao: 4.7,
  },
  {
    id: "combo-almoco",
    nome: "Combo Almoço",
    descricao: "Prato do dia, acompanhamento, salada e bebida.",
    preco: 29.9,
    imagem: torta,
    categoria: "combos",
    tempoPreparoMin: 18,
    calorias: 680,
    destaque: true,
    avaliacao: 4.9,
  },
  {
    id: "sobremesa-casa",
    nome: "Sobremesa da Casa",
    descricao: "Doce regional servido conforme disponibilidade do dia.",
    preco: 12.9,
    imagem: macaron,
    categoria: "sobremesas",
    tempoPreparoMin: 8,
    calorias: 260,
    avaliacao: 4.8,
  },
];

const categoryImageMap: Record<string, string> = {
  pratos: bolo,
  lanches: brigadeiro,
  bebidas: cupcake,
  sobremesas: macaron,
  combos: torta,
  bolos: bolo,
  brigadeiros: brigadeiro,
  tortas: torta,
  doces: mel,
};

export function inferCategoryEmoji(nome: string) {
  const normalized = nome.trim().toLowerCase();
  if (normalized.includes("bebida") || normalized.includes("suco")) return "🥤";
  if (normalized.includes("combo")) return "⭐";
  if (normalized.includes("sobremesa") || normalized.includes("doce")) return "🍰";
  if (normalized.includes("lanche") || normalized.includes("tapioca")) return "🥪";
  if (normalized.includes("prato") || normalized.includes("moqueca")) return "🍛";
  return "🍽️";
}

export function inferCategorySlug(nome: string): CategoriaId {
  const normalized = nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.includes("bebida") || normalized.includes("suco")) return "bebidas";
  if (normalized.includes("combo")) return "combos";
  if (normalized.includes("sobremesa")) return "sobremesas";
  if (normalized.includes("lanche") || normalized.includes("tapioca")) return "lanches";
  if (
    normalized.includes("prato") ||
    normalized.includes("moqueca") ||
    normalized.includes("acaraje")
  ) {
    return "pratos";
  }
  return normalized || "pratos";
}

export function resolveProductImage(categoria: string, imageUrl?: string | null) {
  if (imageUrl) return imageUrl;
  return categoryImageMap[categoria] ?? bolo;
}

export const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
