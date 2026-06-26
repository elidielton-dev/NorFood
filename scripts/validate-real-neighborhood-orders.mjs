import {
  adminClient,
  createRealtimeClientSession,
  ensureCategory,
  ensureProduct,
  ensureUser,
} from "./supabase-real-tracking-tools.mjs";
import { SERVICE_CITY_CONFIG } from "./city-config.mjs";

const marker = "SEED_CUSTODIA_BAIRROS_REAL";

async function cleanupNeighborhoodSeed() {
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
  const manager = await ensureUser({
    email: "seed.gestor.custodia@abelhaemel.local",
    password: "SeedGestorCustodia123!",
    name: "Gestor Custodia",
    phone: "(87) 97777-4001",
    role: "admin",
  });

  const rider = await ensureUser({
    email: "seed.motoboy.custodia@abelhaemel.local",
    password: "SeedMotoCustodia123!",
    name: "Entregador Custodia",
    phone: "(87) 97777-4002",
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

  await cleanupNeighborhoodSeed();

  const categoriaId = await ensureCategory("Seed Custodia Bairros");
  const productId = await ensureProduct({
    categoriaId,
    nome: "Caixa Validacao Custodia",
    preco: 49.9,
    destaque: true,
  });

  const seededOrders = [];
  const customerSessions = [];

  for (const [index, neighborhood] of SERVICE_CITY_CONFIG.neighborhoods.entries()) {
    const customer = await ensureUser({
      email: `seed.cliente.${index + 1}.custodia@abelhaemel.local`,
      password: "SeedClienteCustodia123!",
      name: `Cliente ${neighborhood.name}`,
      phone: `(87) 97777-41${String(index).padStart(2, "0")}`,
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

    const subtotal = 49.9 + index * 5;
    const taxaEntrega = neighborhood.deliveryFee;
    const trocoPara = 100 + index * 20;

    const { data: order, error: orderError } = await adminClient
      .from("pedidos")
      .insert({
        canal: "delivery",
        cliente_id: customer.id,
        entregador_id: rider.id,
        ordem_na_rota: index + 1,
        status: index === 0 ? "em_entrega" : "pronto",
        subtotal,
        desconto: 0,
        taxa_entrega: taxaEntrega,
        total: subtotal + taxaEntrega,
        forma_pagamento: "dinheiro",
        troco_para: trocoPara,
        endereco: neighborhood.exampleAddress,
        observacoes: `${marker} ${neighborhood.name}`,
        latitude_cliente: neighborhood.latitude,
        longitude_cliente: neighborhood.longitude,
        previsao_entrega: new Date(Date.now() + (12 + index * 7) * 60000).toISOString(),
        distancia_restante: Number((1.2 + index * 2.1).toFixed(1)),
      })
      .select("id, numero, cliente_id, taxa_entrega, troco_para, endereco, latitude_cliente, longitude_cliente, ordem_na_rota")
      .single();
    if (orderError) throw orderError;

    const { error: itemError } = await adminClient.from("pedido_itens").insert({
      pedido_id: order.id,
      produto_id: productId,
      quantidade: 1,
      preco_unitario: subtotal,
      observacao: `${marker} item`,
    });
    if (itemError) throw itemError;

    const { error: deliveryError } = await adminClient.from("entregas").insert({
      pedido_id: order.id,
      motoboy_id: rider.id,
      status: index === 0 ? "pedido_retirado" : "aceito",
      endereco: neighborhood.exampleAddress,
      bairro: neighborhood.name,
      distancia_km: Number((1.2 + index * 2.1).toFixed(1)),
      taxa: taxaEntrega,
    });
    if (deliveryError) throw deliveryError;

    const { error: routeError } = await adminClient.from("rotas_entrega").insert({
      entregador_id: rider.id,
      pedido_id: order.id,
      ordem_entrega: index + 1,
      distancia_km: Number((1.2 + index * 2.1).toFixed(1)),
      tempo_estimado: 12 + index * 7,
      status: index === 0 ? "em_rota" : "pendente",
    });
    if (routeError) throw routeError;

    const { error: financeError } = await adminClient.from("lancamentos_financeiros").insert({
      tipo: "entrada",
      descricao: `Pedido #${order.numero}`,
      categoria: "Vendas delivery",
      valor: subtotal + taxaEntrega,
      forma: "dinheiro",
      pedido_id: order.id,
    });
    if (financeError) throw financeError;

    seededOrders.push({ ...order, neighborhood: neighborhood.name, deliveryFee: taxaEntrega, customer });
    customerSessions.push(
      await createRealtimeClientSession(customer.email, "SeedClienteCustodia123!"),
    );
  }

  const { error: riderProfileError } = await adminClient.from("entregador_perfis").upsert(
    {
      user_id: rider.id,
      online: true,
      vehicle: "Moto",
      plate: "QTD5A64",
      support_phone: SERVICE_CITY_CONFIG.supportPhone,
      cep: SERVICE_CITY_CONFIG.cep,
      address: SERVICE_CITY_CONFIG.neighborhoods[0].exampleAddress,
      neighborhood: SERVICE_CITY_CONFIG.neighborhoods[0].name,
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
      speed: 7.5,
      heading: 118,
      accuracy: 6,
      battery: 88,
      status: "em_rota",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entregador_id" },
  );
  if (locationError) throw locationError;

  const managerClient = await createRealtimeClientSession(manager.email, "SeedGestorCustodia123!");

  for (const [index, order] of seededOrders.entries()) {
    const customerClient = customerSessions[index];
    const { data: customerOrder, error: customerOrderError } = await customerClient
      .from("pedidos")
      .select("id, numero, forma_pagamento, troco_para, taxa_entrega, ordem_na_rota, latitude_cliente, longitude_cliente")
      .eq("id", order.id)
      .single();
    if (customerOrderError) throw customerOrderError;

    if (customerOrder.forma_pagamento !== "dinheiro") {
      throw new Error(`Pedido do bairro ${order.neighborhood} nao manteve pagamento em dinheiro.`);
    }
    if (Number(customerOrder.troco_para) !== Number(order.troco_para)) {
      throw new Error(`Pedido do bairro ${order.neighborhood} nao manteve troco corretamente.`);
    }
    if (Number(customerOrder.taxa_entrega) !== order.deliveryFee) {
      throw new Error(`Taxa do bairro ${order.neighborhood} nao corresponde ao cadastro.`);
    }
    if (Number(customerOrder.latitude_cliente) !== order.latitude_cliente || Number(customerOrder.longitude_cliente) !== order.longitude_cliente) {
      throw new Error(`Coordenadas do bairro ${order.neighborhood} nao foram persistidas corretamente.`);
    }
  }

  const { data: managerOrders, error: managerOrdersError } = await managerClient
    .from("pedidos")
    .select("id, numero, forma_pagamento, troco_para, taxa_entrega, ordem_na_rota, endereco")
    .ilike("observacoes", `%${marker}%`)
    .order("ordem_na_rota", { ascending: true });
  if (managerOrdersError) throw managerOrdersError;

  const { data: managerDeliveries, error: managerDeliveriesError } = await managerClient
    .from("entregas")
    .select("pedido_id, bairro, motoboy_id")
    .in("pedido_id", seededOrders.map((item) => item.id));
  if (managerDeliveriesError) throw managerDeliveriesError;

  if ((managerOrders ?? []).length !== SERVICE_CITY_CONFIG.neighborhoods.length) {
    throw new Error("Painel do gestor nao conseguiu visualizar todos os pedidos por bairro.");
  }

  if ((managerDeliveries ?? []).length !== SERVICE_CITY_CONFIG.neighborhoods.length) {
    throw new Error("Painel do gestor nao conseguiu visualizar todas as entregas por bairro.");
  }

  console.log("VALIDACAO_BAIRROS_CUSTODIA_OK");
  console.log(
    JSON.stringify(
      {
        city: `${SERVICE_CITY_CONFIG.city}/${SERVICE_CITY_CONFIG.state}`,
        cep: SERVICE_CITY_CONFIG.cep,
        rider: { id: rider.id, email: rider.email },
        manager: { id: manager.id, email: manager.email },
        neighborhoods: seededOrders.map((order) => ({
          neighborhood: order.neighborhood,
          orderNumber: order.numero,
          deliveryFee: order.deliveryFee,
          cashChange: order.troco_para,
          routeOrder: order.ordem_na_rota,
          address: order.endereco,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("VALIDACAO_BAIRROS_CUSTODIA_FALHOU");
  console.error(error);
  process.exit(1);
});
