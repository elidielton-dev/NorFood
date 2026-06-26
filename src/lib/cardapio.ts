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
  { id: "todos", nome: "Todos", emoji: "?" },
  { id: "bolos", nome: "Bolos", emoji: "?" },
  { id: "brigadeiros", nome: "Brigadeiros", emoji: "?" },
  { id: "tortas", nome: "Tortas", emoji: "?" },
  { id: "doces", nome: "Doces", emoji: "?" },
  { id: "bebidas", nome: "Bebidas", emoji: "?" },
];

export const docesFallback: Doce[] = [
  {
    id: "bolo-mel",
    nome: "Bolo de Mel da Casa",
    descricao: "Camadas fofinhas com calda de mel artesanal e creme de baunilha.",
    preco: 12.9,
    imagem: bolo,
    categoria: "bolos",
    tempoPreparoMin: 15,
    calorias: 320,
    destaque: true,
    avaliacao: 4.9,
  },
  {
    id: "brigadeiro-gold",
    nome: "Brigadeiro Gold",
    descricao: "Chocolate belga 70% com lascas de ouro comestivel.",
    preco: 6.5,
    imagem: brigadeiro,
    categoria: "brigadeiros",
    tempoPreparoMin: 5,
    calorias: 180,
    destaque: true,
    avaliacao: 4.8,
  },
  {
    id: "cupcake-rosa",
    nome: "Cupcake Rosa & Mel",
    descricao: "Massa de baunilha, cobertura de buttercream rosa e perolas douradas.",
    preco: 9.9,
    imagem: cupcake,
    categoria: "doces",
    tempoPreparoMin: 8,
    calorias: 260,
    avaliacao: 4.7,
  },
  {
    id: "doce-mel-flor",
    nome: "Flor de Mel",
    descricao: "Doce artesanal em formato de flor com mel puro de abelhas.",
    preco: 7.5,
    imagem: mel,
    categoria: "doces",
    tempoPreparoMin: 5,
    calorias: 150,
    avaliacao: 5,
  },
  {
    id: "torta-morango",
    nome: "Torta de Morango",
    descricao: "Base crocante, creme aveludado, morangos frescos e fio de mel.",
    preco: 14.9,
    imagem: torta,
    categoria: "tortas",
    tempoPreparoMin: 20,
    calorias: 280,
    destaque: true,
    avaliacao: 4.9,
  },
  {
    id: "macaron-rosa",
    nome: "Macaron Rosa & Ouro",
    descricao: "Trio de macarons com recheio de framboesa e detalhes em ouro.",
    preco: 18,
    imagem: macaron,
    categoria: "doces",
    tempoPreparoMin: 10,
    calorias: 210,
    avaliacao: 4.8,
  },
];

const categoryImageMap: Record<string, string> = {
  bolos: bolo,
  brigadeiros: brigadeiro,
  tortas: torta,
  doces: mel,
  bebidas: cupcake,
};

export function inferCategoryEmoji(nome: string) {
  const normalized = nome.trim().toLowerCase();
  if (normalized.includes("bolo")) return "?";
  if (normalized.includes("brigade")) return "?";
  if (normalized.includes("torta")) return "?";
  if (normalized.includes("beb")) return "?";
  return "?";
}

export function inferCategorySlug(nome: string) {
  const normalized = nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized.includes("bolo")) return "bolos";
  if (normalized.includes("brigade")) return "brigadeiros";
  if (normalized.includes("torta")) return "tortas";
  if (normalized.includes("beb")) return "bebidas";
  return normalized || "doces";
}

export function resolveProductImage(categoria: string, imageUrl?: string | null) {
  if (imageUrl) return imageUrl;
  return categoryImageMap[categoria] ?? macaron;
}

export const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
