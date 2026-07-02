import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  formatBRL,
  getOrderMetadataValue,
  getOrderNeighborhood,
  type Pedido,
  type PedidoItem,
} from "@/lib/db";
import {
  fetchKitchenOrdersServer,
  fetchKdsOrderItemsServer,
} from "@/lib/api/delivery-panel.functions";
import { fetchOperationalStatusServer } from "@/lib/api/operational-config.functions";
import { resolveProductImage } from "@/lib/cardapio";
import { useMesaQrKitchenAutoPrint } from "@/hooks/use-mesa-qr-kitchen-auto-print";
import {
  Bell,
  Check,
  ClipboardCheck,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  extractMesaQrCustomerName,
  extractMesaQrNumero,
} from "@/lib/mesas-settings";
import { isKitchenOrderChannel } from "@/lib/kitchen-stage";
import { isDemoSession } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { usePainelNavigate } from "@/lib/painel/use-painel-navigate";

export const Route = createFileRoute("/_authenticated/painel/cozinha")({
  component: CozinhaKdsPage,
});

function CozinhaKdsPage() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  const navigate = usePainelNavigate();
  const {
    data: pedidos = [],
    error,
    isLoading,
    isFetching,
    isFetched,
  } = useQuery({
    queryKey: ["kitchen-pedidos", tenantSlug],
    queryFn: () => fetchKitchenOrdersServer({ data: tenantSlug }),
    refetchInterval: 30_000,
  });
  const { data: operacao } = useQuery({
    queryKey: ["kitchen-operacao", tenantSlug],
    queryFn: () => fetchOperationalStatusServer({ data: tenantSlug }),
    staleTime: 60_000,
  });

  const pedidosConhecidos = useRef<Set<string> | null>(null);

  useMesaQrKitchenAutoPrint({
    tenantSlug,
    pedidos,
    isReady: isFetched && !isLoading,
  });

  useEffect(() => {
    if (isDemoSession()) return;
    const ch = supabase
      .channel("kitchen-kds")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        void qc.invalidateQueries({ queryKey: ["kitchen-pedidos", tenantSlug] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, tenantSlug]);

  const pedidosCozinha = useMemo(
    () =>
      pedidos.filter(
        (pedido) =>
          isKitchenOrderChannel(pedido.canal) &&
          (pedido.status === "em_preparo" || pedido.status === "pronto"),
      ),
    [pedidos],
  );

  const emPreparo = pedidosCozinha.filter((pedido) => pedido.status === "em_preparo");
  const prontos = pedidosCozinha.filter((pedido) => pedido.status === "pronto");

  useEffect(() => {
    if (!isFetched || isLoading) return;
    const ids = emPreparo.map((pedido) => pedido.id);
    const idsAtuais = new Set(ids);
    if (pedidosConhecidos.current === null) {
      pedidosConhecidos.current = idsAtuais;
      return;
    }
    const temNovo = ids.some((id) => !pedidosConhecidos.current!.has(id));
    if (temNovo) {
      tocarAlerta();
      toast.success("Nova comanda na cozinha");
    }
    pedidosConhecidos.current = idsAtuais;
  }, [emPreparo, isFetched, isLoading]);

  const lojaAberta = operacao?.loja_aberta ?? true;
  const emFila = emPreparo.length;

  const columns = [
    {
      key: "preparo",
      title: "em preparo",
      icon: <ClipboardCheck className="size-4" />,
      iconClass: "text-sage",
      iconBg: "bg-emerald-100",
      pedidos: emPreparo,
    },
    {
      key: "pronto",
      title: "prontos",
      icon: <Check className="size-4" />,
      iconClass: "text-[color:var(--gestao-green)]",
      iconBg: "bg-emerald-50",
      pedidos: prontos,
    },
  ] as const;

  return (
    <div className="kds-board -mx-4 min-h-[calc(100vh-6rem)] bg-panel-muted font-sans sm:-mx-6 lg:-mx-8">
      <div className="border-b border-[color:var(--honey-line)] bg-card px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-3 overflow-x-auto no-scrollbar">
          <div className="shrink-0">
            <h1 className="whitespace-nowrap text-base font-extrabold tracking-tight text-[color:var(--gestao-green)] sm:text-lg">
              KDS Cozinha
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[color:var(--gestao-ink)]">
                <span
                  className={cn("size-2 rounded-full", lojaAberta ? "bg-sage" : "bg-rose-500")}
                />
                {lojaAberta ? "Aberto" : "Fechado"}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">Somente visual · Plano Pro</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-nowrap items-center gap-3 sm:gap-4">
            <KitchenHeaderStat value={String(emFila)} label="na fila" />
            <KitchenHeaderStat value={String(prontos.length)} label="prontos" />
          </div>

          <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
            <KitchenTopButton
              icon={<RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />}
              label="Atualizar"
              onClick={() => void qc.invalidateQueries({ queryKey: ["kitchen-pedidos", tenantSlug] })}
            />
            <KitchenTopButton icon={<Bell className="size-3.5" />} label="Testar som" onClick={tocarAlerta} />
            <KitchenTopButton
              icon={<X className="size-3.5" />}
              label="Fechar"
              onClick={() => navigate({ to: "/painel" })}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-sm text-muted-foreground sm:px-6">Carregando comandas...</div>
      ) : null}

      {error ? (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-6">
          Falha ao carregar comandas:{" "}
          {error instanceof Error ? error.message : "erro de sincronizacao"}
        </div>
      ) : null}

      <div className="flex gap-3 overflow-x-auto px-4 py-4 sm:px-6 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-6">
        {columns.map((column) => (
          <KitchenColumn
            key={column.key}
            title={column.title}
            icon={column.icon}
            iconClass={column.iconClass}
            iconBg={column.iconBg}
            pedidos={column.pedidos}
            tenantSlug={tenantSlug}
          />
        ))}
      </div>
    </div>
  );
}

function KitchenColumn({
  title,
  icon,
  iconClass,
  iconBg,
  pedidos,
  tenantSlug,
}: {
  title: string;
  icon: ReactNode;
  iconClass: string;
  iconBg: string;
  pedidos: Pedido[];
  tenantSlug: string;
}) {
  return (
    <div className="flex min-h-[520px] w-[min(88vw,300px)] shrink-0 flex-col lg:min-h-[640px] lg:w-full">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--honey-line)] bg-card shadow-soft">
        <div className="flex items-center gap-2.5 border-b border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/35 px-3 py-2.5">
          <div
            className={cn("grid size-8 shrink-0 place-items-center rounded-full", iconBg, iconClass)}
          >
            {icon}
          </div>
          <h2 className="text-sm font-extrabold lowercase tracking-wide text-[color:var(--gestao-green)]">
            {title} ({pedidos.length})
          </h2>
        </div>

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto bg-[color:var(--gestao-cream)]/20 p-2.5 sm:p-3">
          {pedidos.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[color:var(--honey-line)] bg-card/60 px-4 py-10 text-center text-xs font-semibold text-muted-foreground">
              Nenhuma comanda nesta etapa
            </div>
          ) : (
            pedidos.map((pedido) => (
              <KitchenOrderCard key={pedido.id} pedido={pedido} tenantSlug={tenantSlug} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KitchenOrderCard({ pedido, tenantSlug }: { pedido: Pedido; tenantSlug: string }) {
  const { data: itens = [] } = useQuery({
    queryKey: ["kitchen-itens", tenantSlug, pedido.id],
    queryFn: () =>
      fetchKdsOrderItemsServer({
        data: { orderId: pedido.id, tenantSlug },
      }) as Promise<PedidoItem[]>,
  });

  const tempoMin = Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 60000);
  const clienteNome = getClienteNome(pedido);
  const origemLabel = getOrigemLabel(pedido);

  return (
    <article className="overflow-hidden rounded-xl border border-[color:var(--honey-line)]/80 bg-card shadow-[0_1px_6px_rgba(17,17,17,0.06)]">
      <div className="flex items-center justify-between bg-sage px-3 py-2.5 text-sm font-bold text-primary-foreground">
        <p className="tracking-tight">#{pedido.numero}</p>
        <p className="text-xs font-bold uppercase tracking-[0.08em] opacity-95">
          {formatTempoLabel(tempoMin)}
        </p>
      </div>

      <div className="space-y-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold text-[color:var(--gestao-ink)]">
            {clienteNome}
          </p>
          <p className="truncate text-sm font-semibold text-muted-foreground">{origemLabel}</p>
        </div>

        <ul className="space-y-1 text-sm">
          {itens.slice(0, 8).map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>
                {item.quantidade}x {item.produtos?.nome ?? "Item"}
              </span>
              <span className="font-semibold text-muted-foreground">{formatBRL(item.preco_unitario)}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          {itens.slice(0, 4).map((item) => (
            <div key={item.id} className="size-10 overflow-hidden rounded-full border border-[color:var(--honey-line)]">
              <img
                src={resolveProductImage("", item.produtos?.imagem_url)}
                alt=""
                className="size-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function KitchenHeaderStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="shrink-0 whitespace-nowrap text-center">
      <p className="text-sm font-extrabold leading-none text-[color:var(--gestao-ink)] sm:text-base">
        {value}
      </p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground sm:text-[10px]">
        {label}
      </p>
    </div>
  );
}

function KitchenTopButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 px-2 py-1.5 text-[11px] font-bold text-[color:var(--gestao-ink)] transition hover:bg-white sm:px-2.5"
    >
      {icon}
      {label}
    </button>
  );
}

function getClienteNome(pedido: Pedido) {
  const cliente = getOrderMetadataValue(pedido.observacoes, "cliente");
  if (cliente) return cliente;
  if (pedido.canal === "qrcode") {
    return extractMesaQrCustomerName(pedido.observacoes) ?? "Cliente mesa QR";
  }
  if (pedido.canal === "mesa") return "Cliente mesa";
  if (pedido.canal === "balcao") return "Cliente balcao";
  return "Cliente delivery";
}

function getOrigemLabel(pedido: Pedido) {
  if (pedido.canal === "qrcode" || pedido.canal === "mesa") {
    const mesa = extractMesaQrNumero(pedido.observacoes);
    return mesa != null ? `Mesa ${mesa}` : "Mesa";
  }
  if (pedido.canal === "balcao") return "Balcao";
  return getOrderNeighborhood(pedido);
}

function formatTempoLabel(tempoMin: number) {
  if (tempoMin <= 0) return "agora";
  if (tempoMin === 1) return "1 min";
  return `${tempoMin} min`;
}

function tocarAlerta() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
  } catch {
    // noop
  }
}
