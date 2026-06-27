import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_CITY_CONFIG } from "./city-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnv(filePath) {
  try {
    return readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .reduce((acc, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return acc;
        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) return acc;
        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        acc[key] = value;
        return acc;
      }, {});
  } catch {
    return {};
  }
}

const env = {
  ...parseEnv(resolve(root, ".env")),
  ...parseEnv(resolve(root, "deploy/.env")),
};

const requiredEnv = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of requiredEnv) {
  if (!env[key]) {
    throw new Error(`Missing ${key} in .env or deploy/.env`);
  }
}

/** Tenant principal NorFood (produção). */
export const DEFAULT_TENANT_ID =
  process.env.NORFOOD_TENANT_ID ?? "a0000000-0000-4000-8000-000000000001";

export const seedMarker = "SEED_TRACKING_REALTIME";

export const adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const realtimeClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const seedUsers = {
  rider: {
    email: "seed.motoboy@abelhaemel.local",
    password: "SeedMoto123!",
    name: "Entregador Custodia Realtime",
    role: "motoboy",
    phone: "(87) 97777-1000",
  },
  customers: [
    {
      email: "seed.cliente1@abelhaemel.local",
      password: "SeedCliente123!",
      name: "Cliente Centro",
      phone: "(87) 97777-2001",
    },
    {
      email: "seed.cliente2@abelhaemel.local",
      password: "SeedCliente123!",
      name: "Cliente Redencao",
      phone: "(87) 97777-2002",
    },
    {
      email: "seed.cliente3@abelhaemel.local",
      password: "SeedCliente123!",
      name: "Cliente Pindoba",
      phone: "(87) 97777-2003",
    },
  ],
};

const customerLocations = SERVICE_CITY_CONFIG.neighborhoods.map((item) => ({
  latitude: item.latitude,
  longitude: item.longitude,
  neighborhood: item.name,
  address: item.exampleAddress,
  reference: item.reference,
  deliveryFee: item.deliveryFee,
}));

export async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

export async function deleteUserByEmail(email) {
  const user = await findUserByEmail(email);
  if (!user) return;

  const { error } = await adminClient.auth.admin.deleteUser(user.id);
  if (error) throw error;
}

export async function ensureUser({ email, password, name, phone, role = "cliente", metadata = {} }) {
  const userMetadata = { nome: name, telefone: phone, ...metadata };
  let user = await findUserByEmail(email);
  if (!user) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) {
      if (error.code !== "email_exists") throw error;
      user = await findUserByEmail(email);
      if (!user) throw error;
    } else {
      user = data.user;
    }
  } else {
    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: userMetadata,
    });
    if (error) throw error;
  }

  const { error: profileError } = await adminClient.from("profiles").upsert({
    id: user.id,
    nome: name,
    telefone: phone,
  });
  if (profileError) throw profileError;

  const { error: roleError } = await adminClient.from("user_roles").upsert(
    {
      user_id: user.id,
      role,
    },
    {
      onConflict: "user_id,role",
      ignoreDuplicates: true,
    },
  );
  if (roleError) throw roleError;

  return {
    id: user.id,
    email,
    name,
    phone,
    role,
  };
}

export async function ensureCategory(nome, tenantId = DEFAULT_TENANT_ID) {
  const { data: existing, error: selectError } = await adminClient
    .from("categorias")
    .select("id")
    .eq("nome", nome)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data, error } = await adminClient
    .from("categorias")
    .insert({ nome, emoji: "🚚", ordem: 999, ativo: true, tenant_id: tenantId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function ensureProduct({ categoriaId, nome, preco, destaque = false, tenantId = DEFAULT_TENANT_ID }) {
  const { data: existing, error: selectError } = await adminClient
    .from("produtos")
    .select("id")
    .eq("nome", nome)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data, error } = await adminClient
    .from("produtos")
    .insert({
      tenant_id: tenantId,
      categoria_id: categoriaId,
      nome,
      preco,
      destaque,
      ativo: true,
      descricao: `${seedMarker} ${nome}`,
      tempo_preparo_min: 15,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function cleanupSeedRows(riderId) {
  const { error: deleteLocationError } = await adminClient
    .from("entregadores_localizacao")
    .delete()
    .eq("entregador_id", riderId);
  if (deleteLocationError) throw deleteLocationError;

  const { error: deleteRiderRoutesError } = await adminClient
    .from("rotas_entrega")
    .delete()
    .eq("entregador_id", riderId);
  if (deleteRiderRoutesError) throw deleteRiderRoutesError;

  const { error: deleteRiderDeliveriesError } = await adminClient
    .from("entregas")
    .delete()
    .eq("motoboy_id", riderId);
  if (deleteRiderDeliveriesError) throw deleteRiderDeliveriesError;

  const { data: existingOrders, error: orderSelectError } = await adminClient
    .from("pedidos")
    .select("id")
    .ilike("observacoes", `%${seedMarker}%`);
  if (orderSelectError) throw orderSelectError;

  const orderIds = existingOrders.map((item) => item.id);

  if (orderIds.length) {
    const { error: deleteRoutesError } = await adminClient.from("rotas_entrega").delete().in("pedido_id", orderIds);
    if (deleteRoutesError) throw deleteRoutesError;

    const { error: deleteDeliveriesError } = await adminClient.from("entregas").delete().in("pedido_id", orderIds);
    if (deleteDeliveriesError) throw deleteDeliveriesError;

    const { error: deleteItemsError } = await adminClient.from("pedido_itens").delete().in("pedido_id", orderIds);
    if (deleteItemsError) throw deleteItemsError;

    const { error: deleteOrdersError } = await adminClient.from("pedidos").delete().in("id", orderIds);
    if (deleteOrdersError) throw deleteOrdersError;
  }
}

export async function cleanupRealtimeTrackingSeed() {
  const rider = await findUserByEmail(seedUsers.rider.email);
  if (rider) {
    await cleanupSeedRows(rider.id);
  }

  for (const customer of seedUsers.customers) {
    await deleteUserByEmail(customer.email);
  }

  await deleteUserByEmail(seedUsers.rider.email);
}

export async function seedRealtimeTrackingScenario() {
  const rider = await ensureUser({
    ...seedUsers.rider,
    metadata: {
      cep: SERVICE_CITY_CONFIG.cep,
      address: SERVICE_CITY_CONFIG.neighborhoods[0].exampleAddress,
      neighborhood: SERVICE_CITY_CONFIG.neighborhoods[0].name,
      city: SERVICE_CITY_CONFIG.city,
      stateCode: SERVICE_CITY_CONFIG.state,
      reference: SERVICE_CITY_CONFIG.neighborhoods[0].reference,
    },
  });
  const customers = [];

  for (const [index, customer] of seedUsers.customers.entries()) {
    const customerLocation = customerLocations[index];
    customers.push(
      await ensureUser({
        ...customer,
        metadata: {
          cep: SERVICE_CITY_CONFIG.cep,
          address: customerLocation.address,
          neighborhood: customerLocation.neighborhood,
          city: SERVICE_CITY_CONFIG.city,
          stateCode: SERVICE_CITY_CONFIG.state,
          reference: customerLocation.reference,
        },
      }),
    );
  }

  await cleanupSeedRows(rider.id);

  const categoriaId = await ensureCategory("Seed Tracking Realtime");
  const premiumProductId = await ensureProduct({
    categoriaId,
    nome: "Caixa Premium Seed",
    preco: 84.9,
    destaque: true,
  });
  const addonProductId = await ensureProduct({
    categoriaId,
    nome: "Mel Artesanal Seed",
    preco: 16.5,
  });

  const orderPayloads = customers.map((customer, index) => {
    const subtotal = 84.9 + 16.5 * (index + 1);
    const taxaEntrega = customerLocations[index].deliveryFee ?? SERVICE_CITY_CONFIG.defaultDeliveryFee;
    return {
      tenant_id: DEFAULT_TENANT_ID,
      canal: "delivery",
      cliente_id: customer.id,
      status: index === 0 ? "em_entrega" : "pronto",
      subtotal,
      desconto: 0,
      taxa_entrega: taxaEntrega,
      total: subtotal + taxaEntrega,
      forma_pagamento: index === 0 ? "pix" : "credito",
      endereco: customerLocations[index].address,
      observacoes: `${seedMarker} Pedido ${index + 1} - ${customerLocations[index].neighborhood}`,
      latitude_cliente: customerLocations[index].latitude,
      longitude_cliente: customerLocations[index].longitude,
      previsao_entrega: new Date(Date.now() + (15 + index * 8) * 60000).toISOString(),
      distancia_restante: Number((2.4 + index * 1.1).toFixed(1)),
    };
  });

  const { data: orders, error: orderInsertError } = await adminClient
    .from("pedidos")
    .insert(orderPayloads)
    .select("*");
  if (orderInsertError) throw orderInsertError;

  const itemPayloads = orders.flatMap((order, index) => [
    {
      pedido_id: order.id,
      produto_id: premiumProductId,
      quantidade: 1,
      preco_unitario: 84.9,
      observacao: `${seedMarker} item premium`,
    },
    {
      pedido_id: order.id,
      produto_id: addonProductId,
      quantidade: index + 1,
      preco_unitario: 16.5,
      observacao: `${seedMarker} item adicional`,
    },
  ]);

  const { error: itemInsertError } = await adminClient.from("pedido_itens").insert(itemPayloads);
  if (itemInsertError) throw itemInsertError;

  const deliveryPayloads = orders.map((order, index) => ({
    tenant_id: DEFAULT_TENANT_ID,
    pedido_id: order.id,
    motoboy_id: rider.id,
    status: index === 0 ? "pedido_retirado" : "aceito",
    endereco: order.endereco,
    bairro: customerLocations[index].neighborhood,
    distancia_km: Number((2.4 + index * 1.1).toFixed(1)),
    taxa: order.taxa_entrega,
  }));
  const { error: deliveryInsertError } = await adminClient.from("entregas").insert(deliveryPayloads);
  if (deliveryInsertError) throw deliveryInsertError;

  const routePayloads = orders.map((order, index) => ({
    entregador_id: rider.id,
    pedido_id: order.id,
    ordem_entrega: index + 1,
    distancia_km: Number((2.4 + index * 1.1).toFixed(1)),
    tempo_estimado: 15 + index * 8,
    status: index === 0 ? "em_rota" : "pendente",
  }));
  const { error: routeInsertError } = await adminClient.from("rotas_entrega").insert(routePayloads);
  if (routeInsertError) throw routeInsertError;

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
    {
      onConflict: "user_id",
    },
  );
  if (riderProfileError) throw riderProfileError;

  const { error: locationError } = await adminClient.from("entregadores_localizacao").upsert({
    entregador_id: rider.id,
    latitude: SERVICE_CITY_CONFIG.center.latitude,
    longitude: SERVICE_CITY_CONFIG.center.longitude,
    speed: 7.8,
    heading: 145,
    accuracy: 8,
    battery: 81,
    status: "em_rota",
    updated_at: new Date().toISOString(),
  });
  if (locationError) throw locationError;

  const { data: seededOrders, error: seededOrdersError } = await adminClient
    .from("pedidos")
    .select("id, numero, status, cliente_id, entregador_id, ordem_na_rota, previsao_entrega, distancia_restante")
    .ilike("observacoes", `%${seedMarker}%`)
    .order("ordem_na_rota", { ascending: true });
  if (seededOrdersError) throw seededOrdersError;

  return {
    rider,
    customers,
    orders: seededOrders,
    products: {
      premiumProductId,
      addonProductId,
    },
  };
}

export async function waitForRealtimeSubscription(channel) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscription timeout")), 10000);
    channel.subscribe((status, error) => {
      if (error) {
        clearTimeout(timeout);
        reject(error);
        return;
      }

      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

export async function createRealtimeClientSession(email, password) {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;

  return client;
}
