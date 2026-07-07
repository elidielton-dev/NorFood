import { supabase } from "@/integrations/supabase/client";
import { SERVICE_CITY_CONFIG } from "@/lib/shared/city-config";
import type { Tables } from "@/integrations/supabase/types";
import { hasBrowserSupabaseConfig, isBrowserDemoEnabled } from "@/lib/shared/runtime";

type PedidoRow = Tables<"pedidos">;
type LocationRow = Tables<"entregadores_localizacao">;
type RouteRow = Tables<"rotas_entrega">;
type ProfileRow = Pick<Tables<"profiles">, "id" | "nome">;

export type DeliveryTrackingStatus =
  | "pedido_recebido"
  | "em_preparo"
  | "pronto"
  | "em_rota"
  | "chegando"
  | "entregue";

export type DeliveryTrackingPoint = {
  latitude: number;
  longitude: number;
};

export type DeliveryTrackingSnapshot = {
  orderId: string;
  orderNumber: number;
  status: DeliveryTrackingStatus;
  riderId: string | null;
  riderName: string;
  riderBattery: number | null;
  riderSpeedKmh: number;
  riderStatus: "online" | "offline" | "em_rota" | "pausado";
  updatedAt: string;
  etaMinutes: number;
  remainingKm: number;
  deliveriesAhead: number;
  queueMessage: string;
  routeIndex: number;
  store: DeliveryTrackingPoint;
  customer: DeliveryTrackingPoint;
  rider: DeliveryTrackingPoint;
  route: DeliveryTrackingPoint[];
  completedRoute: DeliveryTrackingPoint[];
};

const HISTORICAL_ROUTE_START = 1000;

export type FleetTrackingSnapshot = {
  riders: Array<{
    id: string;
    name: string;
    photo: string;
    status: "online" | "offline" | "em_rota" | "pausado";
    speedKmh: number;
    updatedAt: string;
    battery: number | null;
    activeDeliveries: number;
    deliveriesAhead: number;
    location: DeliveryTrackingPoint;
    route: DeliveryTrackingPoint[];
    completedRoute: DeliveryTrackingPoint[];
  }>;
};

const STORE_LOCATION: DeliveryTrackingPoint = {
  latitude: Number(import.meta.env.VITE_STORE_LAT ?? SERVICE_CITY_CONFIG.center.latitude),
  longitude: Number(import.meta.env.VITE_STORE_LNG ?? SERVICE_CITY_CONFIG.center.longitude),
};

const DELIVERY_STATUS_LABEL_MAP: Record<string, DeliveryTrackingStatus> = {
  aberto: "pedido_recebido",
  em_preparo: "em_preparo",
  pronto: "pronto",
  em_entrega: "em_rota",
  entregue: "entregue",
  cancelado: "entregue",
};

export function liveStatusEnabled() {
  return hasBrowserSupabaseConfig();
}

export async function getOrderTrackingSnapshot(orderId: string): Promise<DeliveryTrackingSnapshot> {
  if (!liveStatusEnabled()) {
    throw new Error("Supabase nao configurado para rastreamento.");
  }

  const { data: pedido, error } = await supabase
    .from("pedidos")
    .select("*")
    .eq("id", orderId)
    .single<PedidoRow>();

  if (error || !pedido) {
    throw error ?? new Error("Pedido de rastreamento nao encontrado.");
  }

  const customer = resolveCustomerLocation(pedido);
  if (!customer) {
    throw new Error("Pedido sem coordenadas do cliente para rastreamento.");
  }

  const riderId = pedido.entregador_id;

  const [{ data: location }, { data: queue }, { data: riderProfile }] = await Promise.all([
    riderId
      ? supabase
          .from("entregadores_localizacao")
          .select("*")
          .eq("entregador_id", riderId)
          .maybeSingle<LocationRow>()
      : Promise.resolve({ data: null as LocationRow | null }),
    riderId
      ? supabase
          .from("rotas_entrega")
          .select("*")
          .eq("entregador_id", riderId)
          .order("ordem_entrega", { ascending: true })
          .returns<RouteRow[]>()
      : Promise.resolve({ data: [] as RouteRow[] }),
    riderId
      ? supabase.from("profiles").select("id,nome").eq("id", riderId).maybeSingle<ProfileRow>()
      : Promise.resolve({ data: null as ProfileRow | null }),
  ]);

  const rider = location
    ? { latitude: location.latitude, longitude: location.longitude }
    : STORE_LOCATION;
  const route = await getRoutePath([STORE_LOCATION, rider, customer]);
  const routeIndex = findClosestPointIndex(route, rider);
  const completedRoute = route.slice(0, Math.max(routeIndex, 1));
  const currentRoute = queue?.find((item) => item.pedido_id === pedido.id);
  const trackingStatus = deriveTrackingStatus(pedido.status, 0);
  const rawRemainingKm =
    pedido.distancia_restante ?? currentRoute?.distancia_km ?? estimateDistanceKm(rider, customer);
  const currentQueuePosition = pedido.ordem_na_rota ?? currentRoute?.ordem_entrega ?? 1;
  const isHistoricalQueuePosition = currentQueuePosition >= HISTORICAL_ROUTE_START;
  const isCompletedOrder = trackingStatus === "entregue" || pedido.status === "cancelado";
  const remainingKm = isCompletedOrder ? 0 : rawRemainingKm;
  const etaMinutes = isCompletedOrder ? 0 : deriveEtaMinutes(remainingKm, location?.speed ?? null);
  const deliveriesAhead =
    isCompletedOrder || isHistoricalQueuePosition ? 0 : Math.max(currentQueuePosition - 1, 0);

  return {
    orderId: pedido.id,
    orderNumber: pedido.numero,
    status: deriveTrackingStatus(pedido.status, remainingKm),
    riderId,
    riderName:
      riderProfile?.nome ??
      (riderId ? `Entregador ${riderId.slice(0, 4).toUpperCase()}` : "Aguardando atribuicao"),
    riderBattery: location?.battery ?? null,
    riderSpeedKmh: location?.speed && location.speed > 0 ? Math.round(location.speed * 3.6) : 0,
    riderStatus: normalizeRiderStatus(location?.status),
    updatedAt: location?.updated_at ?? pedido.updated_at,
    etaMinutes,
    remainingKm,
    deliveriesAhead,
    queueMessage: formatQueueMessage(deliveriesAhead, isCompletedOrder),
    routeIndex,
    store: STORE_LOCATION,
    customer,
    rider,
    route,
    completedRoute,
  };
}

export async function getFleetTrackingSnapshot(
  orderIds: Array<{ id: string; numero: number }>,
): Promise<FleetTrackingSnapshot> {
  if (!liveStatusEnabled()) {
    return { riders: [] };
  }

  const snapshots = await Promise.allSettled(
    orderIds.map((order) => getOrderTrackingSnapshot(order.id)),
  );
  const riderMap = new Map<string, FleetTrackingSnapshot["riders"][number]>();

  snapshots.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const snapshot = result.value;
    if (snapshot.status === "entregue") return;
    const riderId = snapshot.riderId ?? `unassigned-${index}`;
    const current = riderMap.get(riderId);
    if (current) {
      current.activeDeliveries += 1;
      current.deliveriesAhead = Math.max(current.deliveriesAhead, snapshot.deliveriesAhead);
      current.battery = snapshot.riderBattery;
      current.speedKmh = snapshot.riderSpeedKmh;
      current.updatedAt = snapshot.updatedAt;
      current.status = snapshot.riderStatus;
      current.location = snapshot.rider;
      current.route = snapshot.route;
      current.completedRoute = snapshot.completedRoute;
      return;
    }

    riderMap.set(riderId, {
      id: riderId,
      name: snapshot.riderName,
      photo: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(snapshot.riderName)}`,
      status: snapshot.riderStatus,
      speedKmh: snapshot.riderSpeedKmh,
      updatedAt: snapshot.updatedAt,
      battery: snapshot.riderBattery,
      activeDeliveries: 1,
      deliveriesAhead: snapshot.deliveriesAhead,
      location: snapshot.rider,
      route: snapshot.route,
      completedRoute: snapshot.completedRoute,
    });
  });

  return { riders: [...riderMap.values()] };
}

export function subscribeOrderTracking(orderId: string, onChange: () => void) {
  if (!liveStatusEnabled() || isBrowserDemoEnabled()) {
    return () => undefined;
  }

  const channel = supabase
    .channel(`order-live-${orderId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pedidos", filter: `id=eq.${orderId}` },
      onChange,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "rotas_entrega" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "entregadores_localizacao" },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeFleetTracking(onChange: () => void) {
  if (!liveStatusEnabled() || isBrowserDemoEnabled()) {
    return () => undefined;
  }

  const channel = supabase
    .channel("fleet-live-status")
    .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "rotas_entrega" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "entregadores_localizacao" },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function formatTrackingStatus(status: DeliveryTrackingStatus) {
  return {
    pedido_recebido: "Pedido recebido",
    em_preparo: "Em preparo",
    pronto: "Pronto para sair",
    em_rota: "Saiu para entrega",
    chegando: "Chegando ao cliente",
    entregue: "Entregue",
  }[status];
}

async function getRoutePath(points: DeliveryTrackingPoint[]) {
  const filtered = dedupePoints(points);
  if (filtered.length < 2) return filtered;

  if (import.meta.env.VITE_OPENROUTESERVICE_API_KEY) {
    try {
      const response = await fetch(
        "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
        {
          method: "POST",
          headers: {
            Authorization: import.meta.env.VITE_OPENROUTESERVICE_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            coordinates: filtered.map((point) => [point.longitude, point.latitude]),
          }),
        },
      );
      if (response.ok) {
        const payload = (await response.json()) as {
          features?: Array<{ geometry?: { coordinates?: number[][] } }>;
        };
        const coordinates = payload.features?.[0]?.geometry?.coordinates ?? [];
        if (coordinates.length) {
          return coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
        }
      }
    } catch {
      // Fallback to OSRM or straight polyline.
    }
  }

  try {
    const coordinateList = filtered
      .map((point) => `${point.longitude},${point.latitude}`)
      .join(";");
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordinateList}?overview=full&geometries=geojson`,
    );
    if (response.ok) {
      const payload = (await response.json()) as {
        routes?: Array<{ geometry?: { coordinates?: number[][] } }>;
      };
      const coordinates = payload.routes?.[0]?.geometry?.coordinates ?? [];
      if (coordinates.length) {
        return coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
      }
    }
  } catch {
    // Final fallback below.
  }

  return interpolatePolyline(
    filtered[0],
    filtered.at(-1) ?? filtered[0],
    filtered[Math.floor(filtered.length / 2)],
  );
}

function dedupePoints(points: DeliveryTrackingPoint[]) {
  return points.filter((point, index, list) => {
    if (index === 0) return true;
    const previous = list[index - 1];
    return previous.latitude !== point.latitude || previous.longitude !== point.longitude;
  });
}

function deriveTrackingStatus(status: string, remainingKm: number): DeliveryTrackingStatus {
  const mapped = DELIVERY_STATUS_LABEL_MAP[status] ?? "pedido_recebido";
  if (mapped === "em_rota" && remainingKm < 0.6) return "chegando";
  return mapped;
}

function normalizeRiderStatus(
  status: string | null | undefined,
): DeliveryTrackingSnapshot["riderStatus"] {
  if (status === "offline" || status === "pausado" || status === "em_rota") return status;
  return "online";
}

function resolveCustomerLocation(pedido: PedidoRow): DeliveryTrackingPoint | null {
  if (pedido.latitude_cliente && pedido.longitude_cliente) {
    return {
      latitude: pedido.latitude_cliente,
      longitude: pedido.longitude_cliente,
    };
  }

  return null;
}

function deriveEtaMinutes(remainingKm: number, speedMs: number | null) {
  const speedKmh = speedMs && speedMs > 0 ? speedMs * 3.6 : 22;
  return Math.max(3, Math.round((remainingKm / speedKmh) * 60));
}

function estimateDistanceKm(a: DeliveryTrackingPoint, b: DeliveryTrackingPoint) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return Number((earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))).toFixed(1));
}

function createInterpolatedPoint(
  start: DeliveryTrackingPoint,
  end: DeliveryTrackingPoint,
  ratio: number,
): DeliveryTrackingPoint {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * ratio,
    longitude: start.longitude + (end.longitude - start.longitude) * ratio,
  };
}

function interpolatePolyline(
  start: DeliveryTrackingPoint,
  end: DeliveryTrackingPoint,
  pivot: DeliveryTrackingPoint,
) {
  const segments = [start, pivot, end];
  const output: DeliveryTrackingPoint[] = [];

  segments.forEach((point, index) => {
    if (index === segments.length - 1) return;
    const next = segments[index + 1];
    for (let step = 0; step <= 14; step += 1) {
      const ratio = step / 14;
      output.push(createInterpolatedPoint(point, next, ratio));
    }
  });

  return output;
}

function findClosestPointIndex(route: DeliveryTrackingPoint[], point: DeliveryTrackingPoint) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  route.forEach((routePoint, index) => {
    const distance = estimateDistanceKm(routePoint, point);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function formatQueueMessage(deliveriesAhead: number, isCompletedOrder = false) {
  if (isCompletedOrder) return "Pedido entregue com sucesso.";
  if (deliveriesAhead <= 0) return "Voce e a proxima entrega.";
  if (deliveriesAhead === 1) return "Seu entregador possui 1 entrega antes da sua.";
  return `Seu entregador possui ${deliveriesAhead} entregas antes da sua.`;
}
