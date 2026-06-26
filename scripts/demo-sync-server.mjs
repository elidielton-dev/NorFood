import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICE_CITY_CONFIG } from "./city-config.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = dirname(__dirname);
const DATA_DIR = join(ROOT_DIR, ".demo-sync");
const DATA_FILE = join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT ?? process.env.DEMO_SYNC_PORT ?? 4318);
const DEFAULT_STORE = SERVICE_CITY_CONFIG.center;
const DEFAULT_CENTER_CUSTOMER = SERVICE_CITY_CONFIG.neighborhoods[0];
const DEFAULT_DISTRICT_CUSTOMER = SERVICE_CITY_CONFIG.neighborhoods[2];

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureDataFile() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, JSON.stringify(createSeedDatabase(), null, 2), "utf8");
  }
}

function readDb() {
  ensureDataFile();
  return JSON.parse(readFileSync(DATA_FILE, "utf8"));
}

function writeDb(db) {
  ensureDataFile();
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

function mutateDb(updater) {
  const db = readDb();
  const result = updater(db);
  writeDb(db);
  return result;
}

function json(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(payload));
}

function notFound(response) {
  json(response, 404, { error: "not_found" });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function formatPhoneForLink(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

function defaultTimeline(baseTime = new Date()) {
  const start = baseTime.getTime();
  const at = (minutes) =>
    new Date(start + minutes * 60000).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return [
    {
      step: "confirmed",
      title: "Pedido confirmado",
      description: "O pedido foi recebido pela loja.",
      time: at(0),
    },
    {
      step: "preparing",
      title: "Em preparo",
      description: "Seu pedido esta sendo preparado.",
      time: at(5),
    },
    {
      step: "on_route",
      title: "Saiu para entrega",
      description: "O entregador esta a caminho.",
      time: at(14),
    },
    {
      step: "arrived",
      title: "Cheguei ao cliente",
      description: "Aguardando confirmacao no local.",
      time: at(22),
    },
    {
      step: "delivered",
      title: "Entregue",
      description: "Entrega finalizada com sucesso.",
      time: at(27),
    },
  ];
}

function mapPedidoStatusToDelivery(status) {
  if (status === "entregue") return "completed";
  if (status === "em_entrega" || status === "pronto") return "available";
  return "pending";
}

function mapRouteStageToCurrentStep(routeStage, pedidoStatus) {
  if (routeStage === "delivered") return "delivered";
  if (routeStage === "arrived_customer") return "arrived";
  if (routeStage === "picked_up") return "on_route";
  if (pedidoStatus === "em_preparo") return "preparing";
  return "confirmed";
}

function getQueueForRider(db, riderId) {
  return [...db.entregas]
    .filter((item) => item.motoboy_id === riderId && item.status !== "entregue" && item.status !== "cancelado")
    .sort((a, b) => Number(a.ordem_na_rota ?? 999) - Number(b.ordem_na_rota ?? 999));
}

function mapEntregaToMobile(entrega, db) {
  const pedido = db.pedidos.find((item) => item.id === entrega.pedido_id);
  const rider = entrega.motoboy_id
    ? db.riders.find((item) => item.id === entrega.motoboy_id) ?? null
    : null;
  const queue = entrega.motoboy_id ? getQueueForRider(db, entrega.motoboy_id) : [];
  const itens = db.pedido_itens
    .filter((item) => item.pedido_id === entrega.pedido_id)
    .map((item) => {
      const produto = db.produtos.find((product) => product.id === item.produto_id);
      return `${item.quantidade}x ${produto?.nome ?? "Produto"}`;
    });

  const routeStage = entrega.route_stage ?? "assigned";
  const currentStep = mapRouteStageToCurrentStep(routeStage, pedido?.status);
  const deliveriesAhead = Math.max(Number(entrega.ordem_na_rota ?? 1) - 1, 0);

  return {
    id: entrega.id,
    number: `#${pedido?.numero ?? "---"}`,
    customer: pedido?.cliente_nome ?? "Cliente Abelha & Mel",
    phone: pedido?.cliente_telefone ?? "(11) 90000-0000",
    whatsapp: pedido?.cliente_whatsapp ?? pedido?.cliente_telefone ?? "(11) 90000-0000",
    address: entrega.endereco,
    neighborhood: entrega.bairro ?? "Raio local",
    city: entrega.cidade ?? `${SERVICE_CITY_CONFIG.city}/${SERVICE_CITY_CONFIG.state}`,
    reference: entrega.referencia ?? "Proximo a um ponto conhecido.",
    distanceKm: Number(entrega.distancia_km ?? 0),
    fee: Number(entrega.taxa ?? 0),
    eta: entrega.previsao_horario ?? "00:00",
    etaMinutes: Number(entrega.eta_minutos ?? 0),
    items: itens,
    totalItems: itens.length,
    status:
      entrega.status === "entregue"
        ? "completed"
        : ["aceito", "indo_loja", "na_loja", "pedido_retirado", "em_rota", "chegou_cliente"].includes(entrega.status)
          ? "in_progress"
        : "available",
    badgeLabel:
      entrega.status === "entregue"
        ? "Finalizada"
        : ["aceito", "indo_loja", "na_loja", "pedido_retirado", "em_rota", "chegou_cliente"].includes(entrega.status)
          ? "Em andamento"
          : "Disponivel",
    currentStep,
    routeStage,
    timeline: entrega.timeline ?? defaultTimeline(new Date(entrega.created_at)),
    riderName: rider?.name ?? null,
    orderInRoute: Number(entrega.ordem_na_rota ?? (queue.findIndex((item) => item.id === entrega.id) + 1 || 1)),
    deliveriesAhead,
    customerLatitude: Number(entrega.latitude_cliente ?? DEFAULT_CENTER_CUSTOMER.latitude),
    customerLongitude: Number(entrega.longitude_cliente ?? DEFAULT_CENTER_CUSTOMER.longitude),
  };
}

function buildEarnings(db, riderId) {
  const riderRepasse = db.repasses.filter((item) => item.riderId === riderId);
  const totals = riderRepasse.reduce(
    (acc, item) => {
      acc.today += item.period === "today" ? item.amount : 0;
      acc.week += item.period === "week" || item.period === "today" ? item.amount : 0;
      acc.month += item.amount;
      acc.fees += item.kind === "fee" ? item.amount : 0;
      acc.additions += item.kind === "addition" ? item.amount : 0;
      acc.bonus += item.kind === "bonus" ? item.amount : 0;
      acc.discounts += item.kind === "discount" ? item.amount : 0;
      return acc;
    },
    { today: 0, week: 0, month: 0, fees: 0, additions: 0, bonus: 0, discounts: 0 },
  );

  return {
    today: Number(totals.today.toFixed(2)),
    week: Number(totals.week.toFixed(2)),
    month: Number(totals.month.toFixed(2)),
    fees: Number(totals.fees.toFixed(2)),
    distance: 18.5,
    additions: Number(totals.additions.toFixed(2)),
    bonus: Number(totals.bonus.toFixed(2)),
    discounts: Number(totals.discounts.toFixed(2)),
    chart: [
      { label: "Seg", value: 96 },
      { label: "Ter", value: 120 },
      { label: "Qua", value: 108 },
      { label: "Qui", value: 143 },
      { label: "Sex", value: Number(totals.today.toFixed(2)) || 158.8 },
      { label: "Sab", value: 188 },
      { label: "Dom", value: 132 },
    ],
  };
}

function buildRiderAppState(db, riderId) {
  const rider = db.riders.find((item) => item.id === riderId) ?? db.riders[0];
  const deliveries = db.entregas
    .filter(
      (item) =>
        item.status === "disponivel" ||
        item.motoboy_id === rider.id ||
        item.status === "entregue",
    )
    .map((item) => mapEntregaToMobile(item, db))
    .sort((a, b) => b.id.localeCompare(a.id));

  const incidents = db.incidents
    .filter((item) => item.riderId === rider.id)
    .sort((a, b) => `${b.createdAt}`.localeCompare(`${a.createdAt}`));

  const messages = db.messages
    .filter((item) => item.riderId === rider.id)
    .sort((a, b) => `${b.createdAt}`.localeCompare(`${a.createdAt}`));

  const notifications = db.notifications
    .filter((item) => item.riderId === rider.id || item.riderId == null)
    .sort((a, b) => `${b.createdAt}`.localeCompare(`${a.createdAt}`));

  return {
    rider,
    deliveries,
    incidents,
    messages,
    notifications,
    earnings: buildEarnings(db, rider.id),
    loggedIn: true,
    rememberLogin: true,
  };
}

function createNotification(db, payload) {
  db.notifications.unshift({
    id: createId("not"),
    createdAt: nowIso(),
    readAt: null,
    ...payload,
  });
}

function syncPedidoStatusFromEntrega(db, entrega) {
  const pedido = db.pedidos.find((item) => item.id === entrega.pedido_id);
  if (!pedido) return;

  if (entrega.status === "entregue") {
    pedido.status = "entregue";
  } else if (
    ["pedido_retirado", "em_rota", "chegou_cliente"].includes(entrega.status)
  ) {
    pedido.status = "em_entrega";
  } else if (["disponivel", "aceito", "indo_loja", "na_loja"].includes(entrega.status)) {
    pedido.status = "pronto";
  }
  pedido.entregador_id = entrega.motoboy_id ?? null;
  pedido.ordem_na_rota = entrega.ordem_na_rota ?? null;
  pedido.previsao_entrega = new Date(Date.now() + Number(entrega.eta_minutos ?? 0) * 60000).toISOString();
  pedido.distancia_restante = Number(entrega.distance_remaining_km ?? entrega.distancia_km ?? 0);
  pedido.latitude_cliente = Number(entrega.latitude_cliente ?? DEFAULT_CENTER_CUSTOMER.latitude);
  pedido.longitude_cliente = Number(entrega.longitude_cliente ?? DEFAULT_CENTER_CUSTOMER.longitude);
  pedido.updated_at = nowIso();
}

function buildOrderTrackingSnapshot(db, orderId) {
  const pedido = db.pedidos.find((item) => item.id === orderId);
  if (!pedido) return null;
  const entrega = db.entregas.find((item) => item.pedido_id === pedido.id);
  if (!entrega) return null;
  const rider = entrega.motoboy_id
    ? db.riders.find((item) => item.id === entrega.motoboy_id) ?? null
    : null;
  const route = [
    { latitude: DEFAULT_STORE.latitude, longitude: DEFAULT_STORE.longitude },
    ...(entrega.route_history ?? []).map((item) => ({
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
    })),
    {
      latitude: Number(entrega.latitude_cliente ?? DEFAULT_CENTER_CUSTOMER.latitude),
      longitude: Number(entrega.longitude_cliente ?? DEFAULT_CENTER_CUSTOMER.longitude),
    },
  ];

  return {
    orderId: pedido.id,
    orderNumber: pedido.numero,
    status:
      entrega.status === "entregue"
        ? "entregue"
        : entrega.status === "chegou_cliente"
          ? "chegando"
          : entrega.status === "pedido_retirado" || entrega.status === "em_rota"
            ? "em_rota"
            : pedido.status === "pronto"
              ? "pronto"
              : pedido.status === "em_preparo"
                ? "em_preparo"
                : "pedido_recebido",
    riderId: entrega.motoboy_id,
    riderName: rider?.name ?? "Aguardando atribuicao",
    riderStatus: entrega.rider_location?.status ?? (rider?.online ? "online" : "offline"),
    updatedAt: entrega.updated_at,
    etaMinutes: Number(entrega.eta_minutos ?? 0),
    remainingKm: Number(entrega.distance_remaining_km ?? entrega.distancia_km ?? 0),
    deliveriesAhead: Math.max(Number(entrega.ordem_na_rota ?? 1) - 1, 0),
    queueMessage:
      Number(entrega.ordem_na_rota ?? 1) <= 1
        ? "Voce e a proxima entrega."
        : `Seu entregador possui ${Math.max(Number(entrega.ordem_na_rota ?? 1) - 1, 0)} entregas antes da sua.`,
    routeIndex: Math.max(route.length - 2, 0),
    store: { latitude: DEFAULT_STORE.latitude, longitude: DEFAULT_STORE.longitude },
    customer: {
      latitude: Number(entrega.latitude_cliente ?? DEFAULT_CENTER_CUSTOMER.latitude),
      longitude: Number(entrega.longitude_cliente ?? DEFAULT_CENTER_CUSTOMER.longitude),
    },
    rider: {
      latitude: Number(entrega.rider_location?.latitude ?? DEFAULT_STORE.latitude),
      longitude: Number(entrega.rider_location?.longitude ?? DEFAULT_STORE.longitude),
    },
    route,
    completedRoute: route.slice(0, Math.max(route.length - 1, 1)),
  };
}

function buildFleetTrackingSnapshot(db) {
  const snapshots = db.entregas
    .map((item) => buildOrderTrackingSnapshot(db, item.pedido_id))
    .filter(Boolean);
  const riderMap = new Map();

  for (const snapshot of snapshots) {
    const riderId = snapshot.riderId ?? `unassigned-${snapshot.orderId}`;
    const current = riderMap.get(riderId);
    if (current) {
      current.activeDeliveries += 1;
      continue;
    }
    riderMap.set(riderId, {
      id: riderId,
      name: snapshot.riderName,
      photo: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(snapshot.riderName)}`,
      status: snapshot.riderStatus,
      speedKmh: 24,
      updatedAt: snapshot.updatedAt,
      battery: 82,
      activeDeliveries: 1,
      deliveriesAhead: snapshot.deliveriesAhead,
      location: snapshot.rider,
      route: snapshot.route,
      completedRoute: snapshot.completedRoute,
    });
  }

  return { riders: [...riderMap.values()] };
}

function createSeedDatabase() {
  const createdAt = nowIso();

  const categorias = [
    { id: "cat-bolos", nome: "Bolos", emoji: "B", ordem: 1, ativo: true },
    { id: "cat-brigadeiros", nome: "Brigadeiros", emoji: "G", ordem: 2, ativo: true },
    { id: "cat-tortas", nome: "Tortas", emoji: "T", ordem: 3, ativo: true },
  ];

  const produtos = [
    {
      id: "prod-1",
      categoria_id: "cat-bolos",
      nome: "Bolo de Mel Premium",
      descricao: "Bolo artesanal com cobertura de mel.",
      preco: 84.9,
      imagem_url: null,
      tempo_preparo_min: 20,
      calorias: 420,
      destaque: true,
      ativo: true,
      estoque: 12,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: "prod-2",
      categoria_id: "cat-brigadeiros",
      nome: "Brigadeiro Gold",
      descricao: "Brigadeiro gourmet com granulado belga.",
      preco: 6.5,
      imagem_url: null,
      tempo_preparo_min: 5,
      calorias: 125,
      destaque: true,
      ativo: true,
      estoque: 80,
      created_at: createdAt,
      updated_at: createdAt,
    },
    {
      id: "prod-3",
      categoria_id: "cat-tortas",
      nome: "Torta de Limao Siciliano",
      descricao: "Torta gelada com merengue maçaricado.",
      preco: 18.9,
      imagem_url: null,
      tempo_preparo_min: 12,
      calorias: 280,
      destaque: false,
      ativo: true,
      estoque: 18,
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  const mesas = Array.from({ length: 6 }, (_, index) => ({
    id: `mesa-${index + 1}`,
    numero: index + 1,
    capacidade: index < 3 ? 4 : 6,
    status: index === 1 ? "ocupada" : "livre",
    qrcode_token: `qr-mesa-${index + 1}`,
    created_at: createdAt,
  }));

  const profiles = [
    { id: "cli-1", nome: "Mariana Costa", telefone: "(11) 99999-0001", email: "mariana@abelhaemel.local", pontos_fidelidade: 185, created_at: createdAt, updated_at: createdAt },
    { id: "cli-2", nome: "Paulo Henrique", telefone: "(11) 99999-0002", email: "paulo@abelhaemel.local", pontos_fidelidade: 120, created_at: createdAt, updated_at: createdAt },
  ];

  const riders = [
    {
      id: "demo-motoboy",
      name: "Joao da Silva",
      shortName: "Joao",
      phone: "(11) 99999-9999",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
      score: 4.9,
      vehicle: "Honda CG 160",
      plate: "ARC-1234",
      online: true,
      completedCount: 127,
      successRate: 96,
      greeting: "Bom dia, entregador!",
      email: "joao@abelhaemel.local",
      cep: SERVICE_CITY_CONFIG.cep,
      address: "Rua Jose Estrela, 123",
      neighborhood: "Centro",
      city: SERVICE_CITY_CONFIG.city,
      state: SERVICE_CITY_CONFIG.state,
      emergencyPhone: SERVICE_CITY_CONFIG.supportPhone,
      pixKey: "joao@abelhaemel.local",
      supportPhone: SERVICE_CITY_CONFIG.supportPhone,
      documents: {
        cnh: "00011122233",
        cnhExpiry: "2028-05-10",
        vehicleDocument: "CRLV digital validado",
      },
      settings: {
        darkModeReady: true,
        notifyNewOrders: true,
        notifyOccurrences: true,
        autoOnlineAfterLogin: true,
      },
    },
  ];

  const pedidos = [
    {
      id: "ped-1001",
      numero: 1001,
      cliente_id: "cli-1",
      cliente_nome: "Ana Carolina Silva",
      cliente_telefone: "(11) 98765-4321",
      cliente_whatsapp: "(11) 98765-4321",
      mesa_id: null,
      canal: "delivery",
      status: "pronto",
      subtotal: 58.3,
      desconto: 0,
      taxa_entrega: 5,
      total: 63.3,
      forma_pagamento: "pix",
      endereco: "Rua das Flores, 123",
      referencia: "Proximo a padaria Bella Paulista",
      bairro: DEFAULT_CENTER_CUSTOMER.name,
      observacoes: "Sem canela",
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  const pedido_itens = [
    { id: "item-1", pedido_id: "ped-1001", produto_id: "prod-1", quantidade: 1, preco_unitario: 84.9, observacao: null, created_at: createdAt },
    { id: "item-2", pedido_id: "ped-1001", produto_id: "prod-2", quantidade: 2, preco_unitario: 6.5, observacao: null, created_at: createdAt },
  ];

  const entregas = [
    {
      id: "ent-1001",
      pedido_id: "ped-1001",
      motoboy_id: null,
      status: "disponivel",
      route_stage: "assigned",
      ordem_na_rota: 1,
      endereco: "Rua das Flores, 123",
      referencia: "Proximo a padaria Bella Paulista",
      bairro: DEFAULT_CENTER_CUSTOMER.name,
      cidade: `${SERVICE_CITY_CONFIG.city}/${SERVICE_CITY_CONFIG.state}`,
      distancia_km: 1.2,
      distance_remaining_km: 1.2,
      taxa: 5,
      previsao_horario: "10:30",
      eta_minutos: 18,
      latitude_cliente: DEFAULT_CENTER_CUSTOMER.latitude,
      longitude_cliente: DEFAULT_CENTER_CUSTOMER.longitude,
      rider_location: {
        latitude: DEFAULT_STORE.latitude,
        longitude: DEFAULT_STORE.longitude,
        speed: 0,
        heading: 0,
        accuracy: 8,
        battery: 87,
        status: "online",
        updated_at: createdAt,
      },
      route_history: [
        { latitude: DEFAULT_STORE.latitude, longitude: DEFAULT_STORE.longitude, recorded_at: createdAt },
      ],
      saiu_em: null,
      entregue_em: null,
      timeline: defaultTimeline(new Date()),
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];

  const lancamentos_financeiros = [
    { id: "fin-1", tipo: "entrada", descricao: "Pedido #1001", categoria: "Vendas Delivery", valor: 63.3, forma: "pix", pedido_id: "ped-1001", data: todayDate(), created_at: createdAt },
  ];

  const cupons = [
    { id: "cup-1", codigo: "MEL10", descricao: "10% na primeira compra", desconto_percentual: 10, desconto_valor: null, valido_ate: null, ativo: true, usos: 6, usos_maximos: null, created_at: createdAt },
  ];

  const notifications = [
    {
      id: "not-seed-1",
      riderId: null,
      title: "Pedido pronto para entrega",
      body: "O pedido #1001 ja pode ser aceito no app do entregador.",
      type: "delivery_ready",
      deliveryId: "ent-1001",
      createdAt: createdAt,
      readAt: null,
    },
  ];

  const repasses = [
    { id: "rep-1", riderId: "demo-motoboy", amount: 132, kind: "fee", period: "month", createdAt: createdAt },
    { id: "rep-2", riderId: "demo-motoboy", amount: 8, kind: "addition", period: "today", createdAt: createdAt },
    { id: "rep-3", riderId: "demo-motoboy", amount: 18, kind: "bonus", period: "today", createdAt: createdAt },
  ];

  return {
    categorias,
    produtos,
    mesas,
    pedidos,
    pedido_itens,
    entregas,
    lancamentos_financeiros,
    cupons,
    profiles,
    riders,
    notifications,
    incidents: [],
    messages: [],
    repasses,
  };
}

async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    json(response, 204, {});
    return;
  }

  if (request.method === "GET" && path === "/health") {
    json(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && path === "/reset") {
    writeDb(createSeedDatabase());
    json(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && path === "/demo/catalog") {
    const db = readDb();
    json(response, 200, { categorias: db.categorias, produtos: db.produtos });
    return;
  }

  if (request.method === "GET" && path === "/demo/mesas") {
    json(response, 200, readDb().mesas);
    return;
  }

  if (request.method === "GET" && path === "/demo/clientes") {
    json(response, 200, readDb().profiles);
    return;
  }

  if (request.method === "GET" && path === "/demo/cupons") {
    json(response, 200, readDb().cupons);
    return;
  }

  if (request.method === "GET" && path === "/demo/financeiro") {
    json(response, 200, readDb().lancamentos_financeiros);
    return;
  }

  if (request.method === "GET" && path === "/demo/pedidos") {
    const db = readDb();
    const pedidos = [...db.pedidos].sort((a, b) => `${b.created_at}`.localeCompare(`${a.created_at}`));
    json(response, 200, pedidos);
    return;
  }

  if (request.method === "GET" && path === "/demo/pedido-itens") {
    const pedidoId = url.searchParams.get("pedidoId");
    const db = readDb();
    const itens = db.pedido_itens
      .filter((item) => item.pedido_id === pedidoId)
      .map((item) => ({
        ...item,
        produtos: {
          nome: db.produtos.find((product) => product.id === item.produto_id)?.nome ?? "Produto",
        },
      }));
    json(response, 200, itens);
    return;
  }

  if (request.method === "GET" && path === "/demo/entregas") {
    const db = readDb();
    json(response, 200, [...db.entregas].sort((a, b) => `${b.created_at}`.localeCompare(`${a.created_at}`)));
    return;
  }

  if (request.method === "GET" && path === "/demo/tracking/order") {
    const orderId = url.searchParams.get("orderId");
    const snapshot = buildOrderTrackingSnapshot(readDb(), orderId);
    if (!snapshot) {
      notFound(response);
      return;
    }
    json(response, 200, snapshot);
    return;
  }

  if (request.method === "GET" && path === "/demo/tracking/fleet") {
    json(response, 200, buildFleetTrackingSnapshot(readDb()));
    return;
  }

  if (request.method === "POST" && path === "/demo/pedidos") {
    const body = await readBody(request);
    const createdAt = nowIso();
    const pedido = mutateDb((db) => {
      const subtotal = (body.itens ?? []).reduce(
        (sum, item) => sum + Number(item.preco_unitario) * Number(item.quantidade),
        0,
      );
      const taxaEntrega = body.canal === "delivery" ? Number(body.taxa_entrega ?? 5) : 0;
      const numero = Math.max(1000, ...db.pedidos.map((item) => Number(item.numero))) + 1;
      const existingProfile = db.profiles.find((item) => item.id === body.cliente_id);
      const customerProfile =
        existingProfile ??
        {
          id: body.cliente_id ?? createId("cli"),
          nome: body.customerName ?? "Cliente delivery",
          telefone: body.customerPhone ?? "(11) 99999-0000",
          email: body.customerEmail ?? null,
          pontos_fidelidade: 0,
          created_at: createdAt,
          updated_at: createdAt,
        };

      if (!existingProfile) {
        db.profiles.unshift(customerProfile);
      } else {
        existingProfile.nome = body.customerName ?? existingProfile.nome;
        existingProfile.telefone = body.customerPhone ?? existingProfile.telefone;
        existingProfile.email = body.customerEmail ?? existingProfile.email ?? null;
        existingProfile.updated_at = createdAt;
      }

      const pedidoRecord = {
        id: createId("ped"),
        numero,
        cliente_id: customerProfile.id,
        cliente_nome: body.customerName ?? "Cliente delivery",
        cliente_telefone: body.customerPhone ?? "(11) 99999-0000",
        cliente_whatsapp: body.customerPhone ?? "(11) 99999-0000",
        mesa_id: body.mesa_id ?? null,
        canal: body.canal,
        status: "aberto",
        subtotal,
        desconto: 0,
        taxa_entrega: taxaEntrega,
        total: subtotal + taxaEntrega,
        forma_pagamento: body.forma_pagamento ?? "pix",
        endereco: body.endereco ?? "Endereco nao informado",
        referencia: body.reference ?? "Sem referencia",
        bairro: body.bairro ?? "Raio local",
        observacoes: body.observacoes ?? "",
        created_at: createdAt,
        updated_at: createdAt,
      };
      db.pedidos.unshift(pedidoRecord);
      for (const item of body.itens ?? []) {
        db.pedido_itens.unshift({
          id: createId("item"),
          pedido_id: pedidoRecord.id,
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          observacao: null,
          created_at: createdAt,
        });
      }
      if (pedidoRecord.canal === "delivery") {
        db.entregas.unshift({
          id: createId("ent"),
          pedido_id: pedidoRecord.id,
          motoboy_id: null,
          status: "pendente",
          route_stage: "assigned",
          ordem_na_rota: null,
          endereco: pedidoRecord.endereco,
          referencia: pedidoRecord.referencia,
          bairro: pedidoRecord.bairro,
          cidade: body.city ?? `${SERVICE_CITY_CONFIG.city}/${SERVICE_CITY_CONFIG.state}`,
          distancia_km: 2.4,
          distance_remaining_km: 2.4,
          taxa: taxaEntrega,
          previsao_horario: new Date(Date.now() + 25 * 60000).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          eta_minutos: 25,
          latitude_cliente: body.latitude_cliente ?? DEFAULT_DISTRICT_CUSTOMER.latitude,
          longitude_cliente: body.longitude_cliente ?? DEFAULT_DISTRICT_CUSTOMER.longitude,
          rider_location: {
            latitude: DEFAULT_STORE.latitude,
            longitude: DEFAULT_STORE.longitude,
            speed: 0,
            heading: 0,
            accuracy: 8,
            battery: 92,
            status: "online",
            updated_at: createdAt,
          },
          route_history: [
            { latitude: DEFAULT_STORE.latitude, longitude: DEFAULT_STORE.longitude, recorded_at: createdAt },
          ],
          saiu_em: null,
          entregue_em: null,
          timeline: defaultTimeline(new Date()),
          created_at: createdAt,
          updated_at: createdAt,
        });
      }
      db.lancamentos_financeiros.unshift({
        id: createId("fin"),
        tipo: "entrada",
        descricao: `Pedido #${numero}`,
        categoria: `Vendas ${body.canal}`,
        valor: subtotal + taxaEntrega,
        forma: body.forma_pagamento ?? "pix",
        pedido_id: pedidoRecord.id,
        data: todayDate(),
        created_at: createdAt,
      });
      return pedidoRecord;
    });

    json(response, 201, pedido);
    return;
  }

  if (request.method === "PATCH" && /^\/demo\/pedidos\/[^/]+\/status$/.test(path)) {
    const pedidoId = path.split("/")[3];
    const body = await readBody(request);
    const updated = mutateDb((db) => {
      const pedido = db.pedidos.find((item) => item.id === pedidoId);
      if (!pedido) return null;
      pedido.status = body.status;
      pedido.updated_at = nowIso();

      const entrega = db.entregas.find((item) => item.pedido_id === pedidoId);
      if (entrega) {
        if (body.status === "pronto" || body.status === "em_entrega") {
          entrega.status = "disponivel";
          entrega.updated_at = nowIso();
          createNotification(db, {
            riderId: null,
            type: "delivery_ready",
            deliveryId: entrega.id,
            title: "Pedido pronto para entrega",
            body: `O pedido #${pedido.numero} esta pronto e aguardando aceite.`,
          });
        }
        if (body.status === "cancelado") {
          entrega.status = "cancelado";
          entrega.updated_at = nowIso();
        }
      }

      return pedido;
    });

    if (!updated) {
      notFound(response);
      return;
    }

    json(response, 200, updated);
    return;
  }

  if (request.method === "PATCH" && /^\/demo\/mesas\/[^/]+\/status$/.test(path)) {
    const mesaId = path.split("/")[3];
    const body = await readBody(request);
    const updated = mutateDb((db) => {
      const mesa = db.mesas.find((item) => item.id === mesaId);
      if (!mesa) return null;
      mesa.status = body.status;
      return mesa;
    });
    if (!updated) {
      notFound(response);
      return;
    }
    json(response, 200, updated);
    return;
  }

  if (request.method === "POST" && path === "/demo/lancamentos") {
    const body = await readBody(request);
    const created = mutateDb((db) => {
      const record = {
        id: createId("fin"),
        tipo: body.tipo,
        descricao: body.descricao,
        categoria: body.categoria ?? null,
        valor: body.valor,
        forma: body.forma ?? null,
        pedido_id: body.pedido_id ?? null,
        data: todayDate(),
        created_at: nowIso(),
      };
      db.lancamentos_financeiros.unshift(record);
      return record;
    });
    json(response, 201, created);
    return;
  }

  if (request.method === "POST" && path === "/demo/produtos") {
    const body = await readBody(request);
    const created = mutateDb((db) => {
      const product = {
        id: createId("prod"),
        categoria_id: null,
        nome: body.nome,
        descricao: null,
        preco: body.preco,
        imagem_url: null,
        tempo_preparo_min: 10,
        calorias: null,
        destaque: false,
        ativo: true,
        estoque: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      db.produtos.unshift(product);
      return product;
    });
    json(response, 201, created);
    return;
  }

  if (request.method === "PATCH" && /^\/demo\/produtos\/[^/]+\/toggle$/.test(path)) {
    const productId = path.split("/")[3];
    const body = await readBody(request);
    const updated = mutateDb((db) => {
      const product = db.produtos.find((item) => item.id === productId);
      if (!product) return null;
      product.ativo = !body.ativo;
      product.updated_at = nowIso();
      return product;
    });
    if (!updated) {
      notFound(response);
      return;
    }
    json(response, 200, updated);
    return;
  }

  if (request.method === "POST" && path === "/demo/cupons") {
    const body = await readBody(request);
    const created = mutateDb((db) => {
      const cupom = {
        id: createId("cup"),
        codigo: body.codigo,
        descricao: body.descricao ?? body.codigo,
        desconto_percentual: body.desconto_percentual ?? null,
        desconto_valor: body.desconto_valor ?? null,
        valido_ate: null,
        ativo: true,
        usos: 0,
        usos_maximos: null,
        created_at: nowIso(),
      };
      db.cupons.unshift(cupom);
      return cupom;
    });
    json(response, 201, created);
    return;
  }

  if (request.method === "PATCH" && /^\/demo\/entregas\/[^/]+\/accept$/.test(path)) {
    const entregaId = path.split("/")[3];
    const body = await readBody(request);
    const updated = mutateDb((db) => {
      const entrega = db.entregas.find((item) => item.id === entregaId);
      if (!entrega) return null;
      const queueForRider = getQueueForRider(db, body.riderId ?? "demo-motoboy");
      entrega.status = "aceito";
      entrega.route_stage = "assigned";
      entrega.motoboy_id = body.riderId ?? "demo-motoboy";
      entrega.ordem_na_rota = queueForRider.length + 1;
      entrega.saiu_em = nowIso();
      entrega.updated_at = nowIso();
      syncPedidoStatusFromEntrega(db, entrega);
      createNotification(db, {
        riderId: entrega.motoboy_id,
        type: "delivery_assigned",
        deliveryId: entrega.id,
        title: "Entrega aceita",
        body: "A rota foi atribuida. Siga para a loja e confirme a chegada.",
      });
      return entrega;
    });

    if (!updated) {
      notFound(response);
      return;
    }

    json(response, 200, updated);
    return;
  }

  if (request.method === "PATCH" && /^\/demo\/entregas\/[^/]+\/advance$/.test(path)) {
    const entregaId = path.split("/")[3];
    const body = await readBody(request);
    const updated = mutateDb((db) => {
      const entrega = db.entregas.find((item) => item.id === entregaId);
      if (!entrega) return null;
      const nextStep = body.step;
      if (nextStep === "arrived_store") {
        entrega.status = "na_loja";
        entrega.route_stage = "arrived_store";
      }
      if (nextStep === "picked_up") {
        entrega.status = "pedido_retirado";
        entrega.route_stage = "picked_up";
      }
      if (nextStep === "arrived_customer") {
        entrega.status = "chegou_cliente";
        entrega.route_stage = "arrived_customer";
      }
      if (nextStep === "delivered") {
        entrega.status = "entregue";
        entrega.route_stage = "delivered";
        entrega.entregue_em = nowIso();
        const riderQueue = getQueueForRider(db, entrega.motoboy_id);
        riderQueue
          .filter((item) => item.id !== entrega.id && Number(item.ordem_na_rota ?? 999) > Number(entrega.ordem_na_rota ?? 999))
          .forEach((item) => {
            item.ordem_na_rota = Math.max(Number(item.ordem_na_rota ?? 1) - 1, 1);
            syncPedidoStatusFromEntrega(db, item);
          });
      }
      entrega.updated_at = nowIso();
      syncPedidoStatusFromEntrega(db, entrega);
      createNotification(db, {
        riderId: entrega.motoboy_id,
        type: "delivery_progress",
        deliveryId: entrega.id,
        title: nextStep === "delivered" ? "Entrega concluida" : "Status atualizado",
        body:
          nextStep === "arrived_store"
            ? "Voce marcou chegada na loja."
            : nextStep === "picked_up"
              ? "Pedido retirado e rota iniciada."
              : nextStep === "arrived_customer"
                ? "Voce marcou que chegou ao cliente."
            : nextStep === "delivered"
              ? "Pedido entregue com sucesso."
              : "Etapa da entrega atualizada.",
      });
      return entrega;
    });
    if (!updated) {
      notFound(response);
      return;
    }
    json(response, 200, updated);
    return;
  }

  if (request.method === "POST" && /^\/demo\/entregas\/[^/]+\/location$/.test(path)) {
    const entregaId = path.split("/")[3];
    const body = await readBody(request);
    const updated = mutateDb((db) => {
      const entrega = db.entregas.find((item) => item.id === entregaId);
      if (!entrega) return null;

      entrega.rider_location = {
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        speed: body.speed ?? 0,
        heading: body.heading ?? 0,
        accuracy: body.accuracy ?? 0,
        battery: body.battery ?? null,
        status: body.status ?? "em_rota",
        updated_at: nowIso(),
      };
      entrega.route_history = [
        ...(entrega.route_history ?? []),
        {
          latitude: Number(body.latitude),
          longitude: Number(body.longitude),
          recorded_at: nowIso(),
        },
      ].slice(-120);
      entrega.distance_remaining_km = Math.max(Number(entrega.distance_remaining_km ?? entrega.distancia_km ?? 0) - 0.2, 0.1);
      entrega.eta_minutos = Math.max(Number(entrega.eta_minutos ?? 0) - 1, 2);
      entrega.previsao_horario = new Date(Date.now() + entrega.eta_minutos * 60000).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      entrega.updated_at = nowIso();
      syncPedidoStatusFromEntrega(db, entrega);
      return entrega;
    });
    if (!updated) {
      notFound(response);
      return;
    }
    json(response, 200, updated);
    return;
  }

  if (request.method === "PATCH" && /^\/demo\/entregas\/[^/]+\/conclude$/.test(path)) {
    const entregaId = path.split("/")[3];
    const updated = mutateDb((db) => {
      const entrega = db.entregas.find((item) => item.id === entregaId);
      if (!entrega) return null;
      entrega.status = "entregue";
      entrega.route_stage = "delivered";
      entrega.entregue_em = nowIso();
      entrega.updated_at = nowIso();
      syncPedidoStatusFromEntrega(db, entrega);
      return entrega;
    });
    if (!updated) {
      notFound(response);
      return;
    }
    json(response, 200, updated);
    return;
  }

  if (request.method === "GET" && path === "/demo/rider-app/state") {
    const riderId = url.searchParams.get("riderId") ?? "demo-motoboy";
    const db = readDb();
    json(response, 200, buildRiderAppState(db, riderId));
    return;
  }

  if (request.method === "PATCH" && /^\/demo\/riders\/[^/]+\/online$/.test(path)) {
    const riderId = path.split("/")[3];
    const body = await readBody(request);
    const updated = mutateDb((db) => {
      const rider = db.riders.find((item) => item.id === riderId);
      if (!rider) return null;
      rider.online = !!body.online;
      return rider;
    });
    if (!updated) {
      notFound(response);
      return;
    }
    json(response, 200, updated);
    return;
  }

  if (request.method === "PATCH" && /^\/demo\/riders\/[^/]+$/.test(path)) {
    const riderId = path.split("/")[3];
    const body = await readBody(request);
    const updated = mutateDb((db) => {
      const rider = db.riders.find((item) => item.id === riderId);
      if (!rider) return null;
      Object.assign(rider, body, {
        settings: {
          ...rider.settings,
          ...(body.settings ?? {}),
        },
        documents: {
          ...rider.documents,
          ...(body.documents ?? {}),
        },
      });
      return rider;
    });
    if (!updated) {
      notFound(response);
      return;
    }
    json(response, 200, updated);
    return;
  }

  if (request.method === "POST" && /^\/demo\/entregas\/[^/]+\/incidents$/.test(path)) {
    const entregaId = path.split("/")[3];
    const body = await readBody(request);
    const created = mutateDb((db) => {
      const incident = {
        id: createId("incident"),
        deliveryId: entregaId,
        riderId: body.riderId ?? "demo-motoboy",
        type: body.type,
        note: body.note ?? "",
        createdAt: nowIso(),
      };
      db.incidents.unshift(incident);
      createNotification(db, {
        riderId: incident.riderId,
        type: "incident_logged",
        deliveryId: entregaId,
        title: "Ocorrencia registrada",
        body: `${incident.type}${incident.note ? `: ${incident.note}` : ""}`,
      });
      return incident;
    });
    json(response, 201, created);
    return;
  }

  if (request.method === "POST" && /^\/demo\/entregas\/[^/]+\/messages$/.test(path)) {
    const entregaId = path.split("/")[3];
    const body = await readBody(request);
    const created = mutateDb((db) => {
      const entrega = db.entregas.find((item) => item.id === entregaId);
      const pedido = db.pedidos.find((item) => item.id === entrega?.pedido_id);
      const message = {
        id: createId("msg"),
        deliveryId: entregaId,
        riderId: body.riderId ?? "demo-motoboy",
        templateId: body.templateId ?? null,
        text: body.text,
        customerPhone: pedido?.cliente_telefone ?? "(11) 90000-0000",
        customerWhatsapp: pedido?.cliente_whatsapp ?? "(11) 90000-0000",
        quickLinks: {
          whatsapp: `https://wa.me/55${formatPhoneForLink(pedido?.cliente_whatsapp)}?text=${encodeURIComponent(body.text)}`,
          sms: `sms:${formatPhoneForLink(pedido?.cliente_telefone)}?body=${encodeURIComponent(body.text)}`,
        },
        createdAt: nowIso(),
      };
      db.messages.unshift(message);
      return message;
    });
    json(response, 201, created);
    return;
  }

  if (request.method === "POST" && path === "/demo/notifications/read") {
    const body = await readBody(request);
    const result = mutateDb((db) => {
      for (const notification of db.notifications) {
        if (!body.riderId || notification.riderId === body.riderId || notification.riderId == null) {
          notification.readAt = notification.readAt ?? nowIso();
        }
      }
      return { ok: true };
    });
    json(response, 200, result);
    return;
  }

  notFound(response);
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("[demo-sync]", error);
    json(response, 500, { error: "internal_error", message: String(error?.message ?? error) });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  ensureDataFile();
  console.log(`[demo-sync] listening on http://0.0.0.0:${PORT}`);
  console.log(`[demo-sync] data file: ${DATA_FILE}`);
});
