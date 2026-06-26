/**
 * Cadastra ou atualiza um produto diretamente no Supabase.
 * Uso: node ./scripts/seed-produto.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, eq).trim()] = value;
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PRODUCT = {
  nome: "H2OH LIMONETO LT SLEEK 350ML",
  sku: "H2OH-LIMONETO-350",
  codigoBarras: "17892840823983",
  preco: 3.5,
  ncm: "22021000",
  categoriaNome: "Bebidas",
};

async function ensureCategoria(nome) {
  const { data: existing } = await sb.from("categorias").select("id").eq("nome", nome).maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await sb
    .from("categorias")
    .insert({ nome, emoji: "🥤", ordem: 99, ativo: true })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function main() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatorios no .env");
    process.exit(1);
  }

  const categoriaId = await ensureCategoria(PRODUCT.categoriaNome);

  const { data: bySku } = await sb
    .from("produtos")
    .select("id")
    .eq("sku", PRODUCT.sku)
    .maybeSingle();

  const { data: byNome } = await sb
    .from("produtos")
    .select("id")
    .ilike("nome", PRODUCT.nome)
    .maybeSingle();

  const id = bySku?.id ?? byNome?.id ?? randomUUID();

  const row = {
    id,
    nome: PRODUCT.nome,
    descricao: PRODUCT.nome,
    preco: PRODUCT.preco,
    categoria_id: categoriaId,
    sku: PRODUCT.sku,
    subcategoria: "Refrigerantes",
    preco_promocional: null,
    custo_producao: 2,
    estoque_minimo: 6,
    unidade: "unidade",
    descricao_curta: "Agua saborizada limoneto 350ml",
    tempo_preparo_min: 0,
    destaque: false,
    ativo: true,
    estoque: 24,
    status_produto: "ativo",
    disponivel_canais: ["balcao", "mesas", "delivery", "qrcode"],
    auto_pause_sem_estoque: true,
    codigo_barras: PRODUCT.codigoBarras,
    ncm: PRODUCT.ncm,
    cfop: "5102",
    csosn: "102",
    origem: 0,
    gtin: PRODUCT.codigoBarras,
    imagem_url:
      "https://images.unsplash.com/photo-1544145945-f90425340c7e?w=900&auto=format&fit=crop&q=80",
  };

  const { error } = await sb.from("produtos").upsert(row);
  if (error) {
    console.error("FALHA ao salvar produto:", error.message);
    process.exit(1);
  }

  const { data: saved, error: readError } = await sb
    .from("produtos")
    .select("id, nome, preco, sku, codigo_barras, ncm, gtin, ativo")
    .eq("id", id)
    .single();

  if (readError) {
    console.error("Salvou mas falhou leitura:", readError.message);
    process.exit(1);
  }

  console.log("OK produto cadastrado:");
  console.log(JSON.stringify(saved, null, 2));
}

main();
