import { QueroDeliveryClient, type QueroOrderEvent } from "@/lib/integrations/quero-delivery/quero-delivery.client";

type TenantIntegrationRow = {
  tenant_id: string;
  quero_delivery_enabled: boolean;
  quero_delivery_place_id: string | null;
  quero_delivery_api_token: string | null;
  quero_delivery_last_poll_at: string | null;
  quero_delivery_last_event_cursor: string | null;
};

async function logQueroSync(
  tenantId: string,
  level: "info" | "error",
  message: string,
  payload?: unknown,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("quero_delivery_sync_logs").insert({
    tenant_id: tenantId,
    level,
    message,
    payload: payload ? (payload as object) : null,
  });
}

export async function getTenantQueroIntegration(tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenant_integrations")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantIntegrationRow>();
  if (error) throw error;
  return data;
}

function normalizeOrdersPayload(payload: { orders?: QueroOrderEvent[] } | QueroOrderEvent[]) {
  if (Array.isArray(payload)) return payload;
  return payload.orders ?? [];
}

async function resolveProdutoId(
  tenantId: string,
  item: NonNullable<QueroOrderEvent["items"]>[number],
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const code = item.internalCode ?? item.productId;
  if (!code) return null;

  const { data: byId } = await supabaseAdmin
    .from("produtos")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", code)
    .maybeSingle();
  if (byId?.id) return byId.id;

  const { data: byBarcode } = await supabaseAdmin
    .from("produtos")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("codigo_barras", code)
    .maybeSingle();

  return byBarcode?.id ?? null;
}

async function ingestQueroOrder(tenantId: string, order: QueroOrderEvent) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const queroOrderId = String(order.id);

  const { data: existing } = await supabaseAdmin
    .from("quero_delivery_order_map")
    .select("id, pedido_id")
    .eq("tenant_id", tenantId)
    .eq("quero_order_id", queroOrderId)
    .maybeSingle();

  if (existing?.pedido_id) return { pedidoId: existing.pedido_id, created: false };

  const items = order.items ?? [];
  const pricedItems = [];
  for (const item of items) {
    const produtoId = await resolveProdutoId(tenantId, item);
    if (!produtoId) continue;
    pricedItems.push({
      produto_id: produtoId,
      quantidade: Number(item.quantity ?? 1),
      preco_unitario: Number(item.unitPrice ?? 0),
      nome: item.name ?? "Item Quero Delivery",
    });
  }

  if (!pricedItems.length) {
    await logQueroSync(tenantId, "error", `Pedido Quero ${queroOrderId} sem itens mapeados.`, order);
    throw new Error(`Pedido Quero ${queroOrderId} sem itens mapeados para produtos locais.`);
  }

  const subtotal = pricedItems.reduce(
    (sum, item) => sum + item.preco_unitario * item.quantidade,
    0,
  );
  const taxa = 0;
  const total = Number(order.payment?.total ?? subtotal + taxa);
  const customerName = order.customer?.name ?? "Cliente Quero Delivery";
  const phone = order.customer?.phone ?? "";
  const endereco = order.delivery?.address ?? "Endereco Quero Delivery";
  const bairro = order.delivery?.neighborhood ?? "Centro";

  const { data: pedido, error: pedidoError } = await supabaseAdmin
    .from("pedidos")
    .insert({
      tenant_id: tenantId,
      canal: "quero_delivery",
      status: "aberto",
      subtotal,
      total,
      taxa_entrega: taxa,
      endereco,
      forma_pagamento: "pix",
      observacoes: `quero_delivery|customer_name=${customerName}|phone=${phone}|bairro=${bairro}|quero_order_id=${queroOrderId}`,
    })
    .select("id, numero")
    .single();

  if (pedidoError) throw pedidoError;

  const pedidoItens = pricedItems.map((item) => ({
    pedido_id: pedido.id,
    tenant_id: tenantId,
    produto_id: item.produto_id,
    quantidade: item.quantidade,
    preco_unitario: item.preco_unitario,
    observacao: item.nome,
  }));

  const { error: itensError } = await supabaseAdmin.from("pedido_itens").insert(pedidoItens);
  if (itensError) throw itensError;

  const { ensureOperationalOrderRecords } = await import("@/lib/api/financeiro/mercado-pago.server");
  await ensureOperationalOrderRecords({
    id: pedido.id,
    numero: pedido.numero,
    endereco,
    bairro,
    taxa_entrega: taxa,
    total,
    forma_pagamento: "pix",
    tenant_id: tenantId,
  });

  await supabaseAdmin.from("quero_delivery_order_map").upsert({
    tenant_id: tenantId,
    quero_order_id: queroOrderId,
    pedido_id: pedido.id,
    last_status: order.status ?? order.eventType ?? "CREATED",
    updated_at: new Date().toISOString(),
  });

  return { pedidoId: pedido.id, created: true, numero: pedido.numero };
}

export async function pollQueroDeliveryForTenant(tenantId: string) {
  const integration = await getTenantQueroIntegration(tenantId);
  if (!integration?.quero_delivery_enabled) {
    return { imported: 0, skipped: true };
  }
  if (!integration.quero_delivery_place_id || !integration.quero_delivery_api_token) {
    throw new Error("Credenciais Quero Delivery incompletas para este restaurante.");
  }

  const client = new QueroDeliveryClient({
    placeId: integration.quero_delivery_place_id,
    apiToken: integration.quero_delivery_api_token,
  });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let imported = 0;
  let cursor = integration.quero_delivery_last_event_cursor;

  try {
    const poll = await client.pollOrderEvents(cursor);
    const events = poll.events ?? [];
    cursor = poll.lastEventId ?? cursor ?? null;

    for (const event of events) {
      if ((event.eventType ?? event.status ?? "CREATED") !== "CREATED") continue;
      const result = await ingestQueroOrder(tenantId, event);
      if (result.created) imported += 1;
      try {
        await client.acceptOrder(String(event.id));
      } catch (acceptError) {
        await logQueroSync(tenantId, "error", `Falha ao aceitar pedido Quero ${event.id}`, acceptError);
      }
    }

    if (events.length === 0) {
      const listed = await client.listOrders("CREATED");
      for (const order of normalizeOrdersPayload(listed)) {
        const result = await ingestQueroOrder(tenantId, order);
        if (result.created) imported += 1;
      }
    }

    await supabaseAdmin
      .from("tenant_integrations")
      .update({
        quero_delivery_last_poll_at: new Date().toISOString(),
        quero_delivery_last_event_cursor: cursor,
        quero_delivery_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);

    await logQueroSync(tenantId, "info", `Poll concluido. ${imported} pedido(s) importado(s).`);
    return { imported, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no poll Quero Delivery";
    await supabaseAdmin
      .from("tenant_integrations")
      .update({
        quero_delivery_last_poll_at: new Date().toISOString(),
        quero_delivery_last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);
    await logQueroSync(tenantId, "error", message, error);
    throw error;
  }
}

export async function syncQueroStatusForPedido(
  tenantId: string,
  pedidoId: string,
  pedidoStatus: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: mapRow } = await supabaseAdmin
    .from("quero_delivery_order_map")
    .select("quero_order_id")
    .eq("tenant_id", tenantId)
    .eq("pedido_id", pedidoId)
    .maybeSingle();

  if (!mapRow?.quero_order_id) return;

  const integration = await getTenantQueroIntegration(tenantId);
  if (!integration?.quero_delivery_place_id || !integration.quero_delivery_api_token) return;

  const client = new QueroDeliveryClient({
    placeId: integration.quero_delivery_place_id,
    apiToken: integration.quero_delivery_api_token,
  });

  const queroId = mapRow.quero_order_id;
  if (pedidoStatus === "em_entrega") {
    await client.dispatchOrder(queroId);
  } else if (pedidoStatus === "entregue") {
    await client.concludeOrder(queroId);
  }

  await supabaseAdmin
    .from("quero_delivery_order_map")
    .update({ last_status: pedidoStatus, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("quero_order_id", queroId);
}

export async function pollAllTenantsQueroDelivery() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenant_integrations")
    .select("tenant_id")
    .eq("quero_delivery_enabled", true);
  if (error) throw error;

  const results = [];
  for (const row of data ?? []) {
    results.push({
      tenantId: row.tenant_id,
      ...(await pollQueroDeliveryForTenant(row.tenant_id as string)),
    });
  }
  return results;
}
