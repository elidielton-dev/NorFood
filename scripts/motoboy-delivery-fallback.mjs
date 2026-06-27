/** Fallback quando RPC motoboy_avancar_entrega não existe no Supabase (produção). */

export function isMissingRpc(error) {
  if (!error) return false;
  return error.code === "PGRST202" || String(error.message ?? "").includes("Could not find the function");
}

const STAGE_MAP = {
  assigned: { entrega: "aceito", rota: "pendente", pedido: null },
  arrived_store: { entrega: "na_loja", rota: "na_loja", pedido: null },
  picked_up: { entrega: "pedido_retirado", rota: "em_rota", pedido: "em_entrega" },
  arrived_customer: { entrega: "chegou_cliente", rota: "chegando", pedido: "em_entrega" },
  delivered: { entrega: "entregue", rota: "entregue", pedido: "entregue" },
};

function isPedidoStatusCastError(error) {
  if (!error) return false;
  const message = String(error.message ?? error);
  return message.includes("pedido_status") && message.includes("text");
}

export async function advanceMotoboyDelivery(client, deliveryId, stage, adminClient = null) {
  const { error: rpcError } = await client.rpc("motoboy_avancar_entrega", {
    _entrega_id: deliveryId,
    _stage: stage,
  });
  if (!rpcError) return { via: "rpc" };
  if (!isMissingRpc(rpcError) && !isPedidoStatusCastError(rpcError)) throw rpcError;

  const fallbackClient = isPedidoStatusCastError(rpcError) && adminClient ? adminClient : client;
  const mapped = STAGE_MAP[stage];
  if (!mapped) throw new Error(`invalid_stage: ${stage}`);

  const { data: entrega, error: selectError } = await fallbackClient
    .from("entregas")
    .select("id, pedido_id, motoboy_id, saiu_em")
    .eq("id", deliveryId)
    .single();
  if (selectError) throw selectError;

  const entregaUpdate = {
    status: mapped.entrega,
    updated_at: new Date().toISOString(),
    saiu_em: entrega.saiu_em ?? new Date().toISOString(),
  };
  if (stage === "delivered") {
    entregaUpdate.entregue_em = new Date().toISOString();
  }

  const { error: entregaError } = await fallbackClient
    .from("entregas")
    .update(entregaUpdate)
    .eq("id", deliveryId);
  if (entregaError) throw entregaError;

  const { error: rotaError } = await fallbackClient
    .from("rotas_entrega")
    .update({ status: mapped.rota })
    .eq("pedido_id", entrega.pedido_id);
  if (rotaError) throw rotaError;

  if (mapped.pedido) {
    const { error: pedidoError } = await fallbackClient
      .from("pedidos")
      .update({ status: mapped.pedido, updated_at: new Date().toISOString() })
      .eq("id", entrega.pedido_id);
    if (pedidoError) throw pedidoError;
  }

  return {
    via: isPedidoStatusCastError(rpcError) ? "admin_fallback_pedido_status_cast" : "fallback",
  };
}
