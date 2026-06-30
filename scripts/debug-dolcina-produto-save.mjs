import { randomUUID } from "node:crypto";
import { adminClient } from "./supabase-real-tracking-tools.mjs";

const slug = process.env.TENANT_SLUG ?? "dolcina-pipocaria";

const { data: tenant, error: te } = await adminClient
  .from("tenants")
  .select("id, slug")
  .eq("slug", slug)
  .single();
if (te) throw te;

const tenantId = tenant.id;
console.log("Tenant:", tenant.slug, tenantId);

const { data: cats } = await adminClient
  .from("categorias")
  .select("id, nome")
  .eq("tenant_id", tenantId);
console.log("Categorias existentes:", cats?.length ?? 0, cats);

const catPayload = {
  nome: `TESTE_SAVE_${Date.now()}`,
  emoji: "🍿",
  ordem: 1,
  ativo: true,
  descricao: "test",
  status_categoria: "ativo",
  tenant_id: tenantId,
};
const { data: cat, error: ce } = await adminClient
  .from("categorias")
  .insert(catPayload)
  .select("id,nome")
  .single();
console.log("Insert categoria:", ce?.message ?? "ok", cat);

const productId = randomUUID();
const row = {
  id: productId,
  tenant_id: tenantId,
  nome: "TESTE Pipoca Dolcina",
  descricao: "teste",
  preco: 15,
  imagem_url: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=900",
  tempo_preparo_min: 10,
  destaque: false,
  ativo: true,
  estoque: 10,
  categoria_id: cat.id,
  sku: `TESTE-${Date.now()}`,
  subcategoria: "",
  preco_promocional: null,
  custo_producao: 5,
  estoque_minimo: 0,
  unidade: "unidade",
  descricao_curta: "",
  ingredientes: "",
  alergenos: [],
  status_produto: "ativo",
  disponivel_canais: ["balcao", "delivery", "qrcode", "mesas"],
  auto_pause_sem_estoque: true,
  vendas_count: 0,
  receita_total: 0,
  codigo_barras: null,
  frete_gratis: false,
  primeiro_pedido: false,
  pesavel: false,
  quero_desconto: false,
  ncm: null,
  cfop: "5102",
  csosn: "102",
  origem: 0,
  gtin: null,
};

const { error: pe } = await adminClient.from("produtos").upsert(row);
console.log("Upsert produto:", pe?.message ?? "ok");

const { error: ve } = await adminClient.from("produto_variacoes").insert({
  produto_id: productId,
  nome: "Pequena",
  preco: 12,
  estoque: 10,
  tempo_preparo: 10,
  status: "ativo",
});
console.log("Insert variacao:", ve?.message ?? "ok");

const { error: de } = await adminClient.from("produto_promocoes").delete().eq("tenant_id", tenantId);
console.log("Delete promocoes tenant:", de?.message ?? "ok");

const { error: me } = await adminClient
  .from("produto_movimentos_estoque")
  .delete()
  .eq("tenant_id", tenantId);
console.log("Delete movimentos tenant:", me?.message ?? "ok");

await adminClient.from("produto_variacoes").delete().eq("produto_id", productId);
await adminClient.from("produtos").delete().eq("id", productId);
await adminClient.from("categorias").delete().eq("id", cat.id);
console.log("Cleanup ok");
