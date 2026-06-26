import { useEffect, useMemo, useRef, useState } from "react";
import L, { type LatLngExpression, type Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Bike, Clock3, MessageCircle, Route, SendHorizontal, Shuffle } from "lucide-react";
import { SERVICE_CITY_CONFIG } from "@/lib/city-config";
import type { FleetTrackingSnapshot } from "@/lib/delivery-tracking";

export function DeliveryFleetMap({
  riders,
}: {
  riders: Array<{
    id: string;
    nome: string;
    status: string;
    speed: number;
    battery: number | null;
    updatedAt: string | null;
    location: {
      latitude: number;
      longitude: number;
    } | null;
    activeOrders: Array<{
      id: string;
      numero: number;
    }>;
  }>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const [fleet, setFleet] = useState<FleetTrackingSnapshot>({ riders: [] });

  useEffect(() => {
    setFleet({
      riders: riders
        .map((rider) => {
          const location = rider.location;
          if (!location) return null;

          return {
            id: rider.id,
            name: rider.nome,
            photo: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(rider.nome)}`,
            status: normalizeFleetStatus(rider.status),
            speedKmh: rider.speed > 0 ? Math.round(rider.speed * 3.6) : 0,
            updatedAt: rider.updatedAt ?? new Date().toISOString(),
            battery: rider.battery,
            activeDeliveries: rider.activeOrders.length,
            deliveriesAhead: 0,
            location,
            route: [],
            completedRoute: [],
          };
        })
        .filter((item): item is FleetTrackingSnapshot["riders"][number] => Boolean(item)),
    });
  }, [riders]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([SERVICE_CITY_CONFIG.center.latitude, SERVICE_CITY_CONFIG.center.longitude], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;

    markers.clearLayers();

    const boundsPoints: LatLngExpression[] = [];

    fleet.riders.forEach((rider, index) => {
      const color = ["#3D5A40", "#556B57", "#D8A03D", "#F2C14E"][index % 4] ?? "#3D5A40";
      const icon = L.divIcon({
        className: "fleet-pin",
        html: `<div style="width:34px;height:34px;border-radius:999px;background:${color};border:3px solid white;box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;color:white;font-size:17px;line-height:1">&#127949;</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const location = [rider.location.latitude, rider.location.longitude] as LatLngExpression;
      boundsPoints.push(location);
      L.marker(location, { icon })
        .bindTooltip(`${rider.name} - ${rider.activeDeliveries} entregas`)
        .addTo(markers);
    });

    if (boundsPoints.length) {
      map.fitBounds(L.latLngBounds(boundsPoints).pad(0.35));
    } else {
      map.setView([SERVICE_CITY_CONFIG.center.latitude, SERVICE_CITY_CONFIG.center.longitude], 12);
    }
  }, [fleet]);

  const summary = useMemo(
    () => ({
      online: fleet.riders.filter((item) => item.status !== "offline").length,
      active: fleet.riders.reduce((sum, item) => sum + item.activeDeliveries, 0),
      averageSpeed:
        fleet.riders.length > 0
          ? Math.round(
              fleet.riders.reduce((sum, item) => sum + item.speedKmh, 0) / fleet.riders.length,
            )
          : 0,
    }),
    [fleet],
  );

  return (
    <section className="rounded-[2rem] border border-[color:var(--honey-line)] bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gold">Rastreamento ao vivo</p>
          <h3 className="mt-2 font-display text-3xl text-[color:var(--gestao-ink)]">
            Frota em tempo real
          </h3>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Localizacao atual dos entregadores em operacao no painel.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <StatChip icon={Bike} label="Online" value={String(summary.online)} />
          <StatChip icon={Route} label="Entregas" value={String(summary.active)} />
          <StatChip icon={Clock3} label="Velocidade" value={`${summary.averageSpeed} km/h`} />
        </div>
      </div>

      <div
        ref={containerRef}
        className="mt-5 h-[24rem] overflow-hidden rounded-[1.75rem] bg-[linear-gradient(180deg,#FAF5EB,#EFE3CC)]"
      />

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {fleet.riders.map((rider) => (
          <div
            key={rider.id}
            className="rounded-3xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/45 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-[color:var(--gestao-ink)]">
                  {rider.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rider.activeDeliveries} entregas - {rider.speedKmh} km/h
                </p>
              </div>
              <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold capitalize">
                {rider.status.replace("_", " ")}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <InfoPill
                label="Ultima atualizacao"
                value={new Date(rider.updatedAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
              <InfoPill label="Bateria" value={rider.battery ? `${rider.battery}%` : "--"} />
              <InfoPill
                label="Fila ativa"
                value={rider.activeDeliveries ? `${rider.activeDeliveries} em rota` : "Livre"}
              />
              <InfoPill label="Em rota" value={String(rider.activeDeliveries)} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton icon={Route} label="Ver rota" />
              <ActionButton icon={Bike} label="Ver entregas" />
              <ActionButton icon={Shuffle} label="Trocar entregador" />
              <ActionButton icon={SendHorizontal} label="Enviar mensagem" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function normalizeFleetStatus(status: string): "online" | "offline" | "em_rota" | "pausado" {
  if (status === "offline" || status === "pausado" || status === "em_rota") return status;
  if (status === "em rota") return "em_rota";
  return "online";
}

function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bike;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--honey-line)] bg-background px-3 py-2">
      <Icon className="size-4 text-[color:var(--gestao-green)]" />
      <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[color:var(--gestao-ink)]">{value}</p>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-[color:var(--gestao-ink)]">{value}</p>
    </div>
  );
}

function ActionButton({ icon: Icon, label }: { icon: typeof MessageCircle; label: string }) {
  return (
    <button className="inline-flex items-center gap-2 rounded-full border border-[color:var(--honey-line)] bg-background px-3 py-2 text-xs font-semibold text-[color:var(--gestao-ink)] transition hover:border-[color:var(--gestao-green)]">
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
