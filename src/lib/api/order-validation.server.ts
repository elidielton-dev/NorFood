import { findSupportedNeighborhood, SERVICE_CITY_CONFIG } from "@/lib/city-config";

export type OrderItemInput = {
  produto_id: string;
  quantidade: number;
  preco_unitario?: number;
  variacao_id?: string | null;
  adicionais?: Array<{ id: string; quantidade: number }>;
};

export type ValidatedOrderItem = {
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  nome: string;
  observacao?: string | null;
};

export type CouponValidationResult = {
  cupom_id: string;
  codigo: string;
  desconto: number;
};

function normalizeNeighborhood(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export async function resolveDeliveryFeeFromDb(bairro: string, tenantId?: string) {
  const neighborhood = normalizeNeighborhood(bairro);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin
    .from("bairros_entrega")
    .select("taxa, ativo")
    .ilike("nome", neighborhood);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data: bairroRow, error } = await query.maybeSingle();

  if (!error && bairroRow?.ativo) {
    return Number(bairroRow.taxa);
  }

  const fallback = findSupportedNeighborhood(neighborhood);
  if (fallback) return fallback.deliveryFee;

  throw new Error(
    `Bairro "${bairro}" nao e atendido. Escolha um dos bairros de ${SERVICE_CITY_CONFIG.city}.`,
  );
}

export async function getOperationalConfig(tenantId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    resolveEffectiveLojaAberta,
    buildDefaultHorariosConfig,
    DEFAULT_HORARIOS,
    ensureFullWeek,
  } = await import("@/lib/horarios");

  let horariosConfig = buildDefaultHorariosConfig();
  let horarios = ensureFullWeek(DEFAULT_HORARIOS);
  try {
    const { fetchHorariosConfigFromDb, fetchHorariosFromDb } =
      await import("@/lib/api/horarios.server");
    const [horariosConfigResult, horariosResult] = await Promise.all([
      fetchHorariosConfigFromDb(tenantId),
      fetchHorariosFromDb(tenantId),
    ]);
    horariosConfig = horariosConfigResult.config;
    horarios = horariosResult.horarios;
  } catch {
    // Mantem defaults se horarios ainda nao estiverem no banco.
  }

  let configQuery = supabaseAdmin
    .from("config_operacional")
    .select("pedido_minimo, loja_aberta, valor_padrao_entrega, pontos_por_real");
  if (tenantId) configQuery = configQuery.eq("tenant_id", tenantId);
  else configQuery = configQuery.eq("id", "default");

  const { data, error } = await configQuery.maybeSingle();

  if (error || !data) {
    return {
      pedido_minimo: 0,
      loja_aberta: resolveEffectiveLojaAberta(horariosConfig, horarios),
      valor_padrao_entrega: SERVICE_CITY_CONFIG.defaultDeliveryFee,
      pontos_por_real: 1,
    };
  }

  return {
    pedido_minimo: Number(data.pedido_minimo),
    loja_aberta: resolveEffectiveLojaAberta(horariosConfig, horarios),
    valor_padrao_entrega: Number(data.valor_padrao_entrega),
    pontos_por_real: Number(data.pontos_por_real),
  };
}

export async function validateAndPriceOrderItems(
  itens: OrderItemInput[],
  options?: { checkStock?: boolean },
) {
  if (!itens.length) {
    throw new Error("O pedido precisa ter pelo menos 1 item.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const productIds = [...new Set(itens.map((item) => item.produto_id))];
  const variacaoIds = [
    ...new Set(itens.map((item) => item.variacao_id).filter(Boolean)),
  ] as string[];
  const adicionalIds = [
    ...new Set(itens.flatMap((item) => (item.adicionais ?? []).map((a) => a.id))),
  ];

  const [produtosResult, variacoesResult, adicionaisResult, promocoesResult] = await Promise.all([
    supabaseAdmin
      .from("produtos")
      .select("id, nome, preco, preco_promocional, ativo, estoque")
      .in("id", productIds),
    variacaoIds.length
      ? supabaseAdmin
          .from("produto_variacoes")
          .select("id, produto_id, nome, preco, estoque, status")
          .in("id", variacaoIds)
      : Promise.resolve({ data: [], error: null }),
    adicionalIds.length
      ? supabaseAdmin
          .from("produto_adicionais")
          .select("id, nome, preco, estoque, minimo, maximo")
          .in("id", adicionalIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("produto_promocoes")
      .select("produto_id, tipo, valor, ativa")
      .in("produto_id", productIds)
      .eq("ativa", true),
  ]);

  if (produtosResult.error) throw produtosResult.error;
  if (variacoesResult.error) throw variacoesResult.error;
  if (adicionaisResult.error) throw adicionaisResult.error;
  if (promocoesResult.error) throw promocoesResult.error;

  const productMap = new Map((produtosResult.data ?? []).map((produto) => [produto.id, produto]));
  const variacaoMap = new Map((variacoesResult.data ?? []).map((row) => [row.id, row]));
  const adicionalMap = new Map((adicionaisResult.data ?? []).map((row) => [row.id, row]));
  const promoMap = new Map((promocoesResult.data ?? []).map((row) => [row.produto_id, row]));

  const validated: ValidatedOrderItem[] = [];
  let subtotal = 0;

  for (const item of itens) {
    if (item.quantidade <= 0) {
      throw new Error("Quantidade invalida em um dos itens.");
    }

    const produto = productMap.get(item.produto_id);
    if (!produto) {
      throw new Error("Produto nao encontrado no cardapio.");
    }
    if (!produto.ativo) {
      throw new Error(`"${produto.nome}" nao esta disponivel no momento.`);
    }

    let unitPrice = Number(produto.preco);
    let itemLabel = produto.nome;
    const meta: Record<string, unknown> = {};

    if (item.variacao_id) {
      const variacao = variacaoMap.get(item.variacao_id);
      if (!variacao || variacao.produto_id !== produto.id) {
        throw new Error(`Variacao invalida para "${produto.nome}".`);
      }
      if (variacao.status !== "ativo") {
        throw new Error(`Variacao "${variacao.nome}" indisponivel.`);
      }
      if (options?.checkStock && variacao.estoque < item.quantidade) {
        throw new Error(`Estoque insuficiente para "${variacao.nome}".`);
      }
      unitPrice = Number(variacao.preco);
      itemLabel = `${produto.nome} (${variacao.nome})`;
      meta.variacao_id = variacao.id;
      meta.variacao_nome = variacao.nome;
    } else if (
      options?.checkStock &&
      produto.estoque != null &&
      produto.estoque < item.quantidade
    ) {
      throw new Error(
        `Estoque insuficiente para "${produto.nome}". Disponivel: ${produto.estoque}.`,
      );
    }

    if (produto.preco_promocional != null && Number(produto.preco_promocional) > 0) {
      unitPrice = Number(produto.preco_promocional);
      meta.preco_promocional = unitPrice;
    }

    const promo = promoMap.get(produto.id);
    if (promo && !item.variacao_id) {
      if (promo.tipo === "percentual") {
        unitPrice = unitPrice * (1 - Number(promo.valor) / 100);
      } else if (promo.tipo === "valor") {
        unitPrice = Math.max(0, unitPrice - Number(promo.valor));
      }
      meta.promocao_tipo = promo.tipo;
      meta.promocao_valor = Number(promo.valor);
    }

    const selectedAddons: Array<{ id: string; nome: string; quantidade: number; preco: number }> =
      [];
    for (const addonInput of item.adicionais ?? []) {
      if (addonInput.quantidade <= 0) continue;
      const adicional = adicionalMap.get(addonInput.id);
      if (!adicional) throw new Error("Adicional invalido no pedido.");
      if (addonInput.quantidade < adicional.minimo || addonInput.quantidade > adicional.maximo) {
        throw new Error(
          `Quantidade invalida para adicional "${adicional.nome}" (${adicional.minimo}-${adicional.maximo}).`,
        );
      }
      if (options?.checkStock && adicional.estoque < addonInput.quantidade * item.quantidade) {
        throw new Error(`Estoque insuficiente para adicional "${adicional.nome}".`);
      }
      unitPrice += Number(adicional.preco) * addonInput.quantidade;
      selectedAddons.push({
        id: adicional.id,
        nome: adicional.nome,
        quantidade: addonInput.quantidade,
        preco: Number(adicional.preco),
      });
    }
    if (selectedAddons.length) meta.adicionais = selectedAddons;

    unitPrice = Math.round(unitPrice * 100) / 100;

    validated.push({
      produto_id: produto.id,
      quantidade: item.quantidade,
      preco_unitario: unitPrice,
      nome: itemLabel,
      observacao: Object.keys(meta).length ? JSON.stringify(meta) : null,
    });
    subtotal += unitPrice * item.quantidade;
  }

  return { itens: validated, subtotal: Math.round(subtotal * 100) / 100 };
}

export async function validateCoupon(
  codigo: string,
  subtotal: number,
  tenantId?: string,
): Promise<CouponValidationResult | null> {
  const normalized = codigo.trim().toUpperCase();
  if (!normalized) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin.from("cupons").select("*").eq("codigo", normalized);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data: cupom, error } = await query.maybeSingle();
  if (error) throw error;
  if (!cupom) throw new Error("Cupom invalido ou inexistente.");
  if (!cupom.ativo) throw new Error("Este cupom nao esta mais ativo.");
  if (cupom.valido_ate && new Date(cupom.valido_ate).getTime() < Date.now()) {
    throw new Error("Este cupom expirou.");
  }
  if (cupom.usos_maximos != null && cupom.usos >= cupom.usos_maximos) {
    throw new Error("Este cupom atingiu o limite de usos.");
  }

  let desconto = 0;
  if (cupom.desconto_percentual) {
    desconto = (subtotal * Number(cupom.desconto_percentual)) / 100;
  } else if (cupom.desconto_valor) {
    desconto = Number(cupom.desconto_valor);
  }

  desconto = Math.min(desconto, subtotal);
  if (desconto <= 0) {
    throw new Error("Cupom sem desconto aplicavel para este pedido.");
  }

  return {
    cupom_id: cupom.id,
    codigo: cupom.codigo,
    desconto: Math.round(desconto * 100) / 100,
  };
}

export async function incrementCouponUsage(cupomId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: cupom, error: selectError } = await supabaseAdmin
    .from("cupons")
    .select("usos")
    .eq("id", cupomId)
    .single();
  if (selectError) throw selectError;

  const { error } = await supabaseAdmin
    .from("cupons")
    .update({ usos: Number(cupom.usos) + 1 })
    .eq("id", cupomId);
  if (error) throw error;
}
