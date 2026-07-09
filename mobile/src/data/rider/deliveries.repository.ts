import type { DeliveryOrder } from "../../types";
import {
  MOTOBOY_MENSAGENS_TABLE,
  MOTOBOY_NOTIFICACOES_TABLE,
  MOTOBOY_OCORRENCIAS_TABLE,
} from "./constants";
import { mapDeliveryRow } from "./mappers";
import { requireSupabase } from "./supabase";
import type { DeliveryRow, ItemRow, OrderRow, ProfileRow, RouteRow } from "./types";

export async function fetchRiderSatelliteRows(
  riderId: string,
  tenantId: string,
  table:
    | typeof MOTOBOY_OCORRENCIAS_TABLE
    | typeof MOTOBOY_MENSAGENS_TABLE
    | typeof MOTOBOY_NOTIFICACOES_TABLE,
) {
  const supabase = requireSupabase();
  const scoped = await supabase
    .from(table)
    .select("*")
    .eq("rider_id", riderId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(table === MOTOBOY_NOTIFICACOES_TABLE ? 50 : 30);

  if (!scoped.error) return scoped;

  return supabase
    .from(table)
    .select("*")
    .eq("rider_id", riderId)
    .order("created_at", { ascending: false })
    .limit(table === MOTOBOY_NOTIFICACOES_TABLE ? 50 : 30);
}

export async function fetchDeliveries(riderId: string, tenantId: string) {
  const supabase = requireSupabase();
  const { data: deliveryRows, error } = await supabase
    .from("entregas")
    .select("*")
    .eq("tenant_id", tenantId)
    .or(`motoboy_id.eq.${riderId},and(motoboy_id.is.null,status.eq.pendente)`)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<DeliveryRow[]>();
  if (error) {
    return { data: [] as DeliveryOrder[], error };
  }

  const pedidoIds = Array.from(new Set((deliveryRows ?? []).map((item) => item.pedido_id)));
  const assignedPedidoIds = Array.from(
    new Set(
      (deliveryRows ?? [])
        .filter((item) => item.motoboy_id === riderId)
        .map((item) => item.pedido_id),
    ),
  );
  const customerIds = new Set<string>();

  const [
    { data: orders, error: ordersError },
    { data: routes, error: routesError },
    { data: items, error: itemsError },
  ] = await Promise.all([
    pedidoIds.length
      ? supabase
          .from("pedidos")
          .select(
            "id, numero, cliente_id, status, endereco, observacoes, previsao_entrega, distancia_restante, latitude_cliente, longitude_cliente, ordem_na_rota, created_at",
          )
          .in("id", pedidoIds)
          .returns<OrderRow[]>()
      : Promise.resolve({ data: [] as OrderRow[], error: null }),
    assignedPedidoIds.length
      ? supabase
          .from("rotas_entrega")
          .select("pedido_id, ordem_entrega, tempo_estimado, distancia_km, status")
          .in("pedido_id", assignedPedidoIds)
          .returns<RouteRow[]>()
      : Promise.resolve({ data: [] as RouteRow[], error: null }),
    pedidoIds.length
      ? supabase
          .from("pedido_itens")
          .select("pedido_id, quantidade, produtos(nome)")
          .in("pedido_id", pedidoIds)
          .returns<ItemRow[]>()
      : Promise.resolve({ data: [] as ItemRow[], error: null }),
  ]);

  if (ordersError) return { data: [] as DeliveryOrder[], error: ordersError };
  if (routesError) return { data: [] as DeliveryOrder[], error: routesError };
  if (itemsError) return { data: [] as DeliveryOrder[], error: itemsError };

  (orders ?? []).forEach((order) => {
    if (order.cliente_id) customerIds.add(order.cliente_id);
  });

  const { data: customers, error: customersError } = customerIds.size
    ? await supabase
        .from("profiles")
        .select("id, nome, telefone, avatar_url")
        .in("id", Array.from(customerIds))
        .returns<ProfileRow[]>()
    : { data: [] as ProfileRow[], error: null };
  if (customersError) return { data: [] as DeliveryOrder[], error: customersError };

  const orderMap = new Map((orders ?? []).map((item) => [item.id, item]));
  const routeMap = new Map((routes ?? []).map((item) => [item.pedido_id, item]));
  const customerMap = new Map((customers ?? []).map((item) => [item.id, item]));
  const itemMap = new Map<string, ItemRow[]>();

  (items ?? []).forEach((item) => {
    const current = itemMap.get(item.pedido_id) ?? [];
    current.push(item);
    itemMap.set(item.pedido_id, current);
  });

  const deliveries = (deliveryRows ?? []).map((delivery) => {
    const order = orderMap.get(delivery.pedido_id);
    const customer = order?.cliente_id ? customerMap.get(order.cliente_id) : null;
    const route = routeMap.get(delivery.pedido_id);
    return mapDeliveryRow(
      delivery,
      order ?? null,
      route ?? null,
      customer ?? null,
      itemMap.get(delivery.pedido_id) ?? [],
    );
  });

  return { data: deliveries, error: null };
}
