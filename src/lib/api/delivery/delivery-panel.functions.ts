import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth/auth-helpers.server";
import type { Tables } from "@/integrations/supabase/types";
import type { Pedido, PedidoStatus } from "@/lib/shared/db";
import { getOrderNeighborhood } from "@/lib/shared/db";

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
    const { expireStalePendingMercadoPagoOrders } = await import("@/lib/api/financeiro/mercado-pago.server");

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

async function fetchTenantPanelOrders(tenantId: string): Promise<Pedido[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [pedidosResult, entregasResult] = await Promise.all([
    supabaseAdmin
      .from("pedidos")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin.from("entregas").select("pedido_id, bairro").eq("tenant_id", tenantId),
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
}

export const fetchGestaoDeliveryOrdersServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<Pedido[]> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao Gestao delivery.");
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    return fetchTenantPanelOrders(tenantId);
  });

/** @deprecated Use fetchGestaoDeliveryOrdersServer or fetchKitchenOrdersServer */
export const fetchKdsOrdersServer = fetchGestaoDeliveryOrdersServer;

export const fetchKitchenOrdersServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<Pedido[]> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao KDS da cozinha.");
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(tenantId, "kds");
    return fetchTenantPanelOrders(tenantId);
  });

export const fetchPanelOrderItemsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: FetchKdsOrderItemsInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
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

export const fetchKdsOrderItemsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: FetchKdsOrderItemsInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao KDS da cozinha.");
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

async function applyGestaoDeliveryStatusUpdate(
  tenantId: string,
  orderId: string,
  status: PedidoStatus,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { error: orderError } = await supabaseAdmin
    .from("pedidos")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
  if (orderError) throw orderError;

  if (status === "cancelado") {
    const [deliveryResult, routeResult] = await Promise.all([
      supabaseAdmin
        .from("entregas")
        .update({ status: "cancelado" })
        .eq("pedido_id", orderId)
        .eq("tenant_id", tenantId),
      supabaseAdmin
        .from("rotas_entrega")
        .update({ status: "cancelado" })
        .eq("pedido_id", orderId)
        .eq("tenant_id", tenantId),
    ]);
    if (deliveryResult.error) throw deliveryResult.error;
    if (routeResult.error) throw routeResult.error;
  }

  if (status === "entregue") {
    const deliveredAt = new Date().toISOString();
    const [deliveryResult, routeResult] = await Promise.all([
      supabaseAdmin
        .from("entregas")
        .update({ status: "entregue", entregue_em: deliveredAt })
        .eq("pedido_id", orderId)
        .eq("tenant_id", tenantId),
      supabaseAdmin
        .from("rotas_entrega")
        .update({ status: "entregue" })
        .eq("pedido_id", orderId)
        .eq("tenant_id", tenantId),
    ]);
    if (deliveryResult.error) throw deliveryResult.error;
    if (routeResult.error) throw routeResult.error;

    const { data: pedidoRow } = await supabaseAdmin
      .from("pedidos")
      .select("canal")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (pedidoRow?.canal) {
      const { tryAutoEmitNfceForPedido } = await import("@/lib/api/fiscal/fiscal.server");
      void tryAutoEmitNfceForPedido(orderId, pedidoRow.canal);
    }
  }

  if (status === "em_entrega" || status === "entregue") {
    const { syncQueroStatusForPedido } = await import(
      "@/lib/integrations/quero-delivery/quero-delivery.sync.server"
    );
    void syncQueroStatusForPedido(tenantId, orderId, status).catch(console.error);
  }
}

export const updateGestaoDeliveryOrderStatusServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: UpdateKdsOrderStatusInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao Gestao delivery.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    await assertPedidoBelongsToTenant(tenantId, data.orderId);
    await applyGestaoDeliveryStatusUpdate(tenantId, data.orderId, data.status);
    return { ok: true };
  });

/** @deprecated Use updateGestaoDeliveryOrderStatusServer */
export const updateKdsOrderStatusServer = updateGestaoDeliveryOrderStatusServer;

export const updateGestaoDeliveryKitchenStageServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: TenantScopedInput & { orderId: string; stage: "aprovado" | "producao" }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao Gestao delivery.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    await assertPedidoBelongsToTenant(tenantId, data.orderId);

    const { withKitchenStage } = await import("@/lib/kitchen-stage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pedido, error: loadError } = await supabaseAdmin
      .from("pedidos")
      .select("id,status,observacoes")
      .eq("id", data.orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!pedido) throw new Error("Pedido nao encontrado.");
    if (pedido.status !== "em_preparo") {
      throw new Error("Somente pedidos aprovados podem entrar em producao.");
    }

    const { error } = await supabaseAdmin
      .from("pedidos")
      .update({
        observacoes: withKitchenStage(pedido.observacoes, data.stage),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.orderId)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return { ok: true as const };
  });

export const updateKitchenProductionStageServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: TenantScopedInput & { orderId: string; stage: "aprovado" | "producao" }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao KDS da cozinha.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(tenantId, "kds");
    await assertPedidoBelongsToTenant(tenantId, data.orderId);

    const { withKitchenStage } = await import("@/lib/kitchen-stage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pedido, error: loadError } = await supabaseAdmin
      .from("pedidos")
      .select("id,status,observacoes")
      .eq("id", data.orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!pedido) throw new Error("Pedido nao encontrado.");
    if (pedido.status !== "em_preparo") {
      throw new Error("Somente pedidos aprovados podem entrar em producao.");
    }

    const { error } = await supabaseAdmin
      .from("pedidos")
      .update({
        observacoes: withKitchenStage(pedido.observacoes, data.stage),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.orderId)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return { ok: true as const };
  });

export const toggleRiderOnlineServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: TenantScopedInput & { riderId: string; online: boolean }) => input)
  .handler(async ({ context, data }) => {
    const { tenantId } = await loadTenantDeliveryContext(context.userId, data.tenantSlug);
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(tenantId, "delivery_app");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", data.riderId)
      .eq("status", "active")
      .eq("role", "entregador")
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) throw new Error("Entregador não pertence a este restaurante.");

    const [profileResult, locationResult] = await Promise.all([
      supabaseAdmin.from("entregador_perfis").upsert(
        { user_id: data.riderId, online: data.online, tenant_id: tenantId } as never,
        { onConflict: "user_id" },
      ),
      supabaseAdmin.from("entregadores_localizacao").upsert(
        {
          entregador_id: data.riderId,
          status: data.online ? "online" : "offline",
          updated_at: new Date().toISOString(),
          tenant_id: tenantId,
        } as never,
        { onConflict: "entregador_id" },
      ),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (locationResult.error) throw locationResult.error;
    return { ok: true as const };
  });

export const reassignDeliveryServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: TenantScopedInput & { deliveryId: string; riderId?: string | null }) => input)
  .handler(async ({ context, data }) => {
    const { tenantId } = await loadTenantDeliveryContext(context.userId, data.tenantSlug);
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(tenantId, "delivery_app");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from("entregas")
      .select("*")
      .eq("id", data.deliveryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (deliveryError) throw deliveryError;
    if (!delivery) throw new Error("Entrega não encontrada neste restaurante.");

    await assertPedidoBelongsToTenant(tenantId, delivery.pedido_id);

    let nextRiderId = data.riderId ?? null;
    if (!nextRiderId) {
      const { data: riders } = await supabaseAdmin
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .eq("role", "entregador");
      const riderIds = (riders ?? []).map((r) => r.user_id).filter((id) => id !== delivery.motoboy_id);
      if (!riderIds.length) throw new Error("Nao encontrei outro entregador para a troca.");

      const { data: profiles } = await supabaseAdmin
        .from("entregador_perfis")
        .select("user_id, online")
        .in("user_id", riderIds);
      const online = (profiles ?? []).find((p) => p.online);
      nextRiderId = online?.user_id ?? riderIds[0] ?? null;
    }
    if (!nextRiderId) throw new Error("Nao encontrei outro entregador online para a troca.");

    const { data: riderMembership, error: riderMembershipError } = await supabaseAdmin
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", nextRiderId)
      .eq("status", "active")
      .eq("role", "entregador")
      .maybeSingle();
    if (riderMembershipError) throw riderMembershipError;
    if (!riderMembership) throw new Error("Entregador não pertence a este restaurante.");

    const { data: oldRoute } = await supabaseAdmin
      .from("rotas_entrega")
      .select("*")
      .eq("pedido_id", delivery.pedido_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const previousRiderId = delivery.motoboy_id;
    const previousOrder = oldRoute?.ordem_entrega ?? null;

    const { data: activeRoutes } = await supabaseAdmin
      .from("rotas_entrega")
      .select("ordem_entrega")
      .eq("entregador_id", nextRiderId)
      .eq("tenant_id", tenantId)
      .neq("status", "entregue");
    const nextOrder =
      (activeRoutes ?? []).reduce((max, route) => Math.max(max, route.ordem_entrega), 0) + 1;

    const { error: updateDeliveryError } = await supabaseAdmin
      .from("entregas")
      .update({ motoboy_id: nextRiderId, status: "aceito" })
      .eq("id", data.deliveryId)
      .eq("tenant_id", tenantId);
    if (updateDeliveryError) throw updateDeliveryError;

    const { error: updateOrderError } = await supabaseAdmin
      .from("pedidos")
      .update({ entregador_id: nextRiderId, ordem_na_rota: nextOrder })
      .eq("id", delivery.pedido_id)
      .eq("tenant_id", tenantId);
    if (updateOrderError) throw updateOrderError;

    const { error: upsertRouteError } = await supabaseAdmin.from("rotas_entrega").upsert(
      {
        id: oldRoute?.id,
        entregador_id: nextRiderId,
        pedido_id: delivery.pedido_id,
        ordem_entrega: nextOrder,
        distancia_km: oldRoute?.distancia_km ?? delivery.distancia_km,
        tempo_estimado: oldRoute?.tempo_estimado ?? null,
        status: oldRoute?.status ?? "pendente",
        tenant_id: tenantId,
      } as never,
      { onConflict: "pedido_id" },
    );
    if (upsertRouteError) throw upsertRouteError;

    if (previousRiderId && previousOrder != null) {
      const { data: oldRiderRoutes } = await supabaseAdmin
        .from("rotas_entrega")
        .select("id, pedido_id, ordem_entrega")
        .eq("entregador_id", previousRiderId)
        .eq("tenant_id", tenantId)
        .neq("pedido_id", delivery.pedido_id)
        .neq("status", "entregue")
        .gt("ordem_entrega", previousOrder);

      for (const route of oldRiderRoutes ?? []) {
        const { error } = await supabaseAdmin
          .from("rotas_entrega")
          .update({ ordem_entrega: route.ordem_entrega - 1 })
          .eq("id", route.id)
          .eq("tenant_id", tenantId);
        if (error) throw error;

        const { error: orderError } = await supabaseAdmin
          .from("pedidos")
          .update({ ordem_na_rota: route.ordem_entrega - 1 })
          .eq("id", route.pedido_id)
          .eq("tenant_id", tenantId);
        if (orderError) throw orderError;
      }
    }

    return { ok: true as const, riderId: nextRiderId };
  });

export const updateKitchenMarkReadyServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: TenantScopedInput & { orderId: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao KDS da cozinha.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { assertTenantPlanFeature } = await import("@/lib/tenant/tenant-plan.server");
    await assertTenantPlanFeature(tenantId, "kds");
    await assertPedidoBelongsToTenant(tenantId, data.orderId);

    const { withKitchenStage } = await import("@/lib/kitchen-stage");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pedido, error: loadError } = await supabaseAdmin
      .from("pedidos")
      .select("id,status,observacoes")
      .eq("id", data.orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!pedido) throw new Error("Pedido nao encontrado.");
    if (pedido.status !== "em_preparo") {
      throw new Error("Somente pedidos em producao podem ser marcados como prontos.");
    }

    const { error } = await supabaseAdmin
      .from("pedidos")
      .update({
        status: "pronto",
        observacoes: withKitchenStage(pedido.observacoes, "aprovado"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.orderId)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return { ok: true as const };
  });

export const resolveDeliveryOrderChatServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: TenantScopedInput & { orderId: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao Gestao delivery.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    await assertPedidoBelongsToTenant(tenantId, data.orderId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getOrderMetadataValue } = await import("@/lib/shared/db");

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos")
      .select("id, cliente_id, observacoes")
      .eq("id", data.orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (pedidoError) throw pedidoError;
    if (!pedido) throw new Error("Pedido nao encontrado.");

    let phone = getOrderMetadataValue(pedido.observacoes, "phone");
    if (pedido.cliente_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("telefone")
        .eq("id", pedido.cliente_id)
        .maybeSingle();
      phone = profile?.telefone ?? phone;
    }

    if (!phone?.trim()) {
      throw new Error("Telefone do cliente nao encontrado. Configure o WhatsApp em Integracoes.");
    }

    const digits = phone.replace(/\D/g, "").slice(-8);
    const { data: chats, error: chatError } = await supabaseAdmin
      .from("whatsapp_chats")
      .select("id")
      .eq("tenant_id", tenantId)
      .or(`phone.ilike.%${digits}%`)
      .order("last_message_at", { ascending: false })
      .limit(1);

    if (chatError) throw chatError;
    if (!chats?.length) {
      throw new Error(
        "Nenhuma conversa WhatsApp encontrada para este cliente. Abra o Atendimento para iniciar.",
      );
    }

    return { chatId: chats[0].id as string, channel: "whatsapp" as const };
  });
