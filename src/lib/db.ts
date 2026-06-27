/**
 * Helpers de acesso ao banco. Centraliza chamadas mais usadas na operacao.
 * Tudo passa por RLS - chamadas autenticadas respeitam o papel do usuario.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import { expirePendingMercadoPagoOrders } from "@/lib/api/mercado-pago.functions";
import { getCityLabel } from "@/lib/city-config";
import { fetchDemoSync } from "@/lib/demo-sync-client";
import { demoStore } from "@/lib/demo-store";
import { isBrowserDemoEnabled } from "@/lib/runtime";
import { withTenantId } from "@/lib/tenant/query-filter";

export type Categoria = {
  id: string;
  nome: string;
  emoji: string | null;
  ordem: number;
  ativo: boolean;
};
export type Produto = {
  id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number;
  imagem_url: string | null;
  tempo_preparo_min: number;
  calorias: number | null;
  destaque: boolean;
  ativo: boolean;
};
export type PedidoStatus =
  | "aberto"
  | "em_preparo"
  | "pronto"
  | "em_entrega"
  | "entregue"
  | "cancelado";
export type PedidoCanal = "mesa" | "balcao" | "delivery" | "qrcode" | "ifood";
type FormaPagamento = Enums<"forma_pagamento">;
type MesaStatus = Enums<"mesa_status">;
export type Pedido = {
  id: string;
  numero: number;
  canal: PedidoCanal;
  status: PedidoStatus;
  total: number;
  subtotal: number;
  desconto: number;
  taxa_entrega: number;
  mesa_id: string | null;
  cliente_id: string | null;
  forma_pagamento: string | null;
  troco_para?: number | null;
  endereco: string | null;
  observacoes: string | null;
  bairro?: string | null;
  created_at: string;
};

export function getOrderMetadataValue(observacoes: string | null | undefined, key: string) {
  if (!observacoes) return null;
  const regex = new RegExp(`${key}=([^;]+)`, "i");
  return observacoes.match(regex)?.[1]?.trim() ?? null;
}

/** Bairro do pedido para exibicao no KDS/painel (nunca a rua). */
export function getOrderNeighborhood(
  pedido: Pick<Pedido, "endereco" | "observacoes" | "bairro">,
  entregaBairro?: string | null,
) {
  if (pedido.bairro?.trim()) return pedido.bairro.trim();
  const fromObservacoes = getOrderMetadataValue(pedido.observacoes, "bairro");
  if (fromObservacoes) return fromObservacoes;
  if (entregaBairro?.trim()) return entregaBairro.trim();
  if (!pedido.endereco) return "Retirada no local";
  return "Bairro nao informado";
}

export function getMercadoPagoPaymentStatusFromOrder(
  order: Pick<Pedido, "observacoes"> | null | undefined,
) {
  return getOrderMetadataValue(order?.observacoes, "mp_status");
}

export function getMercadoPagoCheckoutUrlFromOrder(
  order: Pick<Pedido, "observacoes"> | null | undefined,
) {
  return getOrderMetadataValue(order?.observacoes, "mp_checkout_url");
}

export function getMercadoPagoPixQrCodeFromOrder(
  order: Pick<Pedido, "observacoes"> | null | undefined,
) {
  return getOrderMetadataValue(order?.observacoes, "mp_pix_qr_code");
}

export function getMercadoPagoPixQrCodeBase64FromOrder(
  order: Pick<Pedido, "observacoes"> | null | undefined,
) {
  return getOrderMetadataValue(order?.observacoes, "mp_pix_qr_code_base64");
}

export function getMercadoPagoTicketUrlFromOrder(
  order: Pick<Pedido, "observacoes"> | null | undefined,
) {
  return getOrderMetadataValue(order?.observacoes, "mp_ticket_url");
}

export function getOrderPaymentModeFromOrder(
  order: Pick<Pedido, "observacoes"> | null | undefined,
) {
  return getOrderMetadataValue(order?.observacoes, "payment_mode");
}

export function hasPendingMercadoPagoPayment(
  order: Pick<Pedido, "observacoes"> | null | undefined,
) {
  return getMercadoPagoPaymentStatusFromOrder(order) === "pending";
}
export type PedidoItem = {
  id: string;
  pedido_id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  observacao: string | null;
  produtos?: { nome: string; imagem_url?: string | null } | null;
};
export type Mesa = {
  id: string;
  numero: number;
  capacidade: number;
  status: "livre" | "ocupada" | "fechando" | "reservada";
  qrcode_token: string;
};
export type Entrega = {
  id: string;
  pedido_id: string;
  motoboy_id: string | null;
  status: string;
  endereco: string;
  bairro: string | null;
  distancia_km: number | null;
  taxa: number;
  saiu_em: string | null;
  entregue_em: string | null;
};
export type EntregaLifecycleStage =
  | "assigned"
  | "arrived_store"
  | "picked_up"
  | "arrived_customer"
  | "delivered";
export type LancamentoFinanceiro = {
  id: string;
  tipo: "entrada" | "saida";
  descricao: string;
  categoria: string | null;
  valor: number;
  forma: string | null;
  pedido_id: string | null;
  data: string;
  created_at: string;
};
export type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  email?: string | null;
  pontos_fidelidade: number;
  created_at: string;
  updated_at: string;
};
export type Cupom = {
  id: string;
  codigo: string;
  descricao: string | null;
  desconto_percentual: number | null;
  desconto_valor: number | null;
  valido_ate: string | null;
  ativo: boolean;
  usos: number;
  usos_maximos: number | null;
  created_at: string;
};

export const formatBRL = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function isDemo() {
  return isBrowserDemoEnabled();
}

function isMissingRpc(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "PGRST202" || error.message?.includes("Could not find the function") === true
  );
}

function isDeliveredQueueConflict(
  error: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
  } | null,
) {
  if (!error) return false;
  return (
    error.code === "23505" &&
    `${error.message ?? ""} ${error.details ?? ""}`.includes(
      "rotas_entrega_entregador_id_ordem_entrega_key",
    )
  );
}

async function repairDeliveredQueueAndFinalizeEntrega(entregaId: string) {
  const deliveredAt = new Date().toISOString();

  const { data: entrega, error: selectError } = await supabase
    .from("entregas")
    .select("id, pedido_id, motoboy_id")
    .eq("id", entregaId)
    .single<{ id: string; pedido_id: string; motoboy_id: string | null }>();
  if (selectError) throw selectError;

  const { data: user } = await supabase.auth.getUser();
  const riderId = entrega.motoboy_id ?? user.user?.id;
  if (!riderId) {
    throw new Error("Entregador nao identificado para concluir a entrega.");
  }

  const { data: deliveredRoutes, error: deliveredRoutesError } = await supabase
    .from("rotas_entrega")
    .select("pedido_id, ordem_entrega")
    .eq("entregador_id", riderId)
    .eq("status", "entregue")
    .neq("pedido_id", entrega.pedido_id)
    .order("ordem_entrega", { ascending: true });
  if (deliveredRoutesError) throw deliveredRoutesError;

  for (const [index, route] of (deliveredRoutes ?? []).entries()) {
    const normalizedOrder = 1001 + index;
    if (Number(route.ordem_entrega) === normalizedOrder) continue;

    const { error } = await supabase
      .from("rotas_entrega")
      .update({ ordem_entrega: normalizedOrder })
      .eq("pedido_id", route.pedido_id)
      .eq("entregador_id", riderId);
    if (error) throw error;
  }

  const nextDeliveredOrder = 1001 + (deliveredRoutes?.length ?? 0);

  const { error: routeError } = await supabase
    .from("rotas_entrega")
    .update({
      status: "entregue",
      ordem_entrega: nextDeliveredOrder,
    })
    .eq("pedido_id", entrega.pedido_id)
    .eq("entregador_id", riderId);
  if (routeError) throw routeError;

  const { error: pedidoError } = await supabase
    .from("pedidos")
    .update({
      status: "entregue",
      updated_at: deliveredAt,
    })
    .eq("id", entrega.pedido_id);
  if (pedidoError) throw pedidoError;

  const { error: entregaError } = await supabase
    .from("entregas")
    .update({
      status: "entregue",
      entregue_em: deliveredAt,
      updated_at: deliveredAt,
    })
    .eq("id", entregaId);
  if (entregaError) throw entregaError;
}

export async function listarProdutos(): Promise<Produto[]> {
  if (isDemo()) {
    try {
      const data = await fetchDemoSync<{ categorias: Categoria[]; produtos: Produto[] }>(
        "/demo/catalog",
      );
      return data.produtos;
    } catch {
      return (await demoStore.listProdutos()) as Produto[];
    }
  }
  const { data, error } = await withTenantId(
    supabase.from("produtos").select("*").order("destaque", { ascending: false }).order("nome"),
  );
  if (error) throw error;
  return data as Produto[];
}

export async function listarCategorias(): Promise<Categoria[]> {
  if (isDemo()) {
    try {
      const data = await fetchDemoSync<{ categorias: Categoria[]; produtos: Produto[] }>(
        "/demo/catalog",
      );
      return data.categorias;
    } catch {
      return (await demoStore.listCategorias()) as Categoria[];
    }
  }
  const { data, error } = await withTenantId(supabase.from("categorias").select("*").order("ordem"));
  if (error) throw error;
  return data as Categoria[];
}

export async function listarMesas(): Promise<Mesa[]> {
  if (isDemo()) {
    try {
      return await fetchDemoSync<Mesa[]>("/demo/mesas");
    } catch {
      return (await demoStore.listMesas()) as Mesa[];
    }
  }
  const { data, error } = await withTenantId(supabase.from("mesas").select("*").order("numero"));
  if (error) throw error;
  return data as Mesa[];
}

export async function listarPedidos(): Promise<Pedido[]> {
  if (isDemo()) {
    try {
      return await fetchDemoSync<Pedido[]>("/demo/pedidos");
    } catch {
      return (await demoStore.listPedidos()) as Pedido[];
    }
  }

  try {
    await expirePendingMercadoPagoOrders();
  } catch {
    // Best effort: if the sync fails, we still return the current orders.
  }

  const { data, error } = await withTenantId(
    supabase.from("pedidos").select("*").order("created_at", { ascending: false }).limit(100),
  );
  if (error) throw error;
  return data as Pedido[];
}

export async function itensDoPedido(pedidoId: string): Promise<PedidoItem[]> {
  if (isDemo()) {
    try {
      return await fetchDemoSync<PedidoItem[]>(
        `/demo/pedido-itens?pedidoId=${encodeURIComponent(pedidoId)}`,
      );
    } catch {
      return (await demoStore.listPedidoItens(pedidoId)) as PedidoItem[];
    }
  }
  const { data, error } = await supabase
    .from("pedido_itens")
    .select("*, produtos(nome)")
    .eq("pedido_id", pedidoId);
  if (error) throw error;
  return data as PedidoItem[];
}

export async function listarEntregas(): Promise<Entrega[]> {
  if (isDemo()) {
    try {
      return await fetchDemoSync<Entrega[]>("/demo/entregas");
    } catch {
      return (await demoStore.listEntregas()) as Entrega[];
    }
  }
  const { data, error } = await withTenantId(
    supabase.from("entregas").select("*").order("created_at", { ascending: false }).limit(100),
  );
  if (error) throw error;
  return data as Entrega[];
}

export async function listarLancamentosFinanceiros(): Promise<LancamentoFinanceiro[]> {
  if (isDemo()) {
    try {
      return await fetchDemoSync<LancamentoFinanceiro[]>("/demo/financeiro");
    } catch {
      return (await demoStore.listLancamentos()) as LancamentoFinanceiro[];
    }
  }
  const { data, error } = await withTenantId(
    supabase
      .from("lancamentos_financeiros")
      .select("*")
      .order("data", { ascending: false })
      .limit(100),
  );
  if (error) throw error;
  return data;
}

export async function criarLancamentoFinanceiro(payload: {
  tipo: "entrada" | "saida";
  descricao: string;
  valor: number;
  categoria?: string | null;
  forma?: "dinheiro" | "pix" | "credito" | "debito" | "vale" | "online" | null;
}) {
  if (isDemo()) {
    try {
      return await fetchDemoSync("/demo/lancamentos", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch {
      return await demoStore.createLancamento(payload);
    }
  }
  const { error } = await supabase.from("lancamentos_financeiros").insert(payload);
  if (error) throw error;
}

export async function listarClientes(): Promise<Cliente[]> {
  if (isDemo()) {
    try {
      return await fetchDemoSync<Cliente[]>("/demo/clientes");
    } catch {
      return (await demoStore.listClientes()) as Cliente[];
    }
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("pontos_fidelidade", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listarCupons(): Promise<Cupom[]> {
  if (isDemo()) {
    try {
      return await fetchDemoSync<Cupom[]>("/demo/cupons");
    } catch {
      return (await demoStore.listCupons()) as Cupom[];
    }
  }
  const { data, error } = await withTenantId(
    supabase.from("cupons").select("*").order("created_at", { ascending: false }),
  );
  if (error) throw error;
  return data;
}

export async function criarCupom(payload: {
  codigo: string;
  desconto_percentual?: number | null;
  desconto_valor?: number | null;
  descricao?: string | null;
  valido_ate?: string | null;
  usos_maximos?: number | null;
}) {
  if (isDemo()) {
    try {
      return await fetchDemoSync("/demo/cupons", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch {
      return await demoStore.createCupom(payload);
    }
  }
  const { error } = await supabase.from("cupons").insert({
    codigo: payload.codigo,
    desconto_percentual: payload.desconto_percentual ?? null,
    desconto_valor: payload.desconto_valor ?? null,
    descricao: payload.descricao ?? payload.codigo,
    valido_ate: payload.valido_ate ?? null,
    usos_maximos: payload.usos_maximos ?? null,
    ativo: true,
  });
  if (error) throw error;
}

export async function criarProduto(payload: { nome: string; preco: number }) {
  if (isDemo()) {
    try {
      return await fetchDemoSync("/demo/produtos", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch {
      return await demoStore.createProduto(payload);
    }
  }
  const { error } = await supabase.from("produtos").insert(payload);
  if (error) throw error;
}

export async function toggleProdutoAtivo(id: string, ativo: boolean) {
  if (isDemo()) {
    try {
      return await fetchDemoSync(`/demo/produtos/${id}/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ ativo }),
      });
    } catch {
      return await demoStore.toggleProdutoAtivo(id, ativo);
    }
  }
  const { error } = await supabase.from("produtos").update({ ativo: !ativo }).eq("id", id);
  if (error) throw error;
}

export async function atualizarStatusMesa(id: string, status: Mesa["status"]) {
  if (isDemo()) {
    try {
      return await fetchDemoSync(`/demo/mesas/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch {
      return await demoStore.updateMesaStatus(id, status);
    }
  }
  const { error } = await supabase
    .from("mesas")
    .update({ status: status as MesaStatus })
    .eq("id", id);
  if (error) throw error;
}

export async function aceitarEntrega(id: string) {
  if (isDemo()) {
    try {
      return await fetchDemoSync(`/demo/entregas/${id}/accept`, {
        method: "PATCH",
        body: JSON.stringify({ riderId: "demo-motoboy" }),
      });
    } catch {
      return await demoStore.acceptEntrega(id);
    }
  }
  const { error: rpcError } = await supabase.rpc("motoboy_accept_entrega" as never, {
    _entrega_id: id,
  });
  if (!rpcError) return;
  if (!isMissingRpc(rpcError)) throw rpcError;

  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("entregas")
    .update({
      motoboy_id: user.user!.id,
      status: "aceito",
      saiu_em: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function atualizarEtapaEntrega(id: string, stage: EntregaLifecycleStage) {
  if (isDemo()) {
    return await fetchDemoSync(`/demo/entregas/${id}/advance`, {
      method: "PATCH",
      body: JSON.stringify({ step: stage }),
    });
  }

  const { error: rpcError } = await supabase.rpc("motoboy_avancar_entrega" as never, {
    _entrega_id: id,
    _stage: stage,
  });
  if (!rpcError) return;
  if (stage === "delivered" && isDeliveredQueueConflict(rpcError)) {
    await repairDeliveredQueueAndFinalizeEntrega(id);
    return;
  }
  if (!isMissingRpc(rpcError)) throw rpcError;

  const statusMap: Record<
    EntregaLifecycleStage,
    { status: string; pedidoStatus?: PedidoStatus; entregue?: boolean }
  > = {
    assigned: { status: "aceito" },
    arrived_store: { status: "na_loja" },
    picked_up: { status: "pedido_retirado", pedidoStatus: "em_entrega" },
    arrived_customer: { status: "chegou_cliente", pedidoStatus: "em_entrega" },
    delivered: { status: "entregue", pedidoStatus: "entregue", entregue: true },
  };

  const mapped = statusMap[stage];
  const { data: entrega, error: selectError } = await supabase
    .from("entregas")
    .select("id, pedido_id")
    .eq("id", id)
    .single();
  if (selectError) throw selectError;

  const updatePayload: {
    status: string;
    entregue_em?: string;
  } = {
    status: mapped.status,
  };
  if (mapped.entregue) {
    updatePayload.entregue_em = new Date().toISOString();
  }

  const { error } = await supabase.from("entregas").update(updatePayload).eq("id", id);
  if (error) throw error;

  const rotaStatusMap: Partial<Record<EntregaLifecycleStage, string>> = {
    arrived_store: "na_loja",
    picked_up: "em_rota",
    arrived_customer: "chegando",
    delivered: "entregue",
  };
  const rotaStatus = rotaStatusMap[stage];
  if (rotaStatus) {
    await supabase.from("rotas_entrega").update({ status: rotaStatus }).eq("pedido_id", entrega.pedido_id);
  }

  if (mapped.pedidoStatus) {
    await mudarStatusPedido(entrega.pedido_id, mapped.pedidoStatus);
  }
}

export async function atualizarLocalizacaoEntregador(payload: {
  entregador_id: string;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  battery?: number | null;
  status?: string;
}) {
  if (isDemo()) {
    return payload;
  }

  const { error } = await supabase.from("entregadores_localizacao").upsert(
    {
      entregador_id: payload.entregador_id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed ?? null,
      heading: payload.heading ?? null,
      accuracy: payload.accuracy ?? null,
      battery: payload.battery ?? null,
      status: payload.status ?? "online",
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "entregador_id",
    },
  );
  if (error) throw error;
}

export async function concluirEntrega(id: string) {
  if (isDemo()) {
    try {
      return await fetchDemoSync(`/demo/entregas/${id}/conclude`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
    } catch {
      return await demoStore.concludeEntrega(id);
    }
  }
  await atualizarEtapaEntrega(id, "delivered");
}

/** Cria pedido + itens transacionalmente (com fallback simples se falhar). */
export async function criarPedido(opts: {
  canal: PedidoCanal;
  mesa_id?: string | null;
  itens: { produto_id: string; quantidade: number; preco_unitario: number }[];
  forma_pagamento?: string | null;
  troco_para?: number | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  cliente_id?: string | null;
  reference?: string | null;
  taxa_entrega?: number | null;
  observacoes?: string | null;
}) {
  if (isDemo()) {
    try {
      return await fetchDemoSync<Pedido>("/demo/pedidos", {
        method: "POST",
        body: JSON.stringify({
          ...opts,
          cliente_id: opts.cliente_id ?? null,
          customerName: opts.customerName ?? "Cliente delivery",
          customerPhone: opts.customerPhone ?? "(11) 99999-0000",
          customerEmail: opts.customerEmail ?? null,
          bairro: opts.bairro ?? "Raio local",
          city: opts.cidade ?? getCityLabel(),
          reference: opts.reference ?? "Pedido criado via app web",
        }),
      });
    } catch {
      return (await demoStore.createPedido(opts)) as Pedido;
    }
  }
  const subtotal = opts.itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
  const taxaEntrega = opts.canal === "delivery" ? Number(opts.taxa_entrega ?? 5) : 0;
  const { data: pedido, error } = await supabase
    .from("pedidos")
    .insert({
      canal: opts.canal,
      cliente_id: opts.cliente_id ?? null,
      mesa_id: opts.mesa_id ?? null,
      subtotal,
      taxa_entrega: taxaEntrega,
      total: subtotal + taxaEntrega,
      forma_pagamento: (opts.forma_pagamento ?? null) as FormaPagamento | null,
      troco_para: opts.troco_para ?? null,
      endereco: opts.endereco ?? null,
      observacoes: opts.observacoes ?? null,
    })

    .select()
    .single();
  if (error) throw error;
  const { error: e2 } = await supabase
    .from("pedido_itens")
    .insert(opts.itens.map((i) => ({ ...i, pedido_id: pedido.id })));
  if (e2) throw e2;
  if (opts.mesa_id) {
    await supabase.from("mesas").update({ status: "ocupada" }).eq("id", opts.mesa_id);
  }
  if (opts.canal === "delivery") {
    await supabase.from("entregas").insert({
      pedido_id: pedido.id,
      endereco: opts.endereco ?? "Endereco nao informado",
      bairro: opts.bairro ?? "Raio local",
      taxa: taxaEntrega,
      status: "pendente",
    });
  } else {
    await supabase.from("lancamentos_financeiros").insert({
      tipo: "entrada",
      descricao: `Pedido #${pedido.numero}`,
      categoria: `Vendas ${opts.canal}`,
      valor: subtotal + taxaEntrega,
      forma: (opts.forma_pagamento ?? null) as FormaPagamento | null,
      pedido_id: pedido.id,
    });
  }
  return pedido as Pedido;
}

export async function mudarStatusPedido(id: string, status: PedidoStatus) {
  if (isDemo()) {
    try {
      return await fetchDemoSync(`/demo/pedidos/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch {
      return await demoStore.updatePedidoStatus(id, status);
    }
  }
  const { error } = await supabase.from("pedidos").update({ status }).eq("id", id);
  if (error) throw error;
}
