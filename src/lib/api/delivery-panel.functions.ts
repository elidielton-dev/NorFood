import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth-helpers.server";
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

type TenantScopedInput = {
  tenantSlug: string;
};

type UpdateKdsOrderStatusInput = TenantScopedInput & {
  orderId: string;
  status: PedidoStatus;
};

type FetchKdsOrderItemsInput = TenantScopedInput & {
  orderId: string;
};

async function loadTenantDeliveryContext(userId: string, tenantSlug: string) {
  await assertStaffUserId(userId, "Acesso restrito ao painel de entregas.");
  const tenantId = await resolveStaffTenantId(userId, tenantSlug);
  return { tenantId };
}

async function assertPedidoBelongsToTenant(tenantId: string, orderId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("pedidos")
    .select("id, tenant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data as { tenant_id?: string | null }).tenant_id !== tenantId) {
    throw new Error("Pedido não encontrado neste restaurante.");
  }
}

export const fetchDeliveryPanelDataServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<DeliveryPanelData> => {
    const { tenantId } = await loadTenantDeliveryContext(context.userId, tenantSlug);
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(tenantId, "delivery_app");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { expireStalePendingMercadoPagoOrders } = await import("@/lib/api/mercado-pago.server");

    await expireStalePendingMercadoPagoOrders();

    const [
      pedidosResult,
      entregasResult,
      routesResult,
      tenantRidersResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("pedidos")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("entregas")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("rotas_entrega")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("ordem_entrega", { ascending: true }),
      supabaseAdmin
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .eq("role", "entregador"),
    ]);

    if (pedidosResult.error) throw pedidosResult.error;
    if (entregasResult.error) throw entregasResult.error;
    if (routesResult.error) throw routesResult.error;
    if (tenantRidersResult.error) throw tenantRidersResult.error;

    const pedidos = pedidosResult.data ?? [];
    const entregas = entregasResult.data ?? [];
    const routes = routesResult.data ?? [];

    const riderIds = new Set<string>();
    for (const row of tenantRidersResult.data ?? []) {
      riderIds.add(row.user_id);
    }
    for (const pedido of pedidos) {
      if (pedido.entregador_id) riderIds.add(pedido.entregador_id);
    }
    for (const entrega of entregas) {
      if (entrega.motoboy_id) riderIds.add(entrega.motoboy_id);
    }
    for (const route of routes) {
      riderIds.add(route.entregador_id);
    }

    const riderIdList = [...riderIds];

    const [locationsResult, profilesResult, riderProfilesResult] = await Promise.all([
      riderIdList.length
        ? supabaseAdmin
            .from("entregadores_localizacao")
            .select("*")
            .in("entregador_id", riderIdList)
        : Promise.resolve({ data: [] as LocationRow[], error: null }),
      riderIdList.length
        ? supabaseAdmin
            .from("profiles")
            .select("id,nome,telefone,avatar_url")
            .in("id", riderIdList)
        : Promise.resolve({ data: [] as ProfileRow[], error: null }),
      riderIdList.length
        ? supabaseAdmin
            .from("entregador_perfis" as never)
            .select("user_id,online,updated_at,vehicle,plate,support_phone")
            .in("user_id", riderIdList)
        : Promise.resolve({ data: [] as RiderProfileRow[], error: null }),
    ]);

    if (locationsResult.error) throw locationsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (riderProfilesResult.error) throw riderProfilesResult.error;

    const riderProfiles = (riderProfilesResult.data ?? []) as RiderProfileRow[];

    return {
      pedidos,
      entregas,
      locations: locationsResult.data ?? [],
      routes,
      profiles: (profilesResult.data ?? []) as ProfileRow[],
      riderProfiles,
    };
  });

export const fetchKdsOrdersServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<Pedido[]> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao KDS.");
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(tenantId, "kds");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [pedidosResult, entregasResult] = await Promise.all([
      supabaseAdmin
        .from("pedidos")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("entregas")
        .select("pedido_id, bairro")
        .eq("tenant_id", tenantId),
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
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(tenantId, "kds");
    await assertPedidoBelongsToTenant(tenantId, data.orderId);

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
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(tenantId, "kds");
    await assertPedidoBelongsToTenant(tenantId, data.orderId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: orderError } = await supabaseAdmin
      .from("pedidos")
      .update({ status: data.status })
      .eq("id", data.orderId)
      .eq("tenant_id", tenantId);
    if (orderError) throw orderError;

    if (data.status === "cancelado") {
      const [deliveryResult, routeResult] = await Promise.all([
        supabaseAdmin
          .from("entregas")
          .update({ status: "cancelado" })
          .eq("pedido_id", data.orderId)
          .eq("tenant_id", tenantId),
        supabaseAdmin
          .from("rotas_entrega")
          .update({ status: "cancelado" })
          .eq("pedido_id", data.orderId)
          .eq("tenant_id", tenantId),
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
          .eq("pedido_id", data.orderId)
          .eq("tenant_id", tenantId),
        supabaseAdmin
          .from("rotas_entrega")
          .update({ status: "entregue" })
          .eq("pedido_id", data.orderId)
          .eq("tenant_id", tenantId),
      ]);
      if (deliveryResult.error) throw deliveryResult.error;
      if (routeResult.error) throw routeResult.error;

      const { data: pedidoRow } = await supabaseAdmin
        .from("pedidos")
        .select("canal")
        .eq("id", data.orderId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (pedidoRow?.canal) {
        const { tryAutoEmitNfceForPedido } = await import("@/lib/api/fiscal.server");
        void tryAutoEmitNfceForPedido(data.orderId, pedidoRow.canal);
      }
    }

    return { ok: true };
  });
