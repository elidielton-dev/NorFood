import { tryInsertNotification } from "./notifications";
import { getCurrentUser, requireSupabase } from "./supabase";
import { isDeliveredQueueConflict } from "./utils";

export async function acceptRiderDelivery(deliveryId: string) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const { error } = await supabase.rpc("motoboy_accept_entrega", {
    _entrega_id: deliveryId,
  });
  if (error) throw error;

  await tryInsertNotification(
    user.id,
    "Nova entrega assumida",
    "A entrega entrou na sua rota.",
    "delivery_assigned",
    deliveryId,
  );
}

export async function advanceRiderDelivery(deliveryId: string, step: string) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const { error } = await supabase.rpc("motoboy_avancar_entrega", {
    _entrega_id: deliveryId,
    _stage: step,
  });
  if (error) {
    const missingRpc =
      error.code === "PGRST202" ||
      String(error.message ?? "").includes("Could not find the function");
    if (missingRpc) {
      await advanceRiderDeliveryFallback(deliveryId, step);
    } else if (step === "delivered" && isDeliveredQueueConflict(error)) {
      await repairDeliveredQueueAndFinalizeDelivery(deliveryId);
    } else {
      throw error;
    }
  }

  await tryInsertNotification(
    user.id,
    "Entrega atualizada",
    `Etapa atual: ${step}.`,
    "delivery_progress",
    deliveryId,
  );
}

async function advanceRiderDeliveryFallback(deliveryId: string, step: string) {
  const supabase = requireSupabase();
  const stageMap: Record<
    string,
    { entrega: string; rota: string; pedido: string | null }
  > = {
    assigned: { entrega: "aceito", rota: "pendente", pedido: null },
    arrived_store: { entrega: "na_loja", rota: "na_loja", pedido: null },
    picked_up: { entrega: "pedido_retirado", rota: "em_rota", pedido: "em_entrega" },
    arrived_customer: { entrega: "chegou_cliente", rota: "chegando", pedido: "em_entrega" },
    delivered: { entrega: "entregue", rota: "entregue", pedido: "entregue" },
  };
  const mapped = stageMap[step];
  if (!mapped) throw new Error(`invalid_stage: ${step}`);

  const { data: entrega, error: selectError } = await supabase
    .from("entregas")
    .select("id, pedido_id, saiu_em")
    .eq("id", deliveryId)
    .single();
  if (selectError) throw selectError;

  const entregaUpdate: Record<string, string> = {
    status: mapped.entrega,
    updated_at: new Date().toISOString(),
    saiu_em: entrega.saiu_em ?? new Date().toISOString(),
  };
  if (step === "delivered") entregaUpdate.entregue_em = new Date().toISOString();

  const { error: entregaError } = await supabase.from("entregas").update(entregaUpdate).eq("id", deliveryId);
  if (entregaError) throw entregaError;

  const { error: rotaError } = await supabase
    .from("rotas_entrega")
    .update({ status: mapped.rota })
    .eq("pedido_id", entrega.pedido_id);
  if (rotaError) throw rotaError;

  if (mapped.pedido) {
    const { error: pedidoError } = await supabase
      .from("pedidos")
      .update({ status: mapped.pedido, updated_at: new Date().toISOString() })
      .eq("id", entrega.pedido_id);
    if (pedidoError) throw pedidoError;
  }
}

async function repairDeliveredQueueAndFinalizeDelivery(deliveryId: string) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const deliveredAt = new Date().toISOString();

  const { data: delivery, error: deliveryError } = await supabase
    .from("entregas")
    .select("id, pedido_id, motoboy_id")
    .eq("id", deliveryId)
    .single<{ id: string; pedido_id: string; motoboy_id: string | null }>();
  if (deliveryError) throw deliveryError;

  const riderId = delivery.motoboy_id ?? user.id;

  const { data: deliveredRoutes, error: deliveredRoutesError } = await supabase
    .from("rotas_entrega")
    .select("pedido_id, ordem_entrega")
    .eq("entregador_id", riderId)
    .eq("status", "entregue")
    .neq("pedido_id", delivery.pedido_id)
    .order("ordem_entrega", { ascending: true });
  if (deliveredRoutesError) throw deliveredRoutesError;

  const routes = deliveredRoutes ?? [];
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    const normalizedOrder = 1001 + index;
    if (Number(route.ordem_entrega) === normalizedOrder) continue;

    const { error } = await supabase
      .from("rotas_entrega")
      .update({ ordem_entrega: normalizedOrder })
      .eq("pedido_id", route.pedido_id)
      .eq("entregador_id", riderId);
    if (error) throw error;
  }

  const nextDeliveredOrder = 1001 + routes.length;

  const { error: routeError } = await supabase
    .from("rotas_entrega")
    .update({
      status: "entregue",
      ordem_entrega: nextDeliveredOrder,
    })
    .eq("pedido_id", delivery.pedido_id)
    .eq("entregador_id", riderId);
  if (routeError) throw routeError;

  const { error: orderError } = await supabase
    .from("pedidos")
    .update({
      status: "entregue",
      updated_at: deliveredAt,
    })
    .eq("id", delivery.pedido_id);
  if (orderError) throw orderError;

  const { error: finalizeDeliveryError } = await supabase
    .from("entregas")
    .update({
      status: "entregue",
      entregue_em: deliveredAt,
      updated_at: deliveredAt,
    })
    .eq("id", deliveryId);
  if (finalizeDeliveryError) throw finalizeDeliveryError;
}
