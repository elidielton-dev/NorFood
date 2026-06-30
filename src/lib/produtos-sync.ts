import { fetchProdutosModuleStoreServer } from "@/lib/api/produtos-module.functions";
import type { ProductRecord } from "@/lib/produtos-module";

export const PRODUTOS_MODULE_PRODUCTS_QUERY_KEY = ["produtos-module", "produtos"] as const;

export async function fetchModuleProducts(tenantSlug: string): Promise<ProductRecord[]> {
  const remote = await fetchProdutosModuleStoreServer({ data: tenantSlug });
  const { needsMigration: _ignored, extrasSchemaReady: _extras, ...store } = remote;
  return store.produtos;
}

export function partitionProdutosBySync(produtos: ProductRecord[]) {
  const sincronizados = produtos.filter(isModuleProductSincronizado);
  const pendentes = produtos.filter((produto) => !isModuleProductSincronizado(produto));
  return {
    sincronizados,
    pendentes,
    totalSincronizados: sincronizados.length,
    totalPendentes: pendentes.length,
  };
}

export function isModuleProductSincronizado(product: ProductRecord) {
  const temNome = Boolean(product.nome?.trim());
  const temPreco = Number(product.precoVenda) > 0;
  const temFoto = Boolean(product.foto?.trim());
  const ativo = product.status === "ativo";
  const temCanal = product.disponivelCanais.length > 0;
  return temNome && temPreco && temFoto && ativo && temCanal;
}

export function labelMotivoModuloNaoSincronizado(product: ProductRecord) {
  const motivos: string[] = [];
  if (!product.nome?.trim()) motivos.push("sem nome");
  if (!(Number(product.precoVenda) > 0)) motivos.push("sem preco");
  if (!product.foto?.trim()) motivos.push("sem foto");
  if (product.status !== "ativo") motivos.push(product.status);
  if (product.disponivelCanais.length === 0) motivos.push("sem canal");
  return motivos.join(", ") || "pendente";
}
