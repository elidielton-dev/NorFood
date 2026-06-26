import {
  adminClient,
  createRealtimeClientSession,
  ensureCategory,
  ensureProduct,
  ensureUser,
} from "./supabase-real-tracking-tools.mjs";
import { SERVICE_CITY_CONFIG } from "./city-config.mjs";

const checkoutSeedMarker = "SEED_CHECKOUT_REAL";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupCheckoutSeed() {
  const { data: existingOrders, error: ordersError } = await adminClient
    .from("pedidos")
    .select("id")
    .ilike("observacoes", `%${checkoutSeedMarker}%`);
  if (ordersError) throw ordersError;

  const orderIds = (existingOrders ?? []).map((item) => item.id);
  if (!orderIds.length) return;

  const { error: routesError } = await adminClient.from("rotas_entrega").delete().in("pedido_id", orderIds);
  if (routesError) throw routesError;

  const { error: deliveriesError } = await adminClient.from("entregas").delete().in("pedido_id", orderIds);
  if (deliveriesError) throw deliveriesError;

  const { error: itemsError } = await adminClient.from("pedido_itens").delete().in("pedido_id", orderIds);
  if (itemsError) throw itemsError;

  const { error: financeError } = await adminClient
    .from("lancamentos_financeiros")
    .delete()
    .in("pedido_id", orderIds);
  if (financeError) throw financeError;

  const { error: ordersDeleteError } = await adminClient.from("pedidos").delete().in("id", orderIds);
  if (ordersDeleteError) throw ordersDeleteError;
}

async function main() {
  const manager = await ensureUser({
    email: "seed.gestor.checkout@abelhaemel.local",
    password: "SeedGestor123!",
    name: "Gestor Checkout Custodia",
    phone: "(87) 97777-3001",
    role: "admin",
  });
  const rider = await ensureUser({
    email: "seed.motoboy.checkout@abelhaemel.local",
    password: "SeedMotoCheckout123!",
    name: "Entregador Checkout Custodia",
    phone: "(87) 97777-3002",
    role: "motoboy",
    metadata: {
      cep: SERVICE_CITY_CONFIG.cep,
      address: SERVICE_CITY_CONFIG.neighborhoods[0].exampleAddress,
      neighborhood: SERVICE_CITY_CONFIG.neighborhoods[0].name,
      city: SERVICE_CITY_CONFIG.city,
      stateCode: SERVICE_CITY_CONFIG.state,
      reference: SERVICE_CITY_CONFIG.neighborhoods[0].reference,
    },
  });
  const customer = await ensureUser({
    email: "seed.cliente.checkout@abelhaemel.local",
    password: "SeedClienteCheckout123!",
    name: "Cliente Checkout Custodia",
    phone: "(87) 97777-3003",
    role: "cliente",
    metadata: {
      cep: SERVICE_CITY_CONFIG.cep,
      address: SERVICE_CITY_CONFIG.neighborhoods[0].exampleAddress,
      neighborhood: SERVICE_CITY_CONFIG.neighborhoods[0].name,
      city: SERVICE_CITY_CONFIG.city,
      stateCode: SERVICE_CITY_CONFIG.state,
      reference: SERVICE_CITY_CONFIG.neighborhoods[0].reference,
    },
  });

  await cleanupCheckoutSeed();

  const categoriaId = await ensureCategory("Seed Checkout Real");
  const productId = await ensureProduct({
    categoriaId,
    nome: "Caixa Dinheiro com Troco Seed",
    preco: 59.9,
    destaque: true,
  });

  const subtotal = 59.9;
  const taxaEntrega = SERVICE_CITY_CONFIG.neighborhoods[0].deliveryFee;
  const total = subtotal + taxaEntrega;
  const trocoPara = 100;

  const { data: order, error: orderError } = await adminClient
    .from("pedidos")
    .insert({
      canal: "delivery",
      cliente_id: customer.id,
      entregador_id: rider.id,
      ordem_na_rota: 1,
      status: "em_entrega",
      subtotal,
      desconto: 0,
      taxa_entrega: taxaEntrega,
      total,
      forma_pagamento: "dinheiro",
      troco_para: trocoPara,
      endereco: SERVICE_CITY_CONFIG.neighborhoods[0].exampleAddress,
      observacoes: `${checkoutSeedMarker} pagamento em dinheiro com troco`,
      latitude_cliente: SERVICE_CITY_CONFIG.neighborhoods[0].latitude,
      longitude_cliente: SERVICE_CITY_CONFIG.neighborhoods[0].longitude,
      previsao_entrega: new Date(Date.now() + 18 * 60000).toISOString(),
      distancia_restante: 2.1,
    })
    .select("*")
    .single();
  if (orderError) throw orderError;

  const { error: itemError } = await adminClient.from("pedido_itens").insert({
    pedido_id: order.id,
    produto_id: productId,
    quantidade: 1,
    preco_unitario: subtotal,
    observacao: checkoutSeedMarker,
  });
  if (itemError) throw itemError;

  const { error: deliveryError } = await adminClient.from("entregas").insert({
    pedido_id: order.id,
    motoboy_id: rider.id,
    status: "pedido_retirado",
    endereco: order.endereco,
    bairro: SERVICE_CITY_CONFIG.neighborhoods[0].name,
    distancia_km: 2.1,
    taxa: taxaEntrega,
  });
  if (deliveryError) throw deliveryError;

  const { error: routeError } = await adminClient.from("rotas_entrega").insert({
    entregador_id: rider.id,
    pedido_id: order.id,
    ordem_entrega: 1,
    distancia_km: 2.1,
    tempo_estimado: 18,
    status: "em_rota",
  });
  if (routeError) throw routeError;

  const { error: financeError } = await adminClient.from("lancamentos_financeiros").insert({
    tipo: "entrada",
    descricao: `Pedido #${order.numero}`,
    categoria: "Vendas delivery",
    valor: total,
    forma: "dinheiro",
    pedido_id: order.id,
  });
  if (financeError) throw financeError;

  const { error: riderProfileError } = await adminClient.from("entregador_perfis").upsert(
    {
      user_id: rider.id,
      online: true,
      vehicle: "Moto",
      plate: "BRA2E19",
      support_phone: SERVICE_CITY_CONFIG.supportPhone,
      cep: SERVICE_CITY_CONFIG.cep,
      address: SERVICE_CITY_CONFIG.neighborhoods[0].exampleAddress,
      neighborhood: SERVICE_CITY_CONFIG.neighborhoods[0].name,
      city: SERVICE_CITY_CONFIG.city,
      state: SERVICE_CITY_CONFIG.state,
    },
    {
      onConflict: "user_id",
    },
  );
  if (riderProfileError) throw riderProfileError;

  const { error: locationError } = await adminClient.from("entregadores_localizacao").upsert(
    {
      entregador_id: rider.id,
      latitude: SERVICE_CITY_CONFIG.center.latitude,
      longitude: SERVICE_CITY_CONFIG.center.longitude,
      speed: 8.3,
      heading: 132,
      accuracy: 6,
      battery: 87,
      status: "em_rota",
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "entregador_id",
    },
  );
  if (locationError) throw locationError;

  const customerClient = await createRealtimeClientSession(customer.email, "SeedClienteCheckout123!");
  const managerClient = await createRealtimeClientSession(manager.email, "SeedGestor123!");

  const realtimeEvents = {
    order: false,
    location: false,
  };

  await new Promise((resolve, reject) => {
    const orderChannel = customerClient
      .channel(`validate-order-${order.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `id=eq.${order.id}` },
        async (payload) => {
          if (payload.new?.id !== order.id) return;
          realtimeEvents.order = true;
          if (realtimeEvents.location) {
            clearTimeout(timeout);
            await customerClient.removeChannel(orderChannel);
            await customerClient.removeChannel(locationChannel);
            resolve();
          }
        },
      );

    const locationChannel = customerClient
      .channel(`validate-location-${rider.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "entregadores_localizacao" },
        async (payload) => {
          if (payload.new?.entregador_id !== rider.id) return;
          realtimeEvents.location = true;
          if (realtimeEvents.order) {
            clearTimeout(timeout);
            await customerClient.removeChannel(orderChannel);
            await customerClient.removeChannel(locationChannel);
            resolve();
          }
        },
      );

    const timeout = setTimeout(async () => {
      await customerClient.removeChannel(orderChannel);
      await customerClient.removeChannel(locationChannel);
      reject(new Error("Realtime do cliente nao recebeu pedido e localizacao."));
    }, 30000);

    let subscribedCount = 0;
    const maybeTrigger = async () => {
      subscribedCount += 1;
      if (subscribedCount < 2) return;
      await wait(1200);

      const { error: orderUpdateError } = await adminClient
        .from("pedidos")
        .update({
          distancia_restante: 1.4,
          previsao_entrega: new Date(Date.now() + 12 * 60000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (orderUpdateError) {
        clearTimeout(timeout);
        reject(orderUpdateError);
        return;
      }

      const { error: locationUpdateError } = await adminClient
        .from("entregadores_localizacao")
        .update({
          latitude: SERVICE_CITY_CONFIG.neighborhoods[0].latitude,
          longitude: SERVICE_CITY_CONFIG.neighborhoods[0].longitude,
          speed: 9.1,
          updated_at: new Date().toISOString(),
        })
        .eq("entregador_id", rider.id);
      if (locationUpdateError) {
        clearTimeout(timeout);
        reject(locationUpdateError);
      }
    };

    orderChannel.subscribe(async (status, error) => {
      if (error) {
        clearTimeout(timeout);
        reject(error);
        return;
      }
      if (status === "SUBSCRIBED") await maybeTrigger();
    });

    locationChannel.subscribe(async (status, error) => {
      if (error) {
        clearTimeout(timeout);
        reject(error);
        return;
      }
      if (status === "SUBSCRIBED") await maybeTrigger();
    });
  });

  const { data: customerOrder, error: customerOrderError } = await customerClient
    .from("pedidos")
    .select("id, numero, forma_pagamento, troco_para, status, entregador_id, ordem_na_rota, distancia_restante")
    .eq("id", order.id)
    .single();
  if (customerOrderError) throw customerOrderError;

  const { data: customerItems, error: customerItemsError } = await customerClient
    .from("pedido_itens")
    .select("id, quantidade, preco_unitario")
    .eq("pedido_id", order.id);
  if (customerItemsError) throw customerItemsError;

  const { data: customerRoutes, error: customerRoutesError } = await customerClient
    .from("rotas_entrega")
    .select("pedido_id, ordem_entrega, status")
    .eq("entregador_id", rider.id);
  if (customerRoutesError) throw customerRoutesError;

  const { data: customerLocation, error: customerLocationError } = await customerClient
    .from("entregadores_localizacao")
    .select("entregador_id, latitude, longitude, status")
    .eq("entregador_id", rider.id)
    .single();
  if (customerLocationError) throw customerLocationError;

  const { data: customerDelivery, error: customerDeliveryError } = await customerClient
    .from("entregas")
    .select("pedido_id, status, motoboy_id")
    .eq("pedido_id", order.id)
    .single();
  if (customerDeliveryError) throw customerDeliveryError;

  const panelQueries = await Promise.all([
    managerClient.from("pedidos").select("id, numero, forma_pagamento, troco_para").eq("id", order.id).single(),
    managerClient.from("entregas").select("id, pedido_id, status").eq("pedido_id", order.id).single(),
    managerClient.from("rotas_entrega").select("pedido_id, ordem_entrega, status").eq("pedido_id", order.id).single(),
    managerClient.from("entregadores_localizacao").select("entregador_id, latitude, longitude").eq("entregador_id", rider.id).single(),
    managerClient.from("profiles").select("id, nome, telefone").eq("id", customer.id).single(),
    managerClient.from("entregador_perfis").select("user_id, online, vehicle, plate").eq("user_id", rider.id).single(),
  ]);

  for (const result of panelQueries) {
    if (result.error) throw result.error;
  }

  const { data: financeRows, error: financeRowsError } = await adminClient
    .from("lancamentos_financeiros")
    .select("valor, forma, pedido_id")
    .eq("pedido_id", order.id);
  if (financeRowsError) throw financeRowsError;

  if (customerOrder.forma_pagamento !== "dinheiro") {
    throw new Error("Pedido do cliente nao manteve forma_pagamento=dinheiro.");
  }
  if (Number(customerOrder.troco_para) !== trocoPara) {
    throw new Error("Pedido do cliente nao manteve troco_para corretamente.");
  }
  if (!customerItems?.length) {
    throw new Error("Cliente nao conseguiu visualizar itens do proprio pedido.");
  }
  if (!customerRoutes?.some((route) => route.pedido_id === order.id)) {
    throw new Error("Cliente nao conseguiu visualizar a rota da propria entrega.");
  }
  if (customerLocation.entregador_id !== rider.id) {
    throw new Error("Cliente nao conseguiu visualizar a localizacao do entregador.");
  }
  if (customerDelivery.motoboy_id !== rider.id) {
    throw new Error("Cliente nao conseguiu visualizar a entrega atribuida.");
  }
  if (!financeRows?.some((row) => row.forma === "dinheiro" && Number(row.valor) === total)) {
    throw new Error("Lancamento financeiro em dinheiro nao foi encontrado.");
  }

  console.log("VALIDACAO_CHECKOUT_REAL_OK");
  console.log(
    JSON.stringify(
      {
        manager: { id: manager.id, email: manager.email },
        rider: { id: rider.id, email: rider.email },
        customer: { id: customer.id, email: customer.email },
        order: {
          id: order.id,
          numero: customerOrder.numero,
          formaPagamento: customerOrder.forma_pagamento,
          trocoPara: customerOrder.troco_para,
          ordemNaRota: customerOrder.ordem_na_rota,
          distanciaRestante: customerOrder.distancia_restante,
        },
        realtimeEvents,
        panelAccessValidated: true,
        financeRows: financeRows?.length ?? 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("VALIDACAO_CHECKOUT_REAL_FALHOU");
  if (error?.code === "PGRST204" && String(error.message).includes("troco_para")) {
    console.error(
      new Error(
        "A migration 20260615233000_add_cash_change_to_orders.sql ainda nao foi aplicada no Supabase real, ou o schema cache ainda nao foi recarregado.",
      ),
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});
