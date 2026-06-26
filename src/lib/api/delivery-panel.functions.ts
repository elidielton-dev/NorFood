import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";
import type { Tables } from "@/integrations/supabase/types";
import type { Pedido, PedidoStatus } from "@/lib/db";
import { getOrderNeighborhood } from "@/lib/db";

type PedidoRow = Tables<"pedidos">;
type EntregaRow = Tables<"entregas">;
type LocationRow = Tables<"entregadores_localizacao">;
type RouteRow = Tables<"rotas_entrega">;
type ProfileRow = Pick<Tables<"profiles">, "id" | "nome" | "telefone" | "avatar_url">;

type RiderProfileRow = {
  user_id: string;
  online: boolean;
  updated_at: string;
  vehicle: string | null;
  plate: string | null;
  support_phone: string | null;
};

export type DeliveryPanelData = {
  pedidos: PedidoRow[];
  entregas: EntregaRow[];
  locations: LocationRow[];
  routes: RouteRow[];
  profiles: ProfileRow[];
  riderProfiles: RiderProfileRow[];
};

type UpdateKdsOrderStatusInput = {
  orderId: string;
  status: PedidoStatus;
};

type FetchKdsOrderItemsInput = {
  orderId: string;
};

export const fetchDeliveryPanelDataServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeliveryPanelData> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel de entregas.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { expireStalePendingMercadoPagoOrders } = await import("@/lib/api/mercado-pago.server");

    await expireStalePendingMercadoPagoOrders();

    const [
      pedidosResult,
      entregasResult,
      locationsResult,
      routesResult,
      profilesResult,
      riderProfilesResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("pedidos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("entregas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("entregadores_localizacao").select("*"),
      supabaseAdmin.from("rotas_entrega").select("*").order("ordem_entrega", { ascending: true }),
      supabaseAdmin.from("profiles").select("id,nome,telefone,avatar_url"),
      supabaseAdmin
        .from("entregador_perfis" as never)
        .select("user_id,online,updated_at,vehicle,plate,support_phone"),
    ]);

    if (pedidosResult.error) throw pedidosResult.error;
    if (entregasResult.error) throw entregasResult.error;
    if (locationsResult.error) throw locationsResult.error;
    if (routesResult.error) throw routesResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (riderProfilesResult.error) throw riderProfilesResult.error;

    return {
      pedidos: pedidosResult.data ?? [],
      entregas: entregasResult.data ?? [],
      locations: locationsResult.data ?? [],
      routes: routesResult.data ?? [],
      profiles: (profilesResult.data ?? []) as ProfileRow[],
      riderProfiles: (riderProfilesResult.data ?? []) as RiderProfileRow[],
    };
  });

export const fetchKdsOrdersServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Pedido[]> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao KDS.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [pedidosResult, entregasResult] = await Promise.all([
      supabaseAdmin
        .from("pedidos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("entregas").select("pedido_id, bairro"),
    ]);

    if (pedidosResult.error) throw pedidosResult.error;
    if (entregasResult.error) throw entregasResult.error;

    const bairroByPedidoId = new Map(
      (entregasResult.data ?? []).map((entrega) => [entrega.pedido_id, entrega.bairro]),
    );

    return (pedidosResult.data ?? []).map((pedido) => {
      const entregaBairro = bairroByPedidoId.get(pedido.id) ?? null;
      const bairro = getOrderNeighborhood(pedido, entregaBairro);
      return { ...pedido, bairro };
    });
  });

export const fetchKdsOrderItemsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: FetchKdsOrderItemsInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao KDS.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const itemsResult = await supabaseAdmin
      .from("pedido_itens")
      .select(
        "id,pedido_id,produto_id,quantidade,preco_unitario,observacao,produtos(nome,imagem_url)",
      )
      .eq("pedido_id", data.orderId);

    if (itemsResult.error) throw itemsResult.error;

    return itemsResult.data ?? [];
  });

export const updateKdsOrderStatusServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: UpdateKdsOrderStatusInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao KDS.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: orderError } = await supabaseAdmin
      .from("pedidos")
      .update({ status: data.status })
      .eq("id", data.orderId);
    if (orderError) throw orderError;

    if (data.status === "cancelado") {
      const [deliveryResult, routeResult] = await Promise.all([
        supabaseAdmin
          .from("entregas")
          .update({ status: "cancelado" })
          .eq("pedido_id", data.orderId),
        supabaseAdmin
          .from("rotas_entrega")
          .update({ status: "cancelado" })
          .eq("pedido_id", data.orderId),
      ]);
      if (deliveryResult.error) throw deliveryResult.error;
      if (routeResult.error) throw routeResult.error;
    }

    if (data.status === "entregue") {
      const deliveredAt = new Date().toISOString();
      const [deliveryResult, routeResult] = await Promise.all([
        supabaseAdmin
          .from("entregas")
          .update({ status: "entregue", entregue_em: deliveredAt })
          .eq("pedido_id", data.orderId),
        supabaseAdmin
          .from("rotas_entrega")
          .update({ status: "entregue" })
          .eq("pedido_id", data.orderId),
      ]);
      if (deliveryResult.error) throw deliveryResult.error;
      if (routeResult.error) throw routeResult.error;

      const { data: pedidoRow } = await supabaseAdmin
        .from("pedidos")
        .select("canal")
        .eq("id", data.orderId)
        .maybeSingle();
      if (pedidoRow?.canal) {
        const { tryAutoEmitNfceForPedido } = await import("@/lib/api/fiscal.server");
        void tryAutoEmitNfceForPedido(data.orderId, pedidoRow.canal);
      }
    }

    return { ok: true };
  });
