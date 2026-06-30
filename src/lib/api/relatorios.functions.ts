import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";
import type { RelatorioDataset } from "@/lib/relatorios-inteligencia";
import { gerarDataset } from "@/lib/relatorios-inteligencia";

function mapCanal(
  canal: string,
): "pdv" | "mesas" | "delivery" | "qrcode" | "whatsapp" | "quero_delivery" | "ifood" {
  if (canal === "balcao") return "pdv";
  if (canal === "mesa") return "mesas";
  return canal as "delivery" | "qrcode" | "whatsapp" | "quero_delivery" | "ifood";
}

function mapPagamento(forma: string | null): "dinheiro" | "pix" | "cartao" | "online" {
  if (!forma) return "dinheiro";
  if (forma === "pix") return "pix";
  if (forma === "credito" || forma === "debito") return "cartao";
  if (forma === "online") return "online";
  return "dinheiro";
}

function mapStatus(status: string): "concluido" | "cancelado" | "em_preparo" | "entregue" {
  if (status === "cancelado") return "cancelado";
  if (status === "entregue") return "entregue";
  if (status === "aberto" || status === "em_preparo" || status === "pronto") return "em_preparo";
  return "concluido";
}

function extractBairro(observacoes: string | null) {
  if (!observacoes) return "";
  return observacoes.match(/bairro=([^;]+)/i)?.[1]?.trim() ?? "";
}

export const fetchRelatorioDatasetServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<RelatorioDataset> => {
    await assertStaffUserId(context.userId, "Acesso restrito aos relatorios.");
    const { resolveStaffTenantId } = await import("@/lib/api/auth-helpers.server");
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      pedidosResult,
      produtosResult,
      financeiroResult,
      entregasResult,
      notasResult,
      cuponsResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("pedidos")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("produtos")
        .select("id, nome, preco, estoque, tempo_preparo_min, ativo, categorias(nome)")
        .eq("tenant_id", tenantId),
      supabaseAdmin
        .from("lancamentos_financeiros")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("data", { ascending: false })
        .limit(500),
      supabaseAdmin.from("entregas").select("pedido_id, motoboy_id, bairro").eq("tenant_id", tenantId),
      supabaseAdmin
        .from("notas_fiscais")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("cupons")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (pedidosResult.error) throw pedidosResult.error;
    if (produtosResult.error) throw produtosResult.error;
    if (financeiroResult.error) throw financeiroResult.error;

    const pedidoIds = (pedidosResult.data ?? []).map((pedido) => pedido.id);
    const clienteIds = [
      ...new Set(
        (pedidosResult.data ?? [])
          .map((pedido) => pedido.cliente_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [itensResult, clientesResult, motoboysResult] = await Promise.all([
      pedidoIds.length
        ? supabaseAdmin
            .from("pedido_itens")
            .select(
              "id, pedido_id, produto_id, quantidade, preco_unitario, produtos(nome, categoria_id, categorias(nome))",
            )
            .in("pedido_id", pedidoIds)
            .limit(2000)
        : Promise.resolve({ data: [], error: null }),
      clienteIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id, nome, telefone, pontos_fidelidade, created_at")
            .in("id", clienteIds)
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("role", "entregador")
        .eq("status", "active"),
    ]);

    if (itensResult.error) throw itensResult.error;
    if (clientesResult.error) throw clientesResult.error;
    if (motoboysResult.error) throw motoboysResult.error;

    const itensByPedido = new Map<string, typeof itensResult.data>();
    for (const item of itensResult.data ?? []) {
      const list = itensByPedido.get(item.pedido_id) ?? [];
      list.push(item);
      itensByPedido.set(item.pedido_id, list);
    }

    const entregaByPedido = new Map(
      (entregasResult.data ?? []).map((entrega) => [entrega.pedido_id, entrega]),
    );

    const clienteMap = new Map((clientesResult.data ?? []).map((cliente) => [cliente.id, cliente]));

    const pedidos = (pedidosResult.data ?? []).map((pedido) => {
      const cliente = pedido.cliente_id ? clienteMap.get(pedido.cliente_id) : null;
      const entrega = entregaByPedido.get(pedido.id);
      const itens = (itensByPedido.get(pedido.id) ?? []).map((item) => {
        const produto = item.produtos as {
          nome: string;
          categorias: { nome: string } | null;
        } | null;
        return {
          produtoId: item.produto_id,
          nome: produto?.nome ?? "Produto",
          categoria: produto?.categorias?.nome ?? "Sem categoria",
          quantidade: item.quantidade,
          precoUnitario: Number(item.preco_unitario),
          custoUnitario: Number(item.preco_unitario) * 0.45,
        };
      });

      return {
        id: pedido.id,
        numero: pedido.numero,
        data: pedido.created_at,
        canal: mapCanal(pedido.canal),
        pagamento: mapPagamento(pedido.forma_pagamento),
        status: mapStatus(pedido.status),
        clienteId: pedido.cliente_id ?? "anon",
        clienteNome: cliente?.nome ?? "Cliente",
        bairro: entrega?.bairro ?? extractBairro(pedido.observacoes),
        motoboyId: entrega?.motoboy_id ?? null,
        atendenteId: "staff",
        atendenteNome: "Equipe",
        mesa: pedido.mesa_id ? `Mesa` : null,
        tempoPreparo: 15,
        tempoEntrega: pedido.canal === "delivery" ? 25 : null,
        taxaEntrega: Number(pedido.taxa_entrega),
        subtotal: Number(pedido.subtotal),
        total: Number(pedido.total),
        custo: Number(pedido.subtotal) * 0.45,
        campanhaId: pedido.cupom_id,
        itens,
      };
    });

    const produtos = (produtosResult.data ?? []).map((produto) => {
      const categoria = produto.categorias as { nome: string } | null;
      return {
        id: produto.id,
        nome: produto.nome,
        categoria: categoria?.nome ?? "Sem categoria",
        preco: Number(produto.preco),
        custo: Number(produto.preco) * 0.45,
        estoque: produto.estoque ?? 0,
        estoqueMinimo: 5,
        tempoPreparo: produto.tempo_preparo_min,
        ativo: produto.ativo,
      };
    });

    const clientes = (clientesResult.data ?? []).map((cliente) => ({
      id: cliente.id,
      nome: cliente.nome,
      bairro: "",
      ultimoPedidoDias: 0,
      pontos: cliente.pontos_fidelidade,
      aniversarioMes: false,
    }));

    const financeiro = (financeiroResult.data ?? []).map((lancamento) => ({
      id: lancamento.id,
      data: lancamento.data,
      tipo: lancamento.tipo,
      categoria: lancamento.categoria ?? "Geral",
      descricao: lancamento.descricao,
      valor: Number(lancamento.valor),
      forma: lancamento.forma ?? "dinheiro",
    }));

    const notas = (notasResult.data ?? []).map(
      (nota: {
        id: string;
        created_at: string;
        tipo: string;
        status: string;
        valor: number;
        xml_enviado_contabilidade: boolean;
      }) => ({
        id: nota.id,
        data: nota.created_at,
        tipo: (nota.tipo === "NF-e" ? "NF-e" : "NFC-e") as "NFC-e" | "NF-e",
        status: (nota.status === "cancelada" ? "cancelada" : "emitida") as "emitida" | "cancelada",
        valor: Number(nota.valor),
        xmlEnviado: nota.xml_enviado_contabilidade,
      }),
    );

    const fallback = gerarDataset();

    const motoboyIds = [...new Set((motoboysResult.data ?? []).map((row) => row.user_id))];
    const motoboyProfiles =
      motoboyIds.length > 0
        ? await supabaseAdmin.from("profiles").select("id, nome").in("id", motoboyIds)
        : { data: [], error: null };
    if (motoboyProfiles.error) throw motoboyProfiles.error;

    const entregasByMotoboy = new Map<string, number>();
    for (const entrega of entregasResult.data ?? []) {
      if (!entrega.motoboy_id) continue;
      entregasByMotoboy.set(
        entrega.motoboy_id,
        (entregasByMotoboy.get(entrega.motoboy_id) ?? 0) + 1,
      );
    }

    const motoboys = (motoboyProfiles.data ?? []).map((profile) => ({
      id: profile.id,
      nome: profile.nome,
      entregas: entregasByMotoboy.get(profile.id) ?? 0,
      avaliacao: 4.8,
      tempoMedio: 24,
    }));

    const campanhas = (cuponsResult.data ?? []).map((cupom) => ({
      id: cupom.id,
      nome: cupom.codigo,
      canal: "whatsapp" as const,
      enviadas: cupom.usos_maximos ?? cupom.usos,
      entregues: cupom.usos,
      respondidas: cupom.usos,
      conversoes: cupom.usos,
      receita: Number(cupom.desconto_valor ?? 0) * cupom.usos,
    }));

    return {
      pedidos,
      produtos,
      clientes,
      motoboys: motoboys.length ? motoboys : fallback.motoboys,
      atendentes: fallback.atendentes,
      financeiro,
      notas,
      campanhas: campanhas.length ? campanhas : fallback.campanhas,
      caixas: fallback.caixas,
    };
  });
