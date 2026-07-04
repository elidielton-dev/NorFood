import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Bike,
  Clock3,
  MapPinned,
  MessageCircle,
  Navigation,
  QrCode,
  RefreshCw,
  Route as RouteIcon,
  Shuffle,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { DeliveryFleetMap } from "@/components/delivery-fleet-map-lazy";
import {
  EntregadorExpoGoQrDialog,
  EntregadorExpoGoQrPanel,
} from "@/components/entregador-expo-go-qr";
import {
  GestaoButton,
  GestaoCard,
  GestaoPage,
  GestaoSectionTitle,
  GestaoStat,
  GestaoTable,
  GestaoTableHead,
  StatusPill,
} from "@/components/gestao-ui";
import { formatBRL, getOrderMetadataValue, getOrderNeighborhood } from "@/lib/db";
import {
  fetchDeliveryPanelDataServer,
  reassignDeliveryServer,
  toggleRiderOnlineServer,
  type DeliveryPanelData,
} from "@/lib/api/delivery-panel.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/_authenticated/painel/delivery")({
  component: DeliveryManagementPage,
});

type PedidoRow = Tables<"pedidos">;
type EntregaRow = Tables<"entregas">;
type LocationRow = Tables<"entregadores_localizacao">;
type RouteRow = Tables<"rotas_entrega">;
type ProfileRow = Pick<Tables<"profiles">, "id" | "nome" | "telefone" | "avatar_url">;

type RiderProfileRow = {
  user_id: string;
  online: boolean;
  updated_at: string;
  vehicle: string | null;
  plate: string | null;
  support_phone: string | null;
};

const LOCATION_FRESHNESS_WINDOW_MS = 3 * 60 * 1000;
async function fetchDeliveryPanelData(tenantSlug: string): Promise<DeliveryPanelData> {
  return await fetchDeliveryPanelDataServer({ data: tenantSlug });
}

function origemPedidoLabel(pedido: PedidoRow | undefined) {
  if (!pedido) return null;
  const row = pedido as PedidoRow & { origem_venda?: string | null; modo_entrega?: string | null };
  const origem = row.origem_venda ?? getOrderMetadataValue(pedido.observacoes, "origem");
  const modo = row.modo_entrega ?? getOrderMetadataValue(pedido.observacoes, "modo");
  const parts: string[] = [];
  if (origem) parts.push(origem === "whatsapp" ? "WhatsApp" : origem);
  if (modo === "retirada") parts.push("Retirada");
  else if (modo === "delivery") parts.push("Delivery");
  return parts.length ? parts.join(" · ") : null;
}

function DeliveryManagementPage() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [qrRiderId, setQrRiderId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["delivery-panel-real", tenantSlug],
    queryFn: () => fetchDeliveryPanelData(tenantSlug),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("delivery-panel-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        void qc.invalidateQueries({ queryKey: ["delivery-panel-real", tenantSlug] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "entregas" }, () => {
        void qc.invalidateQueries({ queryKey: ["delivery-panel-real", tenantSlug] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rotas_entrega" }, () => {
        void qc.invalidateQueries({ queryKey: ["delivery-panel-real", tenantSlug] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entregadores_localizacao" },
        () => {
          void qc.invalidateQueries({ queryKey: ["delivery-panel-real", tenantSlug] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "entregador_perfis" }, () => {
        void qc.invalidateQueries({ queryKey: ["delivery-panel-real", tenantSlug] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, tenantSlug]);

  const pedidos = useMemo(() => data?.pedidos ?? [], [data?.pedidos]);
  const entregas = useMemo(() => data?.entregas ?? [], [data?.entregas]);
  const locations = useMemo(() => data?.locations ?? [], [data?.locations]);
  const routes = useMemo(() => data?.routes ?? [], [data?.routes]);
  const profiles = useMemo(() => data?.profiles ?? [], [data?.profiles]);
  const riderProfiles = useMemo(() => data?.riderProfiles ?? [], [data?.riderProfiles]);

  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const locationsByRider = useMemo(
    () => new Map(locations.map((location) => [location.entregador_id, location])),
    [locations],
  );
  const riderProfilesById = useMemo(
    () => new Map(riderProfiles.map((profile) => [profile.user_id, profile])),
    [riderProfiles],
  );
  const pedidosById = useMemo(
    () => new Map(pedidos.map((pedido) => [pedido.id, pedido])),
    [pedidos],
  );
  const routesByPedidoId = useMemo(
    () => new Map(routes.map((route) => [route.pedido_id, route])),
    [routes],
  );

  const riderIds = useMemo(() => {
    const ids = new Set<string>();
    riderProfiles.forEach((profile) => ids.add(profile.user_id));
    locations.forEach((location) => ids.add(location.entregador_id));
    routes.forEach((route) => ids.add(route.entregador_id));
    pedidos.forEach((pedido) => {
      if (pedido.entregador_id) ids.add(pedido.entregador_id);
    });
    entregas.forEach((entrega) => {
      if (entrega.motoboy_id) ids.add(entrega.motoboy_id);
    });
    return [...ids];
  }, [entregas, locations, pedidos, riderProfiles, routes]);

  const riders = useMemo(
    () =>
      riderIds.map((riderId) => {
        const profile = profilesById.get(riderId);
        const riderProfile = riderProfilesById.get(riderId);
        const location = locationsByRider.get(riderId);
        const activeRoutes = routes.filter(
          (route) => route.entregador_id === riderId && route.status !== "entregue",
        );
        const activeOrders = pedidos.filter(
          (pedido) =>
            pedido.entregador_id === riderId &&
            pedido.status !== "entregue" &&
            pedido.status !== "cancelado",
        );
        const effectiveOnline = deriveEffectiveOnline(
          riderProfile?.online ?? false,
          location?.status ?? null,
          location?.updated_at ?? null,
        );
        const riderUpdatedAt = mostRecentTimestamp(
          riderProfile?.updated_at ?? null,
          location?.updated_at ?? null,
        );

        return {
          id: riderId,
          nome: profile?.nome ?? `Entregador ${riderId.slice(0, 6)}`,
          telefone: profile?.telefone ?? riderProfile?.support_phone ?? "",
          avatarUrl: profile?.avatar_url ?? "",
          vehicle: riderProfile?.vehicle ?? "Moto",
          plate: riderProfile?.plate ?? "---0000",
          online: effectiveOnline,
          status: normalizeRiderStatus(
            effectiveOnline,
            location?.status ?? null,
            activeOrders.length,
          ),
          speed: Number(location?.speed ?? 0),
          battery: location?.battery ?? null,
          updatedAt: riderUpdatedAt,
          activeOrders,
          activeRoutes,
        };
      }),
    [locationsByRider, pedidos, profilesById, riderIds, riderProfilesById, routes],
  );

  const selectedRider = riders.find((rider) => rider.id === selectedRiderId) ?? riders[0] ?? null;
  const qrRider = riders.find((rider) => rider.id === qrRiderId) ?? null;
  const filteredDeliveries = selectedRider
    ? entregas.filter(
        (entrega) =>
          entrega.motoboy_id === selectedRider.id ||
          (!entrega.motoboy_id && entrega.status === "pendente"),
      )
    : entregas;

  const pendingDeliveries = entregas.filter((entrega) => entrega.status === "pendente").length;
  const inRouteDeliveries = entregas.filter(
    (entrega) => !["pendente", "entregue", "cancelado"].includes(entrega.status),
  ).length;
  const completedDeliveries = entregas.filter((entrega) => entrega.status === "entregue").length;
  const onlineRiders = riders.filter((rider) => rider.online).length;

  async function toggleRiderOnline(riderId: string, nextOnline: boolean) {
    try {
      await toggleRiderOnlineServer({
        data: { tenantSlug: tenantSlug!, riderId, online: nextOnline },
      });
      toast.success(nextOnline ? "Entregador ficou online." : "Entregador ficou offline.");
      await qc.invalidateQueries({ queryKey: ["delivery-panel-real", tenantSlug] });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar o entregador.");
    }
  }

  async function reassignDelivery(deliveryId: string) {
    try {
      const result = await reassignDeliveryServer({
        data: { tenantSlug: tenantSlug!, deliveryId },
      });
      const rider = riders.find((item) => item.id === result.riderId);
      toast.success(`Entrega movida para ${rider?.nome ?? "outro entregador"}.`);
      await qc.invalidateQueries({ queryKey: ["delivery-panel-real", tenantSlug] });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel trocar o entregador.",
      );
    }
  }

  function contactRider(riderId: string) {
    const rider = riders.find((item) => item.id === riderId);
    const digits = (rider?.telefone ?? "").replace(/\D/g, "");
    if (!digits) {
      toast.error("O entregador nao possui telefone cadastrado.");
      return;
    }
    window.open(
      `https://wa.me/55${digits}?text=${encodeURIComponent("Mensagem do gestor Abelha & Mel")}`,
      "_blank",
    );
  }

  return (
    <GestaoPage
      title="Entregadores"
      subtitle="Painel operacional conectado ao Supabase real com fila, localizacao e entregas em tempo real."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GestaoStat
          label="Entregadores online"
          value={String(onlineRiders)}
          icon={<Bike className="size-5" />}
        />
        <GestaoStat
          label="Aguardando aceite"
          value={String(pendingDeliveries)}
          icon={<Clock3 className="size-5" />}
        />
        <GestaoStat
          label="Em rota"
          value={String(inRouteDeliveries)}
          icon={<Navigation className="size-5" />}
        />
        <GestaoStat
          label="Concluidas"
          value={String(completedDeliveries)}
          icon={<Wallet className="size-5" />}
        />
      </div>

      <GestaoCard>
        <GestaoSectionTitle
          eyebrow="Expo Go"
          title="QR Code Expo Go — app entregador"
          description="Escaneie com o app Expo Go no celular. O Metro roda na VPS (porta 8081)."
        />
        <div className="mt-5">
          <EntregadorExpoGoQrPanel />
        </div>
      </GestaoCard>

      <DeliveryFleetMap
        riders={riders.map((rider) => {
          const location = locationsByRider.get(rider.id);
          return {
            id: rider.id,
            nome: rider.nome,
            status: rider.status,
            speed: rider.speed,
            battery: rider.battery,
            updatedAt: rider.updatedAt,
            location: location
              ? {
                  latitude: location.latitude,
                  longitude: location.longitude,
                }
              : null,
            activeOrders: rider.activeOrders.map((pedido) => ({
              id: pedido.id,
              numero: pedido.numero,
            })),
          };
        })}
      />

      {error ? (
        <GestaoCard>
          <p className="text-sm font-semibold text-destructive">
            Falha ao carregar o painel de entregas.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "Nao foi possivel sincronizar os dados reais da gestao."}
          </p>
        </GestaoCard>
      ) : null}

      <GestaoCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <GestaoSectionTitle
            eyebrow="Equipe"
            title="Entregadores ativos"
            description="Selecione um entregador para filtrar a fila e acompanhar a operacao."
          />
          <GestaoButton
            variant="secondary"
            onClick={() => void qc.invalidateQueries({ queryKey: ["delivery-panel-real", tenantSlug] })}
          >
            <RefreshCw className="size-4" />
            Atualizar
          </GestaoButton>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {riders.map((rider) => (
            <div
              key={rider.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedRiderId(rider.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedRiderId(rider.id);
                }
              }}
              className={`cursor-pointer rounded-3xl border p-4 shadow-soft transition ${
                selectedRider?.id === rider.id
                  ? "border-[color:var(--gestao-green)] bg-[color:var(--gestao-cream)]/70"
                  : "border-[color:var(--honey-line)] bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-[color:var(--gestao-ink)]">
                    {rider.nome}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {rider.vehicle} {rider.plate ? `- ${rider.plate}` : ""}
                  </p>
                </div>
                <StatusPill tone={rider.online ? "success" : "neutral"}>{rider.status}</StatusPill>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <InfoPill
                  label="Velocidade"
                  value={`${rider.speed > 0 ? Math.round(rider.speed * 3.6) : 0} km/h`}
                />
                <InfoPill label="Bateria" value={rider.battery ? `${rider.battery}%` : "--"} />
                <InfoPill label="Entregas" value={String(rider.activeOrders.length)} />
                <InfoPill
                  label="Ultima atualizacao"
                  value={
                    rider.updatedAt
                      ? new Date(rider.updatedAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--"
                  }
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <GestaoButton
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    setQrRiderId(rider.id);
                  }}
                >
                  <QrCode className="size-3.5" />
                  QR Expo Go
                </GestaoButton>
                <GestaoButton
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedRiderId(rider.id);
                  }}
                >
                  <RouteIcon className="size-3.5" />
                  Ver rota
                </GestaoButton>
                <GestaoButton
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedRiderId(rider.id);
                  }}
                >
                  <UserRound className="size-3.5" />
                  Ver entregas
                </GestaoButton>
                <GestaoButton
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggleRiderOnline(rider.id, !rider.online);
                  }}
                >
                  <Shuffle className="size-3.5" />
                  {rider.online ? "Ficar offline" : "Ficar online"}
                </GestaoButton>
                <GestaoButton
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    contactRider(rider.id);
                  }}
                >
                  <MessageCircle className="size-3.5" />
                  Enviar mensagem
                </GestaoButton>
              </div>
            </div>
          ))}
        </div>
      </GestaoCard>

      <GestaoCard>
        <GestaoSectionTitle
          eyebrow="Operacao"
          title={selectedRider ? `Fila de ${selectedRider.nome}` : "Fila de entregas"}
          description="Pedidos reais, pagamento, troco e ordem de rota conectados ao banco."
        />

        <GestaoTable className="mt-5">
          <GestaoTableHead>
            <tr>
              <th className="p-3">Pedido</th>
              <th className="p-3 hidden md:table-cell">Cliente</th>
              <th className="p-3">Pagamento</th>
              <th className="p-3">Status</th>
              <th className="p-3 hidden sm:table-cell">Fila</th>
              <th className="p-3 hidden lg:table-cell">Distancia</th>
              <th className="p-3">Acoes</th>
            </tr>
          </GestaoTableHead>
          <tbody>
            {filteredDeliveries.map((delivery) => {
              const pedido = pedidosById.get(delivery.pedido_id);
              const customer = pedido?.cliente_id ? profilesById.get(pedido.cliente_id) : null;
              const route = routesByPedidoId.get(delivery.pedido_id);
              const closedDelivery = ["entregue", "cancelado"].includes(delivery.status);
              return (
                <tr key={delivery.id} className="border-t border-[color:var(--honey-line)]">
                  <td className="p-3 align-top">
                    <div className="font-semibold text-[color:var(--gestao-ink)]">
                      #{pedido?.numero ?? "--"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getOrderNeighborhood(
                        {
                          endereco: pedido?.endereco ?? delivery.endereco,
                          observacoes: pedido?.observacoes ?? null,
                          bairro: pedido?.bairro ?? delivery.bairro,
                        },
                        delivery.bairro,
                      )}
                    </div>
                    {origemPedidoLabel(pedido) ? (
                      <div className="mt-1 inline-flex rounded-md bg-[#FFF7ED] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#C45A00]">
                        {origemPedidoLabel(pedido)}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3 align-top hidden md:table-cell">
                    <div>{customer?.nome ?? "Cliente"}</div>
                    <div className="text-xs text-muted-foreground">
                      {customer?.telefone ?? "--"}
                    </div>
                  </td>
                  <td className="p-3 align-top">
                    <div className="capitalize">{pedido?.forma_pagamento ?? "--"}</div>
                    {pedido?.troco_para ? (
                      <div className="text-xs text-muted-foreground">
                        Troco: {formatBRL(pedido.troco_para)}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3 align-top">
                    <StatusPill
                      tone={
                        delivery.status === "entregue"
                          ? "success"
                          : delivery.status === "pendente"
                            ? "warning"
                            : "info"
                      }
                    >
                      {delivery.status}
                    </StatusPill>
                  </td>
                  <td className="p-3 align-top hidden sm:table-cell">
                    {closedDelivery
                      ? "Finalizada"
                      : (route?.ordem_entrega ?? pedido?.ordem_na_rota ?? "--")}
                  </td>
                  <td className="p-3 align-top hidden lg:table-cell">
                    {delivery.distancia_km ? `${delivery.distancia_km.toFixed(1)} km` : "--"}
                  </td>
                  <td className="p-3 align-top">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <GestaoButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedRiderId(delivery.motoboy_id)}
                      >
                        <MapPinned className="size-3.5" />
                        Ver rota
                      </GestaoButton>
                      <GestaoButton
                        variant="secondary"
                        size="sm"
                        onClick={() => void reassignDelivery(delivery.id)}
                      >
                        <Shuffle className="size-3.5" />
                        Trocar entregador
                      </GestaoButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </GestaoTable>

        {!filteredDeliveries.length && !isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhuma entrega encontrada para o filtro atual.
          </p>
        ) : null}
      </GestaoCard>

      <EntregadorExpoGoQrDialog
        open={qrRiderId !== null}
        onOpenChange={(open) => {
          if (!open) setQrRiderId(null);
        }}
        riderName={qrRider?.nome}
      />
    </GestaoPage>
  );
}

function normalizeRiderStatus(
  online: boolean,
  locationStatus: string | null,
  activeOrders: number,
) {
  if (!online) return "offline";
  if (locationStatus === "pausado") return "pausado";
  if (locationStatus === "em_rota") return "em rota";
  if (activeOrders > 0) return "em rota";
  return "online";
}

function deriveEffectiveOnline(
  online: boolean,
  locationStatus: string | null,
  updatedAt: string | null,
) {
  if (online) return true;
  if (!locationStatus || locationStatus === "offline") return false;
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() <= LOCATION_FRESHNESS_WINDOW_MS;
}

function mostRecentTimestamp(first: string | null, second: string | null) {
  if (!first) return second;
  if (!second) return first;
  return new Date(first).getTime() >= new Date(second).getTime() ? first : second;
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-[color:var(--gestao-ink)]">{value}</p>
    </div>
  );
}
