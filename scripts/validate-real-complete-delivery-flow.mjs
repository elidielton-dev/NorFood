import {
  adminClient,
  createRealtimeClientSession,
  ensureCategory,
  ensureProduct,
  ensureUser,
} from "./supabase-real-tracking-tools.mjs";
import { advanceMotoboyDelivery } from "./motoboy-delivery-fallback.mjs";
import { SERVICE_CITY_CONFIG } from "./city-config.mjs";

const marker = "SEED_REAL_COMPLETE_DELIVERY";

async function cleanupSeed() {
  const { data: existingOrders, error: ordersError } = await adminClient
    .from("pedidos")
    .select("id")
    .ilike("observacoes", `%${marker}%`);
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
  const neighborhood = SERVICE_CITY_CONFIG.neighborhoods.at(-1) ?? SERVICE_CITY_CONFIG.neighborhoods[0];

  const manager = await ensureUser({
    email: "seed.gestor.fullflow@abelhaemel.local",
    password: "SeedGestorFull123!",
    name: "Gestor Fluxo Completo",
    phone: "(87) 97777-5101",
    role: "admin",
  });

  const rider = await ensureUser({
    email: "seed.motoboy.fullflow@abelhaemel.local",
    password: "SeedMotoFull123!",
    name: "Entregador Fluxo Completo",
    phone: "(87) 97777-5102",
    role: "motoboy",
    metadata: {
      cep: SERVICE_CITY_CONFIG.cep,
      address: neighborhood.exampleAddress,
      neighborhood: neighborhood.name,
      city: SERVICE_CITY_CONFIG.city,
      stateCode: SERVICE_CITY_CONFIG.state,
      reference: neighborhood.reference,
    },
  });

  const customer = await ensureUser({
    email: "seed.cliente.fullflow@abelhaemel.local",
    password: "SeedClienteFull123!",
    name: `Cliente ${neighborhood.name} Fluxo Completo`,
    phone: "(87) 97777-5103",
    role: "cliente",
    metadata: {
      cep: SERVICE_CITY_CONFIG.cep,
      address: neighborhood.exampleAddress,
      neighborhood: neighborhood.name,
      city: SERVICE_CITY_CONFIG.city,
      stateCode: SERVICE_CITY_CONFIG.state,
      reference: neighborhood.reference,
    },
  });

  await cleanupSeed();

  const categoriaId = await ensureCategory("Seed Fluxo Completo Real");
  const productId = await ensureProduct({
    categoriaId,
    nome: "Caixa Fluxo Completo Real",
    preco: 69.9,
    destaque: true,
  });

  const subtotal = 69.9;
  const taxaEntrega = neighborhood.deliveryFee;
  const total = subtotal + taxaEntrega;
  const trocoPara = 120;

  const { error: riderProfileError } = await adminClient.from("entregador_perfis").upsert(
    {
      user_id: rider.id,
      online: true,
      vehicle: "Moto",
      plate: "FLX5A12",
      support_phone: SERVICE_CITY_CONFIG.supportPhone,
      cep: SERVICE_CITY_CONFIG.cep,
      address: neighborhood.exampleAddress,
      neighborhood: neighborhood.name,
      city: SERVICE_CITY_CONFIG.city,
      state: SERVICE_CITY_CONFIG.state,
    },
    { onConflict: "user_id" },
  );
  if (riderProfileError) throw riderProfileError;

  const { error: locationError } = await adminClient.from("entregadores_localizacao").upsert(
    {
      entregador_id: rider.id,
      latitude: SERVICE_CITY_CONFIG.center.latitude,
      longitude: SERVICE_CITY_CONFIG.center.longitude,
      speed: 0,
      heading: 0,
      accuracy: 6,
      battery: 91,
      status: "online",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entregador_id" },
  );
  if (locationError) throw locationError;

  const customerClient = await createRealtimeClientSession(customer.email, "SeedClienteFull123!");
  const managerClient = await createRealtimeClientSession(manager.email, "SeedGestorFull123!");
  const riderClient = await createRealtimeClientSession(rider.email, "SeedMotoFull123!");

  const { data: order, error: orderError } = await adminClient
    .from("pedidos")
    .insert({
      canal: "delivery",
      cliente_id: customer.id,
      status: "aberto",
      subtotal,
      desconto: 0,
      taxa_entrega: taxaEntrega,
      total,
      forma_pagamento: "dinheiro",
      troco_para: trocoPara,
      endereco: neighborhood.exampleAddress,
      observacoes: `${marker} ${neighborhood.name}`,
      latitude_cliente: neighborhood.latitude,
      longitude_cliente: neighborhood.longitude,
      previsao_entrega: new Date(Date.now() + 30 * 60000).toISOString(),
      distancia_restante: 4.2,
    })
    .select("*")
    .single();
  if (orderError) throw orderError;

  const { error: itemError } = await adminClient.from("pedido_itens").insert({
    pedido_id: order.id,
    produto_id: productId,
    quantidade: 1,
    preco_unitario: subtotal,
    observacao: marker,
  });
  if (itemError) throw itemError;

  const { data: delivery, error: deliveryError } = await adminClient
    .from("entregas")
    .insert({
      pedido_id: order.id,
      motoboy_id: null,
      status: "pendente",
      endereco: neighborhood.exampleAddress,
      bairro: neighborhood.name,
      distancia_km: 4.2,
      taxa: taxaEntrega,
    })
    .select("*")
    .single();
  if (deliveryError) throw deliveryError;

  const { error: financeError } = await adminClient.from("lancamentos_financeiros").insert({
    tipo: "entrada",
    descricao: `Pedido #${order.numero}`,
    categoria: "Vendas delivery",
    valor: total,
    forma: "dinheiro",
    pedido_id: order.id,
  });
  if (financeError) throw financeError;

  const { data: managerOrderBefore, error: managerOrderBeforeError } = await managerClient
    .from("pedidos")
    .select("id, numero, status, forma_pagamento, troco_para")
    .eq("id", order.id)
    .single();
  if (managerOrderBeforeError) throw managerOrderBeforeError;

  const { data: managerDeliveryBefore, error: managerDeliveryBeforeError } = await managerClient
    .from("entregas")
    .select("id, pedido_id, motoboy_id, status, bairro")
    .eq("id", delivery.id)
    .single();
  if (managerDeliveryBeforeError) throw managerDeliveryBeforeError;

  const { error: assignOrderError } = await managerClient
    .from("pedidos")
    .update({
      entregador_id: rider.id,
      ordem_na_rota: 1,
      status: "pronto",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);
  if (assignOrderError) throw assignOrderError;

  const { error: assignDeliveryError } = await managerClient
    .from("entregas")
    .update({
      motoboy_id: rider.id,
      status: "aceito",
      updated_at: new Date().toISOString(),
    })
    .eq("id", delivery.id);
  if (assignDeliveryError) throw assignDeliveryError;

  const { error: assignRouteError } = await managerClient.from("rotas_entrega").upsert(
    {
      entregador_id: rider.id,
      pedido_id: order.id,
      ordem_entrega: 1,
      distancia_km: 4.2,
      tempo_estimado: 30,
      status: "pendente",
    },
    { onConflict: "pedido_id" },
  );
  if (assignRouteError) throw assignRouteError;

  const { data: riderDeliveryAfterAssign, error: riderDeliveryAfterAssignError } = await riderClient
    .from("entregas")
    .select("id, status, motoboy_id, bairro")
    .eq("id", delivery.id)
    .single();
  if (riderDeliveryAfterAssignError) throw riderDeliveryAfterAssignError;

  const { error: riderMoveError } = await riderClient.from("entregadores_localizacao").upsert(
    {
      entregador_id: rider.id,
      latitude: neighborhood.latitude,
      longitude: neighborhood.longitude,
      speed: 8.5,
      heading: 122,
      accuracy: 5,
      battery: 86,
      status: "em_rota",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entregador_id" },
  );
  if (riderMoveError) throw riderMoveError;

  const stages = ["arrived_store", "picked_up", "arrived_customer", "delivered"];
  for (const stage of stages) {
    await advanceMotoboyDelivery(riderClient, delivery.id, stage);
  }

  const [{ data: customerOrder }, { data: managerOrderAfter }, { data: managerDeliveryAfter }, { data: managerRouteAfter }, { data: riderLocationAfter }] =
    await Promise.all([
      customerClient
        .from("pedidos")
        .select("id, numero, status, forma_pagamento, troco_para, entregador_id")
        .eq("id", order.id)
        .single(),
      managerClient
        .from("pedidos")
        .select("id, numero, status, entregador_id, ordem_na_rota, forma_pagamento, troco_para")
        .eq("id", order.id)
        .single(),
      managerClient
        .from("entregas")
        .select("id, status, motoboy_id, pedido_id, bairro, entregue_em")
        .eq("id", delivery.id)
        .single(),
      managerClient
        .from("rotas_entrega")
        .select("pedido_id, entregador_id, ordem_entrega, status")
        .eq("pedido_id", order.id)
        .single(),
      riderClient
        .from("entregadores_localizacao")
        .select("entregador_id, latitude, longitude, status")
        .eq("entregador_id", rider.id)
        .single(),
    ]);

  if (customerOrder?.status !== "entregue") {
    throw new Error("Cliente nao visualizou o pedido finalizado.");
  }
  if (managerOrderAfter?.status !== "entregue") {
    throw new Error("Gestao nao visualizou o pedido como entregue.");
  }
  if (managerDeliveryAfter?.status !== "entregue") {
    throw new Error("Gestao nao visualizou a entrega como concluida.");
  }
  if (managerRouteAfter?.status !== "entregue") {
    throw new Error("A rota final nao foi marcada como entregue.");
  }
  if (riderLocationAfter?.entregador_id !== rider.id) {
    throw new Error("Localizacao final do entregador nao foi persistida.");
  }

  console.log("VALIDACAO_FLUXO_COMPLETO_REAL_OK");
  console.log(
    JSON.stringify(
      {
        city: `${SERVICE_CITY_CONFIG.city}/${SERVICE_CITY_CONFIG.state}`,
        neighborhood: neighborhood.name,
        managerBefore: managerOrderBefore,
        deliveryBefore: managerDeliveryBefore,
        riderAssignedDelivery: riderDeliveryAfterAssign,
        customerFinal: customerOrder,
        managerFinal: {
          order: managerOrderAfter,
          delivery: managerDeliveryAfter,
          route: managerRouteAfter,
        },
        riderFinalLocation: riderLocationAfter,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("VALIDACAO_FLUXO_COMPLETO_REAL_FALHOU");
  console.error(error);
  process.exit(1);
});
