import { useEffect, useMemo, useRef, useState } from "react";
import L, {
  type LatLngExpression,
  type Map as LeafletMap,
  type Polyline as LeafletPolyline,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { Clock3, MapPinned, Navigation, Route } from "lucide-react";
import {
  formatTrackingStatus,
  getOrderTrackingSnapshot,
  subscribeOrderTracking,
  type DeliveryTrackingSnapshot,
} from "@/lib/delivery/delivery-live-status";
import { SERVICE_CITY_CONFIG } from "@/lib/shared/city-config";

const markerIcon = (color: string) =>
  L.divIcon({
    className: "delivery-pin",
    html: `<div style="width:16px;height:16px;border-radius:999px;background:${color};border:3px solid white;box-shadow:0 6px 20px rgba(0,0,0,.18)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

export function OrderLiveMap({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeRef = useRef<LeafletPolyline | null>(null);
  const completedRef = useRef<LeafletPolyline | null>(null);
  const riderRef = useRef<L.Marker | null>(null);
  const storeRef = useRef<L.Marker | null>(null);
  const customerRef = useRef<L.Marker | null>(null);
  const [snapshot, setSnapshot] = useState<DeliveryTrackingSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const sync = async () => {
      try {
        const next = await getOrderTrackingSnapshot(orderId);
        if (!active) return;
        setSnapshot(next);
        setErrorMessage(null);
      } catch (error) {
        if (!active) return;
        setSnapshot(null);
        setErrorMessage(
          error instanceof Error ? error.message : "Nao foi possivel carregar o rastreio.",
        );
      }
    };

    void sync();
    const unsubscribe = subscribeOrderTracking(orderId, () => {
      void sync();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [orderId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([SERVICE_CITY_CONFIG.center.latitude, SERVICE_CITY_CONFIG.center.longitude], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !snapshot) return;

    const routeLatLngs = snapshot.route.map(toLatLng);
    const completedLatLngs = snapshot.completedRoute.map(toLatLng);

    if (!routeRef.current) {
      routeRef.current = L.polyline(routeLatLngs, {
        color: "#D8A03D",
        weight: 5,
        opacity: 0.9,
      }).addTo(map);
    } else {
      routeRef.current.setLatLngs(routeLatLngs);
    }

    if (!completedRef.current) {
      completedRef.current = L.polyline(completedLatLngs, {
        color: "#3D5A40",
        weight: 6,
        opacity: 0.95,
      }).addTo(map);
    } else {
      completedRef.current.setLatLngs(completedLatLngs);
    }

    if (!storeRef.current) {
      storeRef.current = L.marker(toLatLng(snapshot.store), {
        icon: markerIcon("#3D5A40"),
      })
        .bindTooltip("Loja")
        .addTo(map);
    } else {
      storeRef.current.setLatLng(toLatLng(snapshot.store));
    }

    if (!customerRef.current) {
      customerRef.current = L.marker(toLatLng(snapshot.customer), {
        icon: markerIcon("#F2C14E"),
      })
        .bindTooltip("Cliente")
        .addTo(map);
    } else {
      customerRef.current.setLatLng(toLatLng(snapshot.customer));
    }

    if (!riderRef.current) {
      riderRef.current = L.marker(toLatLng(snapshot.rider), {
        icon: markerIcon("#556B57"),
      })
        .bindTooltip("Entregador")
        .addTo(map);
    } else {
      riderRef.current.setLatLng(toLatLng(snapshot.rider));
    }

    const bounds = L.latLngBounds(routeLatLngs);
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.22));
    }
  }, [snapshot]);

  const stats = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.status === "entregue") {
      return [
        { icon: Clock3, label: "Previsao", value: "Concluido" },
        { icon: Navigation, label: "Restante", value: "0.0 km" },
        { icon: MapPinned, label: "Status", value: "Finalizado" },
      ];
    }
    return [
      { icon: Clock3, label: "Previsao", value: `${snapshot.etaMinutes} min` },
      { icon: Navigation, label: "Restante", value: `${snapshot.remainingKm.toFixed(1)} km` },
      {
        icon: Route,
        label: "Fila",
        value:
          snapshot.deliveriesAhead === 0
            ? "Voce e a proxima"
            : `${snapshot.deliveriesAhead} antes da sua`,
      },
    ];
  }, [snapshot]);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-[color:var(--honey-line)] bg-card shadow-soft">
      <div className="bg-[linear-gradient(135deg,#3D5A40,#556B57)] px-5 py-4 text-primary-foreground">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#F2C14E]">
              Pedido #{orderNumber}
            </p>
            <p className="mt-2 font-display text-2xl">
              {snapshot ? formatTrackingStatus(snapshot.status) : "Carregando rastreio"}
            </p>
            <p className="mt-1 text-sm text-primary-foreground/80">
              {snapshot?.queueMessage ?? "Preparando mapa e rota em tempo real."}
            </p>
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-right text-xs">
            <p>{snapshot?.riderName ?? "Alocando entregador"}</p>
            <p className="mt-1 text-[#F2C14E]">
              {snapshot
                ? snapshot.status === "entregue"
                  ? "Finalizado"
                  : `${snapshot.etaMinutes} min`
                : "--"}
            </p>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-72 w-full bg-[linear-gradient(180deg,#FAF5EB,#F2E7D2)]"
      />
      {errorMessage ? (
        <div className="px-4 pt-4">
          <div className="rounded-2xl border border-dashed border-[color:var(--honey-line)] bg-background px-4 py-3 text-sm text-muted-foreground">
            {errorMessage}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3 px-4 py-4">
        {stats?.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--cream)]/60 px-3 py-3"
          >
            <item.icon className="size-4 text-[color:var(--sage)]" />
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="mx-4 mb-4 rounded-2xl border border-[color:var(--honey-line)] bg-background/80 px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <MapPinned className="size-4 text-[color:var(--gold)]" />
          <span className="font-medium">Atualizacao em tempo real</span>
        </div>
        <p className="mt-2">
          {snapshot
            ? `Ultima posicao recebida ${new Date(snapshot.updatedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}.`
            : "Assim que a entrega entrar em rota, o mapa sera atualizado automaticamente."}
        </p>
      </div>
    </div>
  );
}

function toLatLng(point: { latitude: number; longitude: number }): LatLngExpression {
  return [point.latitude, point.longitude];
}
