import type { User } from "@supabase/supabase-js";
import { SERVICE_CITY_CONFIG } from "../../lib/city-config";
import { resolveAvatarUrl } from "../../lib/avatar";
import type {
  AppNotification,
  DeliveryIncident,
  DeliveryMessage,
  DeliveryOrder,
  DeliveryRouteStage,
  DeliveryStatus,
  DeliveryStep,
  EarningsSnapshot,
  RiderProfile,
} from "../../types";
import { initialAppState } from "../mockData";
import { DEFAULT_CITY, DEFAULT_SUPPORT_PHONE, HISTORICAL_ROUTE_START } from "./constants";
import { getActiveTenantSettings } from "./tenant";
import type {
  DeliveryRow,
  IncidentRow,
  ItemRow,
  MessageRow,
  NotificationRow,
  OrderRow,
  ProfileRow,
  RiderProfileRow,
  RouteRow,
} from "./types";
import {
  estimateEtaFromDistance,
  formatTime,
  getMetadataValue,
} from "./utils";

export function buildRiderProfile(
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
  const avatar = resolveAvatarUrl(riderProfile?.avatar_url, profile?.avatar_url);
  const tenantSettings = getActiveTenantSettings();

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
    supportPhone: String(
      tenantSettings?.phone ?? riderProfile?.support_phone ?? DEFAULT_SUPPORT_PHONE,
    ),
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

export function mapDeliveryRow(
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

export function mapIncidentRow(item: IncidentRow): DeliveryIncident {
  return {
    id: item.id,
    deliveryId: item.delivery_id,
    riderId: item.rider_id,
    type: item.type as DeliveryIncident["type"],
    note: item.note ?? "",
    createdAt: item.created_at,
  };
}

export function mapMessageRow(item: MessageRow): DeliveryMessage {
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

export function mapNotificationRow(item: NotificationRow): AppNotification {
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

export function buildEarnings(deliveries: DeliveryOrder[]): EarningsSnapshot {
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
