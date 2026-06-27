import type { Session, User } from "@supabase/supabase-js";
import { mobileSupabase } from "../lib/supabase";
import { SERVICE_CITY_CONFIG } from "../lib/city-config";
import type {
  AppNotification,
  AppState,
  DeliveryIncident,
  DeliveryMessage,
  DeliveryOrder,
  DeliveryRouteStage,
  DeliveryStatus,
  DeliveryStep,
  EarningsSnapshot,
  RiderProfile,
} from "../types";
import { initialAppState } from "./mockData";

type ProfileRow = {
  id: string;
  nome: string;
  telefone: string | null;
  avatar_url?: string | null;
};

type RiderProfileRow = {
  user_id: string;
  avatar_url?: string | null;
  score?: number | null;
  completed_count?: number | null;
  success_rate?: number | null;
  greeting?: string | null;
  vehicle?: string | null;
  plate?: string | null;
  cep?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  emergency_phone?: string | null;
  pix_key?: string | null;
  support_phone?: string | null;
  cnh?: string | null;
  cnh_expiry?: string | null;
  vehicle_document?: string | null;
  notify_new_orders?: boolean | null;
  notify_occurrences?: boolean | null;
  auto_online_after_login?: boolean | null;
  online?: boolean | null;
};

type DeliveryRow = {
  id: string;
  pedido_id: string;
  motoboy_id: string | null;
  status: string;
  endereco: string;
  bairro: string | null;
  distancia_km: number | null;
  taxa: number;
  created_at: string;
  updated_at: string;
  saiu_em: string | null;
  entregue_em: string | null;
};

type OrderRow = {
  id: string;
  numero: number;
  cliente_id: string | null;
  status: string;
  endereco: string | null;
  observacoes: string | null;
  previsao_entrega: string | null;
  distancia_restante: number | null;
  latitude_cliente: number | null;
  longitude_cliente: number | null;
  ordem_na_rota: number | null;
  created_at: string;
};

type RouteRow = {
  pedido_id: string;
  ordem_entrega: number;
  tempo_estimado: number | null;
  distancia_km: number | null;
  status: string;
};

type ItemRow = {
  pedido_id: string;
  quantidade: number;
  produtos?: { nome?: string | null } | null;
};

type IncidentRow = {
  id: string;
  delivery_id: string;
  rider_id: string;
  type: string;
  note: string | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  delivery_id: string;
  rider_id: string;
  template_id: string | null;
  text: string;
  customer_phone: string;
  customer_whatsapp: string;
  quick_whatsapp: string;
  quick_sms: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  rider_id: string;
  title: string;
  body: string;
  type: string;
  delivery_id: string | null;
  created_at: string;
  read_at: string | null;
};

type RiderAppRemoteState = AppState;

const DEFAULT_SUPPORT_PHONE = SERVICE_CITY_CONFIG.supportPhone;
const DEFAULT_CITY = SERVICE_CITY_CONFIG.city;
const HISTORICAL_ROUTE_START = 1000;
const ENTREGADOR_PERFIS_TABLE = "entregador_perfis" as never;
const MOTOBOY_OCORRENCIAS_TABLE = "motoboy_ocorrencias" as never;
const MOTOBOY_MENSAGENS_TABLE = "motoboy_mensagens" as never;
const MOTOBOY_NOTIFICACOES_TABLE = "motoboy_notificacoes" as never;

function requireSupabase() {
  if (!mobileSupabase) {
    throw new Error("Supabase nao configurado no app do entregador.");
  }
  return mobileSupabase;
}

async function getCurrentUser() {
  const supabase = requireSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Sessao do entregador nao encontrada.");
  return user;
}

export async function getCurrentSession() {
  if (!mobileSupabase) return null;
  const supabase = requireSupabase();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

export function subscribeToAuthChanges(listener: (session: Session | null) => void) {
  if (!mobileSupabase) {
    return () => undefined;
  }
  const supabase = requireSupabase();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    listener(session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export function subscribeToRiderDataChanges(riderId: string, onChange: () => void) {
  if (!mobileSupabase) {
    return () => undefined;
  }
  const supabase = requireSupabase();
  const channel = supabase
    .channel(`rider-app-${riderId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "entregas" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "rotas_entrega" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "motoboy_ocorrencias" },
      onChange,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "motoboy_mensagens" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "motoboy_notificacoes" },
      onChange,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "entregador_perfis" }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function loginRider(identifier: string, password: string) {
  const supabase = requireSupabase();
  const email = identifier.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("Use o e-mail cadastrado do entregador.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

export async function logoutRider() {
  const supabase = requireSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchRiderAppState(): Promise<RiderAppRemoteState> {
  const user = await getCurrentUser();
  const supabase = requireSupabase();

  const [
    { data: profile },
    { data: riderProfile },
    deliveriesResult,
    incidentsResult,
    messagesResult,
    notificationsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nome, telefone, avatar_url")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    supabase
      .from(ENTREGADOR_PERFIS_TABLE)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle<RiderProfileRow>(),
    fetchDeliveries(user.id),
    supabase
      .from(MOTOBOY_OCORRENCIAS_TABLE)
      .select("*")
      .eq("rider_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<IncidentRow[]>(),
    supabase
      .from(MOTOBOY_MENSAGENS_TABLE)
      .select("*")
      .eq("rider_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<MessageRow[]>(),
    supabase
      .from(MOTOBOY_NOTIFICACOES_TABLE)
      .select("*")
      .eq("rider_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<NotificationRow[]>(),
  ]);

  if (deliveriesResult.error) throw deliveriesResult.error;
  if (incidentsResult.error) throw incidentsResult.error;
  if (messagesResult.error) throw messagesResult.error;
  if (notificationsResult.error) throw notificationsResult.error;

  const deliveries = deliveriesResult.data;
  const incidents = (incidentsResult.data ?? []).map(mapIncidentRow);
  const messages = (messagesResult.data ?? []).map(mapMessageRow);
  const notifications = (notificationsResult.data ?? []).map(mapNotificationRow);
  const rider = buildRiderProfile(user, profile ?? null, riderProfile ?? null);
  const earnings = buildEarnings(deliveries);

  return {
    loggedIn: true,
    rememberLogin: true,
    rider,
    deliveries,
    incidents,
    messages,
    notifications,
    earnings,
  };
}

async function fetchDeliveries(riderId: string) {
  const supabase = requireSupabase();
  const { data: deliveryRows, error } = await supabase
    .from("entregas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<DeliveryRow[]>();
  if (error) {
    return { data: [] as DeliveryOrder[], error };
  }

  const pedidoIds = [...new Set((deliveryRows ?? []).map((item) => item.pedido_id))];
  const assignedPedidoIds = [
    ...new Set(
      (deliveryRows ?? [])
        .filter((item) => item.motoboy_id === riderId)
        .map((item) => item.pedido_id),
    ),
  ];
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
        .in("id", [...customerIds])
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

function buildRiderProfile(
  user: User,
  profile: ProfileRow | null,
  riderProfile: RiderProfileRow | null,
): RiderProfile {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = String(profile?.nome ?? metadata.nome ?? initialAppState.rider.name);
  const phone = String(profile?.telefone ?? metadata.telefone ?? initialAppState.rider.phone);
  const vehicle = String(
    riderProfile?.vehicle ?? metadata.vehicle ?? initialAppState.rider.vehicle,
  );
  const plate = String(riderProfile?.plate ?? metadata.plate ?? initialAppState.rider.plate);
  const avatar = String(
    riderProfile?.avatar_url ??
      profile?.avatar_url ??
      metadata.avatar_url ??
      initialAppState.rider.avatar,
  );

  return {
    id: user.id,
    name,
    shortName: name.split(" ")[0] ?? "Entregador",
    phone,
    avatar,
    score: Number(riderProfile?.score ?? initialAppState.rider.score),
    vehicle,
    plate,
    online: Boolean(riderProfile?.online ?? false),
    completedCount: Number(riderProfile?.completed_count ?? initialAppState.rider.completedCount),
    successRate: Number(riderProfile?.success_rate ?? initialAppState.rider.successRate),
    greeting: String(riderProfile?.greeting ?? initialAppState.rider.greeting),
    email: user.email ?? "",
    cep: String(riderProfile?.cep ?? ""),
    address: String(riderProfile?.address ?? ""),
    neighborhood: String(riderProfile?.neighborhood ?? ""),
    city: String(riderProfile?.city ?? DEFAULT_CITY),
    state: String(riderProfile?.state ?? SERVICE_CITY_CONFIG.state),
    emergencyPhone: String(riderProfile?.emergency_phone ?? phone),
    pixKey: String(riderProfile?.pix_key ?? user.email ?? phone),
    supportPhone: String(riderProfile?.support_phone ?? DEFAULT_SUPPORT_PHONE),
    documents: {
      cnh: String(riderProfile?.cnh ?? ""),
      cnhExpiry: riderProfile?.cnh_expiry ?? "",
      vehicleDocument: String(riderProfile?.vehicle_document ?? ""),
    },
    settings: {
      darkModeReady: true,
      notifyNewOrders: riderProfile?.notify_new_orders ?? true,
      notifyOccurrences: riderProfile?.notify_occurrences ?? true,
      autoOnlineAfterLogin: riderProfile?.auto_online_after_login ?? true,
    },
  };
}

function mapDeliveryRow(
  delivery: DeliveryRow,
  order: OrderRow | null,
  route: RouteRow | null,
  customer: ProfileRow | null,
  items: ItemRow[],
): DeliveryOrder {
  const routeStage = mapRouteStage(delivery.status);
  const currentStep = mapDeliveryStep(routeStage, delivery.status);
  const status = mapDeliveryStatus(delivery);
  const itemNames = items.map((item) => `${item.quantidade}x ${item.produtos?.nome ?? "Item"}`);
  const totalItems = items.reduce((sum, item) => sum + Number(item.quantidade ?? 0), 0);
  const isCompleted =
    delivery.status === "entregue" || order?.status === "entregue" || order?.status === "cancelado";
  const distanceKm = isCompleted
    ? 0
    : Number(order?.distancia_restante ?? route?.distancia_km ?? delivery.distancia_km ?? 0);
  const etaMinutes = isCompleted
    ? 0
    : Math.max(5, Number(route?.tempo_estimado ?? estimateEtaFromDistance(distanceKm)));
  const etaDate =
    order?.previsao_entrega && !isCompleted
      ? new Date(order.previsao_entrega)
      : new Date(Date.now() + etaMinutes * 60000);
  const rawRouteIndex = order?.ordem_na_rota ?? route?.ordem_entrega ?? null;
  const routeIndex =
    !isCompleted && rawRouteIndex && rawRouteIndex < HISTORICAL_ROUTE_START ? rawRouteIndex : null;
  const deliveriesAhead = routeIndex ? Math.max(routeIndex - 1, 0) : 0;
  const customerPhone = customer?.telefone ?? "";
  const reference = getCleanOrderReference(order?.observacoes);

  return {
    id: delivery.id,
    number: `#${order?.numero ?? delivery.id.slice(0, 6).toUpperCase()}`,
    customer: customer?.nome ?? `Cliente pedido ${order?.numero ?? ""}`.trim(),
    phone: customerPhone,
    whatsapp: customerPhone,
    address: order?.endereco ?? delivery.endereco,
    neighborhood: delivery.bairro ?? "Centro",
    city: DEFAULT_CITY,
    reference,
    distanceKm,
    fee: Number(delivery.taxa ?? 0),
    eta: isCompleted
      ? "Finalizada"
      : etaDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    etaMinutes,
    items: itemNames.length ? itemNames : ["Pedido sem itens detalhados"],
    totalItems,
    status,
    badgeLabel: mapBadgeLabel(delivery.status),
    currentStep,
    routeStage,
    timeline: buildTimeline(delivery, routeStage),
    orderInRoute: routeIndex ?? undefined,
    deliveriesAhead,
    customerLatitude: order?.latitude_cliente ?? undefined,
    customerLongitude: order?.longitude_cliente ?? undefined,
  };
}

function getCleanOrderReference(observacoes: string | null | undefined) {
  const reference = getMetadataValue(observacoes, "referencia");
  if (reference) return reference;

  const visibleNotes = (observacoes ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.includes("=") && !part.toUpperCase().startsWith("SEED_"))
    .join("; ");

  return visibleNotes || "Sem observacoes adicionais.";
}

function getMetadataValue(observacoes: string | null | undefined, key: string) {
  if (!observacoes) return "";
  const match = observacoes.match(new RegExp(`${key}=([^;]+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function mapDeliveryStatus(delivery: DeliveryRow): DeliveryStatus {
  if (delivery.status === "entregue") return "completed";
  if (!delivery.motoboy_id && delivery.status === "pendente") return "available";
  return "in_progress";
}

function mapRouteStage(status: string): DeliveryRouteStage {
  if (status === "na_loja") return "arrived_store";
  if (status === "pedido_retirado") return "picked_up";
  if (status === "chegou_cliente") return "arrived_customer";
  if (status === "entregue") return "delivered";
  return "assigned";
}

function mapDeliveryStep(routeStage: DeliveryRouteStage, deliveryStatus: string): DeliveryStep {
  if (deliveryStatus === "pendente") return "confirmed";
  if (routeStage === "assigned" || routeStage === "arrived_store") return "preparing";
  if (routeStage === "picked_up") return "on_route";
  if (routeStage === "arrived_customer") return "arrived";
  return "delivered";
}

function mapBadgeLabel(status: string) {
  if (status === "pendente") return "Disponivel";
  if (status === "na_loja") return "Na loja";
  if (status === "pedido_retirado") return "Em rota";
  if (status === "chegou_cliente") return "No cliente";
  if (status === "entregue") return "Entregue";
  return "Aceito";
}

function buildTimeline(delivery: DeliveryRow, routeStage: DeliveryRouteStage) {
  const createdTime = formatTime(delivery.created_at);
  const pickedTime = formatTime(delivery.saiu_em ?? delivery.created_at);
  const deliveredTime = formatTime(
    delivery.entregue_em ?? delivery.updated_at ?? delivery.created_at,
  );
  const activeStep = mapDeliveryStep(routeStage, delivery.status);

  return [
    {
      step: "confirmed" as const,
      title: "Entrega disponivel",
      description: "Pedido aguardando aceite do motoboy.",
      time: createdTime,
    },
    {
      step: "preparing" as const,
      title: "Loja confirmada",
      description: "Chegada na loja e conferencia do pedido.",
      time: activeStep === "confirmed" ? "--:--" : createdTime,
    },
    {
      step: "on_route" as const,
      title: "Pedido em rota",
      description: "Pedido retirado e saida para entrega.",
      time: ["on_route", "arrived", "delivered"].includes(activeStep) ? pickedTime : "--:--",
    },
    {
      step: "arrived" as const,
      title: "Chegou ao cliente",
      description: "Parada final em andamento.",
      time: ["arrived", "delivered"].includes(activeStep) ? deliveredTime : "--:--",
    },
    {
      step: "delivered" as const,
      title: "Entrega concluida",
      description: "Pedido finalizado e fila atualizada automaticamente.",
      time: activeStep === "delivered" ? deliveredTime : "--:--",
    },
  ];
}

function mapIncidentRow(item: IncidentRow): DeliveryIncident {
  return {
    id: item.id,
    deliveryId: item.delivery_id,
    riderId: item.rider_id,
    type: item.type as DeliveryIncident["type"],
    note: item.note ?? "",
    createdAt: item.created_at,
  };
}

function mapMessageRow(item: MessageRow): DeliveryMessage {
  return {
    id: item.id,
    deliveryId: item.delivery_id,
    riderId: item.rider_id,
    templateId: item.template_id,
    text: item.text,
    customerPhone: item.customer_phone,
    customerWhatsapp: item.customer_whatsapp,
    quickLinks: {
      whatsapp: item.quick_whatsapp,
      sms: item.quick_sms,
    },
    createdAt: item.created_at,
  };
}

function mapNotificationRow(item: NotificationRow): AppNotification {
  return {
    id: item.id,
    riderId: item.rider_id,
    title: item.title,
    body: item.body,
    type: normalizeNotificationType(item.type),
    deliveryId: item.delivery_id,
    createdAt: item.created_at,
    readAt: item.read_at,
  };
}

function normalizeNotificationType(type: string): AppNotification["type"] {
  if (type === "delivery_assigned" || type === "delivery_progress" || type === "incident_logged")
    return type;
  return "delivery_ready";
}

function buildEarnings(deliveries: DeliveryOrder[]): EarningsSnapshot {
  const now = Date.now();
  const completed = deliveries.filter((item) => item.status === "completed");
  const withDates = completed.map((item) => ({
    delivery: item,
    timestamp: deriveDeliveryTimestamp(item),
  }));

  const totals = withDates.reduce(
    (acc, item) => {
      const value = item.delivery.fee;
      acc.month += value;
      acc.distance += item.delivery.distanceKm;
      acc.fees += value;
      if (now - item.timestamp <= 7 * 24 * 60 * 60 * 1000) acc.week += value;
      if (new Date(item.timestamp).toDateString() === new Date(now).toDateString())
        acc.today += value;
      return acc;
    },
    { today: 0, week: 0, month: 0, fees: 0, distance: 0 },
  );

  return {
    today: totals.today,
    week: totals.week,
    month: totals.month,
    fees: totals.fees,
    distance: totals.distance,
    additions: 0,
    bonus: 0,
    discounts: 0,
    chart: completed
      .slice(0, 7)
      .reverse()
      .map((item, index) => ({
        label: `D${index + 1}`,
        value: item.fee,
      })),
  };
}

function deriveDeliveryTimestamp(delivery: DeliveryOrder) {
  const [hours, minutes] = delivery.eta.split(":").map(Number);
  if (Number.isFinite(hours) && Number.isFinite(minutes)) {
    const value = new Date();
    value.setHours(hours, minutes, 0, 0);
    return value.getTime();
  }
  return Date.now();
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

function buildQuickLinks(phone: string, text: string) {
  const digits = formatPhone(phone);
  const encoded = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/${digits}?text=${encoded}`,
    sms: `sms:${digits}?body=${encoded}`,
  };
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function estimateEtaFromDistance(distance: number | null) {
  return Math.max(8, Math.round((Number(distance ?? 4) / 22) * 60));
}

function isDeliveredQueueConflict(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}) {
  return (
    error.code === "23505" &&
    `${error.message ?? ""} ${error.details ?? ""}`.includes(
      "rotas_entrega_entregador_id_ordem_entrega_key",
    )
  );
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

  for (const [index, route] of (deliveredRoutes ?? []).entries()) {
    const normalizedOrder = 1001 + index;
    if (Number(route.ordem_entrega) === normalizedOrder) continue;

    const { error } = await supabase
      .from("rotas_entrega")
      .update({ ordem_entrega: normalizedOrder })
      .eq("pedido_id", route.pedido_id)
      .eq("entregador_id", riderId);
    if (error) throw error;
  }

  const nextDeliveredOrder = 1001 + (deliveredRoutes?.length ?? 0);

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

async function insertNotification(
  userId: string,
  title: string,
  body: string,
  type: string,
  deliveryId: string | null,
) {
  const supabase = requireSupabase();
  const { error } = await supabase.from(MOTOBOY_NOTIFICACOES_TABLE).insert({
    rider_id: userId,
    title,
    body,
    type,
    delivery_id: deliveryId,
  });
  if (error) throw error;
}

async function tryInsertNotification(
  userId: string,
  title: string,
  body: string,
  type: string,
  deliveryId: string | null,
) {
  try {
    await insertNotification(userId, title, body, type, deliveryId);
  } catch (error) {
    console.warn("[mobile] Falha ao registrar notificacao do motoboy.", error);
  }
}

export async function updateRiderOnline(online: boolean) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const { error } = await supabase.from(ENTREGADOR_PERFIS_TABLE).upsert({
    user_id: user.id,
    online,
  });
  if (error) throw error;

  await supabase
    .from("entregadores_localizacao")
    .update({ status: online ? "online" : "offline" })
    .eq("entregador_id", user.id);
}

export async function updateRiderProfile(payload: Record<string, unknown>) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();

  const profilePatch: Record<string, unknown> = {};
  if (typeof payload.name === "string") profilePatch.nome = payload.name;
  if (typeof payload.phone === "string") profilePatch.telefone = payload.phone;

  if (Object.keys(profilePatch).length) {
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      ...profilePatch,
    });
    if (error) throw error;
  }

  const riderPatch: Record<string, unknown> = { user_id: user.id };
  if (typeof payload.cep === "string") riderPatch.cep = payload.cep;
  if (typeof payload.address === "string") riderPatch.address = payload.address;
  if (typeof payload.neighborhood === "string") riderPatch.neighborhood = payload.neighborhood;
  if (typeof payload.city === "string") riderPatch.city = payload.city;
  if (typeof payload.state === "string") riderPatch.state = payload.state;
  if (typeof payload.email === "string") riderPatch.pix_key = payload.email;

  const settings = payload.settings as Record<string, unknown> | undefined;
  if (settings) {
    if (typeof settings.notifyNewOrders === "boolean")
      riderPatch.notify_new_orders = settings.notifyNewOrders;
    if (typeof settings.notifyOccurrences === "boolean")
      riderPatch.notify_occurrences = settings.notifyOccurrences;
    if (typeof settings.autoOnlineAfterLogin === "boolean")
      riderPatch.auto_online_after_login = settings.autoOnlineAfterLogin;
  }

  if (Object.keys(riderPatch).length > 1) {
    const { error } = await supabase.from(ENTREGADOR_PERFIS_TABLE).upsert(riderPatch);
    if (error) throw error;
  }

  const updateUserPayload: {
    email?: string;
    data?: Record<string, unknown>;
  } = {
    data: {
      nome: typeof payload.name === "string" ? payload.name : user.user_metadata?.nome,
      telefone: typeof payload.phone === "string" ? payload.phone : user.user_metadata?.telefone,
    },
  };

  if (typeof payload.email === "string" && payload.email !== user.email) {
    updateUserPayload.email = payload.email;
  }

  const { error: authError } = await supabase.auth.updateUser(updateUserPayload);
  if (authError) throw authError;
}

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
      await advanceRiderDeliveryFallback(supabase, deliveryId, step);
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

async function advanceRiderDeliveryFallback(
  supabase: ReturnType<typeof requireSupabase>,
  deliveryId: string,
  step: string,
) {
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

export async function sendRiderLocation(
  _deliveryId: string,
  payload: {
    riderId: string;
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    battery?: number | null;
    status?: string;
  },
) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const riderId = payload.riderId || user.id;
  const status = payload.status ?? "em_rota";

  const [locationResult, profileResult] = await Promise.all([
    supabase.from("entregadores_localizacao").upsert(
      {
        entregador_id: riderId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed ?? null,
        heading: payload.heading ?? null,
        accuracy: payload.accuracy ?? null,
        battery: payload.battery ?? null,
        status,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "entregador_id",
      },
    ),
    supabase.from(ENTREGADOR_PERFIS_TABLE).upsert(
      {
        user_id: riderId,
        online: status !== "offline",
      },
      {
        onConflict: "user_id",
      },
    ),
  ]);

  if (locationResult.error) throw locationResult.error;
  if (profileResult.error) throw profileResult.error;

  return { ok: true };
}

export async function reportRiderIncident(deliveryId: string, type: string, note: string) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();

  const { error } = await supabase.from(MOTOBOY_OCORRENCIAS_TABLE).insert({
    delivery_id: deliveryId,
    rider_id: user.id,
    type,
    note,
  });
  if (error) throw error;

  await tryInsertNotification(
    user.id,
    "Ocorrencia registrada",
    type,
    "incident_logged",
    deliveryId,
  );
}

export async function sendRiderMessage(deliveryId: string, text: string, templateId?: string) {
  const state = await fetchRiderAppState();
  const delivery = state.deliveries.find((item) => item.id === deliveryId);
  if (!delivery) throw new Error("Entrega nao encontrada para envio da mensagem.");

  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const quickLinks = buildQuickLinks(delivery.whatsapp || delivery.phone, text);

  const { error } = await supabase.from(MOTOBOY_MENSAGENS_TABLE).insert({
    delivery_id: deliveryId,
    rider_id: user.id,
    template_id: templateId ?? null,
    text,
    customer_phone: delivery.phone,
    customer_whatsapp: delivery.whatsapp,
    quick_whatsapp: quickLinks.whatsapp,
    quick_sms: quickLinks.sms,
  });
  if (error) throw error;

  return {
    id: `local-${Date.now()}`,
    deliveryId,
    riderId: user.id,
    templateId: templateId ?? null,
    text,
    customerPhone: delivery.phone,
    customerWhatsapp: delivery.whatsapp,
    quickLinks,
    createdAt: new Date().toISOString(),
  };
}

export async function markNotificationsRead() {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from(MOTOBOY_NOTIFICACOES_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("rider_id", user.id)
    .is("read_at", null);
  if (error) throw error;
}
