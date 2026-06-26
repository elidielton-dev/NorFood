/**
 * Cria pedido de balcão e emite NFC-e na SEFAZ (homologação ou produção conforme config).
 * Uso: npm run emit:nfce-venda
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatorios no .env");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureNfceEnabled() {
  const { data, error } = await sb
    .from("fiscal_config")
    .select("nfce_habilitada, ambiente, serie_nfce, proximo_numero_nfce")
    .eq("id", "default")
    .single();
  if (error) throw error;

  if (!data.nfce_habilitada) {
    const { error: upd } = await sb
      .from("fiscal_config")
      .update({ nfce_habilitada: true, updated_at: new Date().toISOString() })
      .eq("id", "default");
    if (upd) throw upd;
    console.log("NFC-e habilitada em fiscal_config.");
  }

  return data;
}

async function findProductWithNcm() {
  const { data, error } = await sb
    .from("produtos")
    .select("id, nome, preco, ncm, sku")
    .not("ncm", "is", null)
    .neq("ncm", "")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.ncm) {
    throw new Error("Nenhum produto com NCM cadastrado. Cadastre NCM no catalogo.");
  }
  return data;
}

async function createBalcaoPedido(produto: { id: string; preco: number }) {
  const preco = Number(produto.preco) || 3.5;
  const subtotal = preco;

  const { data: pedido, error: pedidoError } = await sb
    .from("pedidos")
    .insert({
      canal: "balcao",
      status: "entregue",
      subtotal,
      desconto: 0,
      taxa_entrega: 0,
      total: subtotal,
      forma_pagamento: "dinheiro",
      observacoes: "Venda NFC-e emitida via script emit-nfce-venda",
    })
    .select("id, numero, total")
    .single();
  if (pedidoError) throw pedidoError;

  const { error: itemError } = await sb.from("pedido_itens").insert({
    pedido_id: pedido.id,
    produto_id: produto.id,
    quantidade: 1,
    preco_unitario: preco,
  });
  if (itemError) throw itemError;

  await sb.from("lancamentos_financeiros").insert({
    tipo: "entrada",
    descricao: `Balcão Pedido #${pedido.numero}`,
    categoria: "Vendas balcão",
    valor: subtotal,
    forma: "dinheiro",
    pedido_id: pedido.id,
  });

  return pedido;
}

async function main() {
  const config = await ensureNfceEnabled();
  const produto = await findProductWithNcm();
  console.log(`Produto: ${produto.nome} (NCM ${produto.ncm}) — R$ ${Number(produto.preco).toFixed(2)}`);

  const pedido = await createBalcaoPedido(produto);
  console.log(`Pedido balcão #${pedido.numero} criado (${pedido.id})`);

  const { emitNfceForPedido } = await import("../src/lib/api/fiscal.server.ts");
  console.log(`Emitindo NFC-e (ambiente: ${config.ambiente ?? "homologacao"})...`);

  const result = await emitNfceForPedido(pedido.id);

  const nota = result.nota;
  const sefaz = result.sefaz;

  console.log("\n=== NFC-e emitida ===");
  console.log(`Status: ${nota.status}`);
  console.log(`Numero: ${nota.numero} serie ${nota.serie}`);
  if (nota.chave_acesso) console.log(`Chave: ${nota.chave_acesso}`);
  if (sefaz?.protocolo) console.log(`Protocolo: ${sefaz.protocolo}`);
  if (sefaz?.codigoStatus) console.log(`cStat: ${sefaz.codigoStatus} — ${sefaz.motivo}`);
  if (sefaz?.qrcodeUrl) console.log(`QR Code: ${sefaz.qrcodeUrl}`);
}

main().catch((error) => {
  console.error("\nFalha na emissao:", error instanceof Error ? error.message : error);
  process.exit(1);
});
