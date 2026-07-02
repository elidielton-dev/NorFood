import { createFileRoute } from "@tanstack/react-router";
import { usePainelNavigate } from "@/lib/painel/use-painel-navigate";
import { usePainelSearch } from "@/lib/painel/use-painel-search";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  formatBRL,
  getOrderMetadataValue,
  getOrderNeighborhood,
  hasPendingMercadoPagoPayment,
  type Pedido,
  type PedidoItem,
} from "@/lib/db";
import {
  fetchGestaoDeliveryOrdersServer,
  fetchPanelOrderItemsServer,
  updateGestaoDeliveryKitchenStageServer,
  updateGestaoDeliveryOrderStatusServer,
} from "@/lib/api/delivery-panel.functions";
import { fetchOperationalStatusServer } from "@/lib/api/operational-config.functions";
import { resolveProductImage } from "@/lib/cardapio";
import { getKitchenStage } from "@/lib/kitchen-stage";
import {
  ArrowRight,
  Banknote,
  Bell,
  Check,
  CircleCheckBig,
  ClipboardCheck,
  Clock,
  CreditCard,
  MessageCircle,
  PackageCheck,
  Printer,
  RefreshCw,
  ShoppingBasket,
  Smartphone,
  Tag,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { GestaoButton } from "@/components/gestao-ui";
import { KdsOrderDetailModal } from "@/components/kds-order-detail-modal";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { printHtmlReceipt } from "@/lib/print";
import { extractMesaQrCustomerName } from "@/lib/mesas-settings";
import { isDemoSession } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { useTenantSlug } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/_authenticated/painel/gestao-delivery")({
  validateSearch: (search: Record<string, unknown>) => ({
    foco: typeof search.foco === "string" ? search.foco : undefined,
  }),
  component: DeliveryFlowPage,
});

const parseKdsSearch = (search: Record<string, unknown>) => ({
  foco: typeof search.foco === "string" ? search.foco : undefined,
});

function DeliveryFlowPage() {
  const tenantSlug = useTenantSlug();
  const { foco } = usePainelSearch(parseKdsSearch);
  const qc = useQueryClient();
  const navigate = usePainelNavigate();
  const {
    data: pedidos = [],
    error,
    isLoading,
    isFetching,
    isFetched,
  } = useQuery({
    queryKey: ["gestao-delivery-pedidos", tenantSlug],
    queryFn: () => fetchGestaoDeliveryOrdersServer({ data: tenantSlug }),
    refetchInterval: 60_000,
  });
  const { data: operacao } = useQuery({
    queryKey: ["gestao-delivery-operacao", tenantSlug],
    queryFn: () => fetchOperationalStatusServer({ data: tenantSlug }),
    staleTime: 60_000,
  });
  const [reciboPedido, setReciboPedido] = useState<Pedido | null>(null);
  const [detalhePedido, setDetalhePedido] = useState<Pedido | null>(null);
  const pedidosConhecidos = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (isDemoSession()) return;
    const ch = supabase
      .channel("gestao-delivery")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        qc.invalidateQueries({ queryKey: ["gestao-delivery-pedidos", tenantSlug] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, tenantSlug]);

  useEffect(() => {
    if (!isFetched || isLoading) return;

    const deliveryIds = pedidos
      .filter((pedido) => pedido.canal === "delivery")
      .map((pedido) => pedido.id);
    const idsAtuais = new Set(deliveryIds);

    if (pedidosConhecidos.current === null) {
      pedidosConhecidos.current = idsAtuais;
      return;
    }

    const temPedidoNovo = deliveryIds.some((id) => !pedidosConhecidos.current!.has(id));
    if (temPedidoNovo) {
      tocarAlerta();
      toast.success("Novo pedido entrou no Gestao delivery");
    }

    pedidosConhecidos.current = idsAtuais;
  }, [pedidos, isFetched, isLoading]);

  useEffect(() => {
    if (foco !== "separacao") return;
    const alvo = document.getElementById("gestao-separacao");
    alvo?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [foco, isLoading]);

  const pedidosFiltrados = useMemo(
    () => pedidos.filter((pedido) => pedido.canal === "delivery"),
    [pedidos],
  );

  const aguardandoPagamento = pedidosFiltrados.filter((pedido) =>
    hasPendingMercadoPagoPayment(pedido),
  );
  const pedidosOperacionais = pedidosFiltrados.filter(
    (pedido) => !hasPendingMercadoPagoPayment(pedido),
  );
  const recebidos = pedidosOperacionais.filter((pedido) => pedido.status === "aberto");
  const preparo = pedidosOperacionais.filter((pedido) => pedido.status === "em_preparo");
  const prontos = pedidosOperacionais.filter((pedido) => pedido.status === "pronto");
  const emRota = pedidosOperacionais.filter((pedido) => pedido.status === "em_entrega");
  const entregues = pedidosFiltrados.filter((pedido) => pedido.status === "entregue");
  const naoEntregues = recebidos.length + preparo.length + prontos.length + emRota.length;
  const tempoMedio = calcularTempoMedioMinutos([...recebidos, ...preparo, ...prontos, ...emRota]);
  const lojaAberta = operacao?.loja_aberta ?? true;

  const kanbanColumns = [
    {
      key: "pendente",
      title: "pendente",
      icon: <Clock className="size-4" />,
      iconClass: "text-amber-700",
      iconBg: "bg-amber-100",
      pedidos: recebidos,
    },
    {
      key: "aprovados",
      title: "aprovados",
      icon: <ClipboardCheck className="size-4" />,
      iconClass: "text-sage",
      iconBg: "bg-emerald-100",
      pedidos: preparo,
    },
    {
      key: "separacao",
      title: "separacao",
      icon: <ShoppingBasket className="size-4" />,
      iconClass: "text-[color:var(--gestao-gold-deep)]",
      iconBg: "bg-[color:var(--gestao-cream)]",
      pedidos: prontos,
    },
    {
      key: "entregando",
      title: "entregando",
      icon: <Truck className="size-4" />,
      iconClass: "text-[color:var(--gestao-green)]",
      iconBg: "bg-emerald-50",
      pedidos: emRota,
    },
  ] as const;

  return (
    <div className="kds-board -mx-4 min-h-[calc(100vh-6rem)] bg-panel-muted font-sans sm:-mx-6 lg:-mx-8">
      <div className="border-b border-[color:var(--honey-line)] bg-card px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-3 overflow-x-auto no-scrollbar">
          <div className="shrink-0">
            <h1 className="whitespace-nowrap text-base font-extrabold tracking-tight text-[color:var(--gestao-green)] sm:text-lg">
              Gestor delivery
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[color:var(--gestao-ink)]">
                <span
                  className={cn("size-2 rounded-full", lojaAberta ? "bg-sage" : "bg-rose-500")}
                />
                {lojaAberta ? "Aberto" : "Fechado"}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">Fecha 19:00</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-nowrap items-center gap-3 sm:gap-4">
            <KdsHeaderStat value={String(naoEntregues)} label="nao entregues" />
            <KdsHeaderStat value={String(entregues.length)} label="concluidos" />
            <KdsHeaderStat value={`${tempoMedio} min`} label="tempo medio" />
          </div>

          <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
            <KdsTopButton
              icon={<RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />}
              label="Atualizar"
              onClick={() => qc.invalidateQueries({ queryKey: ["gestao-delivery-pedidos", tenantSlug] })}
            />
            <KdsTopButton
              icon={<Bell className="size-3.5" />}
              label="Testar som"
              onClick={tocarAlerta}
            />
            <KdsTopButton
              icon={<MessageCircle className="size-3.5" />}
              label="Chat"
              onClick={() => toast.info("Chat em breve")}
            />
            <KdsTopButton
              icon={<X className="size-3.5" />}
              label="Fechar"
              onClick={() => navigate({ to: "/painel" })}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-sm text-muted-foreground sm:px-6">Carregando pedidos...</div>
      ) : null}

      {error ? (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-6">
          Falha ao carregar pedidos:{" "}
          {error instanceof Error ? error.message : "erro de sincronizacao"}
        </div>
      ) : null}

      {aguardandoPagamento.length > 0 ? (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-6">
          <strong>{aguardandoPagamento.length}</strong> pedido(s) aguardando confirmacao do Mercado
          Pago.
        </div>
      ) : null}

      <div
        className={cn(
          "flex gap-3 overflow-x-auto px-4 py-4 sm:px-6 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-6",
          foco === "separacao" && "scroll-px-4",
        )}
      >
        {kanbanColumns.map((column) => (
          <div
            key={column.key}
            id={column.key === "separacao" ? "gestao-separacao" : undefined}
            className={cn(
              foco === "separacao" &&
                column.key === "separacao" &&
                "rounded-2xl ring-2 ring-sage ring-offset-2",
            )}
          >
            <KdsColumn
              key={column.key}
              title={column.title}
              icon={column.icon}
              iconClass={column.iconClass}
              iconBg={column.iconBg}
              pedidos={column.pedidos}
              tenantSlug={tenantSlug}
              onPrint={setReciboPedido}
              onOpenDetail={setDetalhePedido}
            />
          </div>
        ))}
      </div>

      <KdsOrderDetailModal
        pedido={detalhePedido}
        tenantSlug={tenantSlug}
        onClose={() => setDetalhePedido(null)}
        onPrint={(pedido) => {
          setDetalhePedido(null);
          setReciboPedido(pedido);
        }}
      />

      {reciboPedido ? (
        <ReciboModal
          pedido={reciboPedido}
          tenantSlug={tenantSlug}
          onClose={() => setReciboPedido(null)}
        />
      ) : null}
    </div>
  );
}

function KdsHeaderStat({ value, label }: { value: string; label: string }) {
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

function KdsTopButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 px-2 py-1.5 text-[11px] font-bold text-[color:var(--gestao-ink)] transition hover:bg-white disabled:opacity-50 sm:px-2.5"
    >
      {icon}
      {label}
    </button>
  );
}

function KdsColumn({
  title,
  icon,
  iconClass,
  iconBg,
  pedidos,
  tenantSlug,
  onPrint,
  onOpenDetail,
}: {
  title: string;
  icon: ReactNode;
  iconClass: string;
  iconBg: string;
  pedidos: Pedido[];
  tenantSlug: string;
  onPrint: (pedido: Pedido) => void;
  onOpenDetail: (pedido: Pedido) => void;
}) {
  return (
    <div className="flex min-h-[520px] w-[min(88vw,300px)] shrink-0 flex-col lg:min-h-[640px] lg:w-full">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--honey-line)] bg-card shadow-soft">
        <div className="flex items-center gap-2.5 border-b border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/35 px-3 py-2.5">
          <div
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full",
              iconBg,
              iconClass,
            )}
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
              Nenhum pedido nesta etapa
            </div>
          ) : (
            pedidos.map((pedido) => (
              <KdsOrderCard
                key={pedido.id}
                pedido={pedido}
                tenantSlug={tenantSlug}
                onPrint={onPrint}
                onOpenDetail={onOpenDetail}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KdsOrderCard({
  pedido,
  tenantSlug,
  onPrint,
  onOpenDetail,
}: {
  pedido: Pedido;
  tenantSlug: string;
  onPrint: (pedido: Pedido) => void;
  onOpenDetail: (pedido: Pedido) => void;
}) {
  const qc = useQueryClient();
  const { data: itens = [] } = useQuery({
    queryKey: ["itens", tenantSlug, pedido.id],
    queryFn: () =>
      fetchPanelOrderItemsServer({
        data: { orderId: pedido.id, tenantSlug },
      }) as Promise<PedidoItem[]>,
  });
  const [updating, setUpdating] = useState(false);

  const tempoMin = Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 60000);
  const clienteNome = getClienteNome(pedido);
  const bairro = getOrderNeighborhood(pedido);
  const acaoPrincipal = getPrimaryAction(pedido);
  const PaymentIcon = getPaymentIcon(pedido.forma_pagamento);

  async function avancar(status: "em_preparo" | "pronto" | "em_entrega" | "entregue") {
    try {
      setUpdating(true);
      await updateGestaoDeliveryOrderStatusServer({
        data: {
          orderId: pedido.id,
          status,
          tenantSlug,
        },
      });
      toast.success(`Pedido #${pedido.numero} atualizado.`);
      qc.invalidateQueries({ queryKey: ["gestao-delivery-pedidos", tenantSlug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nao foi possivel atualizar o pedido.");
    } finally {
      setUpdating(false);
    }
  }

  async function executarAcaoPrincipal() {
    if (!acaoPrincipal) return;
    if (acaoPrincipal.kind === "producao") {
      try {
        setUpdating(true);
        await updateGestaoDeliveryKitchenStageServer({
          data: { tenantSlug, orderId: pedido.id, stage: "producao" },
        });
        toast.success(`Pedido #${pedido.numero} em producao.`);
        qc.invalidateQueries({ queryKey: ["gestao-delivery-pedidos", tenantSlug] });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nao foi possivel atualizar o pedido.");
      } finally {
        setUpdating(false);
      }
      return;
    }
    void avancar(acaoPrincipal.nextStatus);
  }

  async function cancelar() {
    try {
      setUpdating(true);
      await updateGestaoDeliveryOrderStatusServer({
        data: {
          orderId: pedido.id,
          status: "cancelado",
          tenantSlug,
        },
      });
      toast.success(`Pedido #${pedido.numero} cancelado`);
      qc.invalidateQueries({ queryKey: ["gestao-delivery-pedidos", tenantSlug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nao foi possivel cancelar o pedido.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <article
      className="cursor-pointer overflow-hidden rounded-xl border border-[color:var(--honey-line)]/80 bg-card shadow-[0_1px_6px_rgba(17,17,17,0.06)] transition hover:border-primary/50 hover:shadow-[0_2px_10px_rgba(255,122,0,0.12)]"
      onClick={() => onOpenDetail(pedido)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetail(pedido);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Abrir pedido ${pedido.numero}`}
    >
      <div className="flex items-center justify-between bg-sage px-3 py-2.5 text-sm font-bold text-primary-foreground">
        <p className="tracking-tight">
          #{pedido.numero} - {getOrderShortCode(pedido)}
        </p>
        <p className="text-xs font-bold uppercase tracking-[0.08em] opacity-95">
          {formatTempoLabel(tempoMin)}
        </p>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-[color:var(--gestao-ink)]">
              {clienteNome}
            </p>
            <p className="truncate text-sm font-semibold text-muted-foreground">{bairro}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPrint(pedido);
              }}
              className="grid size-8 place-items-center rounded-lg text-[color:var(--gestao-green)] transition hover:bg-[color:var(--gestao-cream)]"
              aria-label="Imprimir"
            >
              <Printer className="size-4" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toast.info("Etiqueta em breve");
              }}
              className="grid size-8 place-items-center rounded-lg text-[color:var(--gestao-gold-deep)] transition hover:bg-[color:var(--gestao-cream)]"
              aria-label="Etiqueta"
            >
              <Tag className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-extrabold text-[color:var(--gestao-ink)]">
            {formatBRL(Number(pedido.total))}
          </p>
          <PaymentIcon className="size-5 text-[color:var(--gestao-green)]" />
        </div>

        <div className="flex flex-wrap gap-2">
          {itens.slice(0, 6).map((item) => (
            <div key={item.id} className="flex w-14 flex-col items-center gap-1">
              <div className="size-12 overflow-hidden rounded-full border-2 border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]">
                <img
                  src={resolveProductImage("", item.produtos?.imagem_url)}
                  alt={item.produtos?.nome ?? "Produto"}
                  className="size-full object-cover"
                />
              </div>
              <span className="text-[11px] font-extrabold text-[color:var(--gestao-ink)]">
                {formatQuantidade(item.quantidade)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--honey-line)] pt-3">
          {pedido.status !== "entregue" && pedido.status !== "cancelado" ? (
            <button
              type="button"
              disabled={updating}
              onClick={(event) => {
                event.stopPropagation();
                void cancelar();
              }}
              className="grid size-9 place-items-center rounded-lg text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              aria-label="Cancelar pedido"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
          {acaoPrincipal ? (
            <button
              type="button"
              disabled={updating}
              onClick={(event) => {
                event.stopPropagation();
                void executarAcaoPrincipal();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sage px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.06em] text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {acaoPrincipal.label}
              {acaoPrincipal.icon}
            </button>
          ) : pedido.status === "entregue" || pedido.status === "cancelado" ? (
            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700">
              <CircleCheckBig className="size-3.5" />
              Concluido
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ReciboModal({
  pedido,
  tenantSlug,
  onClose,
}: {
  pedido: Pedido;
  tenantSlug: string;
  onClose: () => void;
}) {
  const { data: itens = [] } = useQuery({
    queryKey: ["itens", tenantSlug, pedido.id],
    queryFn: () =>
      fetchPanelOrderItemsServer({
        data: { orderId: pedido.id, tenantSlug },
      }) as Promise<PedidoItem[]>,
  });
  const resumo = getPedidoResumo(pedido);

  return (
    <Dialog open={Boolean(pedido)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(92vw,560px)] max-w-none max-h-[90vh] overflow-y-auto rounded-2xl border-[color:var(--honey-line)] bg-[#f7f4f1] p-5 sm:p-7">
        <div className="rounded-[24px] border border-dashed border-zinc-300 bg-white px-6 py-7 font-mono text-[#403734] shadow-sm">
          <div className="text-center">
            <p className="text-[26px] font-bold tracking-[0.18em] text-[#3d302c]">
              ====================
            </p>
            <p className="mt-2 font-display text-[22px] font-bold uppercase tracking-[0.06em] text-[#a36b2c]">
              NorFood
            </p>
            <p className="mt-1 text-[13px] text-zinc-500">
              Confeitaria afetiva - amor em forma de doce
            </p>
            <p className="mt-2 text-[26px] font-bold tracking-[0.18em] text-[#3d302c]">
              ====================
            </p>
          </div>

          <div className="mt-8 space-y-3 text-[15px]">
            <p className="text-[17px] font-bold uppercase tracking-[0.03em]">
              Cupom da confeccao de doces
            </p>
            <p>
              CUPOM ID: <span className="font-bold">ord_{pedido.numero}</span>
            </p>
            <p>DATA: {new Date(pedido.created_at).toLocaleString("pt-BR")}</p>
            <p>
              CLIENTE: <span className="font-bold">{getClienteNome(pedido)}</span>
            </p>
            {getClienteEmail(pedido) ? <p>EMAIL: {getClienteEmail(pedido)}</p> : null}
            <div className="border-t border-zinc-400 pt-3">
              <p>
                ORIGEM: <span className="font-bold">{resumo.canalLabel}</span>
              </p>
              <p>
                TIPO: <span className="font-bold">{resumo.atendimentoLabel}</span>
              </p>
              {resumo.endereco ? <p>BAIRRO: {resumo.endereco}</p> : null}
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-400 pt-5">
            <div className="mb-3 flex items-center gap-2">
              <PackageCheck className="size-4 text-[#a36b2c]" />
              <p className="text-[17px] font-bold uppercase">Produtos no pedido:</p>
            </div>
            <ul className="space-y-3 text-[15px]">
              {itens.map((item: PedidoItem) => (
                <li key={item.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p>
                      - {item.quantidade}x {item.produtos?.nome}
                    </p>
                    <p className="text-zinc-400">(Item da comanda)</p>
                  </div>
                  <span className="font-bold">OK</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 border-t border-zinc-400 pt-5">
            <div className="flex items-end justify-between gap-4">
              <p className="text-[18px] font-bold uppercase">Total geral pago:</p>
              <p className="text-[18px] font-bold text-emerald-700">
                {Number(pedido.total).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>
            <p className="mt-1 text-right text-[13px] font-bold text-[#b18434]">
              Pago via {formatarPagamento(pedido.forma_pagamento)}
            </p>
          </div>

          <div className="mt-8 text-center text-[13px] italic text-zinc-500">
            <p>------------------------------------</p>
            <p>Obrigado pela preferencia.</p>
            <p>NorFood</p>
            <p>------------------------------------</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <GestaoButton
            className="flex-1"
            onClick={async () => {
              try {
                await printHtmlReceipt(
                  `Recibo pedido ${pedido.numero}`,
                  renderKdsReceiptHtml({ pedido, itens, resumo }),
                );
                toast.success("Recibo enviado para impressao.");
                onClose();
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Nao foi possivel imprimir o recibo.",
                );
              }
            }}
          >
            <Printer className="size-4" /> Imprimir recibo
          </GestaoButton>
          <GestaoButton variant="secondary" onClick={onClose}>
            Fechar
          </GestaoButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getPedidoResumo(pedido: Pedido) {
  const observacoes = (pedido.observacoes ?? "").toLowerCase();
  const origemQuero =
    observacoes.includes("quero delivery") || observacoes.includes("quero_delivery");
  const retira =
    observacoes.includes("retira") ||
    observacoes.includes("retirada") ||
    (pedido.canal === "delivery" && !pedido.endereco);

  let canalLabel = "Delivery proprio";
  if (pedido.canal === "mesa") canalLabel = "Mesa";
  if (pedido.canal === "qrcode") canalLabel = "QR Code Mesa";
  if (pedido.canal === "balcao") canalLabel = "Balcao";
  if (pedido.canal === "ifood") canalLabel = "iFood";
  if (origemQuero) canalLabel = "Quero Delivery";

  let atendimentoLabel = "Entrega";
  if (pedido.canal === "mesa") atendimentoLabel = "Consumo na mesa";
  if (pedido.canal === "qrcode") atendimentoLabel = "Consumo na mesa";
  if (pedido.canal === "balcao") atendimentoLabel = "Retira no balcao";
  if (retira) atendimentoLabel = "Retira";

  return {
    canalLabel,
    atendimentoLabel,
    endereco: retira ? null : getOrderNeighborhood(pedido),
  };
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

function getClienteEmail(pedido: Pedido) {
  return getOrderMetadataValue(pedido.observacoes, "email");
}

function calcularTempoMedioMinutos(pedidos: Pedido[]) {
  if (pedidos.length === 0) return 0;
  const totalMinutos = pedidos.reduce((acc, pedido) => {
    return acc + Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 60000);
  }, 0);

  return Math.max(1, Math.round(totalMinutos / pedidos.length));
}

function formatTempoLabel(tempoMin: number) {
  if (tempoMin <= 0) return "poucos segundos";
  if (tempoMin === 1) return "1 minuto";
  return `${tempoMin} minutos`;
}

function getOrderShortCode(pedido: Pedido) {
  return pedido.id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function getPaymentIcon(forma: string | null) {
  if (forma === "pix") return Smartphone;
  if (forma === "credito" || forma === "debito") return CreditCard;
  return Banknote;
}

function formatQuantidade(qty: number) {
  const value = Number.isInteger(qty) ? String(qty) : qty.toLocaleString("pt-BR");
  return `${value}x`;
}

function formatarPagamento(forma: string | null) {
  if (!forma) return "pedido do sistema";
  if (forma === "credito") return "cartao de credito";
  if (forma === "debito") return "cartao de debito";
  return forma;
}

function getPrimaryAction(pedido: Pedido) {
  const status = pedido.status;
  if (status === "aberto") {
    return {
      kind: "status" as const,
      nextStatus: "em_preparo" as const,
      label: "aceitar",
      icon: <Check className="size-4" />,
    };
  }

  if (status === "em_preparo") {
    if (getKitchenStage(pedido.observacoes) === "aprovado") {
      return {
        kind: "producao" as const,
        label: "producao",
        icon: <ArrowRight className="size-4" />,
      };
    }
    return {
      kind: "status" as const,
      nextStatus: "pronto" as const,
      label: "pronto",
      icon: <Check className="size-4" />,
    };
  }

  if (status === "pronto") {
    return {
      kind: "status" as const,
      nextStatus: "em_entrega" as const,
      label: "enviar",
      icon: <ArrowRight className="size-4" />,
    };
  }

  if (status === "em_entrega") {
    return {
      kind: "status" as const,
      nextStatus: "entregue" as const,
      label: "entregue",
      icon: <Check className="size-4" />,
    };
  }

  return null;
}

function renderKdsReceiptHtml({
  pedido,
  itens,
  resumo,
}: {
  pedido: Pedido;
  itens: PedidoItem[];
  resumo: ReturnType<typeof getPedidoResumo>;
}) {
  const clienteNome = getClienteNome(pedido);
  const clienteEmail = getClienteEmail(pedido);
  const itensHtml = itens
    .map(
      (item) => `
        <li style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px;">
          <div>
            <p style="margin:0;">- ${item.quantidade}x ${escapeHtml(item.produtos?.nome ?? "Item")}</p>
            <p style="margin:4px 0 0;color:#a1a1aa;">(Item da comanda)</p>
          </div>
          <span style="font-weight:700;">OK</span>
        </li>
      `,
    )
    .join("");

  return `
    <div style="border:1px dashed #d4d4d8;border-radius:24px;background:#fff;padding:28px 24px;color:#403734;">
      <div style="text-align:center;">
        <p style="margin:0;font-size:26px;font-weight:700;letter-spacing:0.18em;color:#3d302c;">====================</p>
        <p style="margin:12px 0 0;font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#a36b2c;">NorFood</p>
        <p style="margin:4px 0 0;font-size:13px;color:#71717a;">Confeitaria afetiva - amor em forma de doce</p>
        <p style="margin:8px 0 0;font-size:26px;font-weight:700;letter-spacing:0.18em;color:#3d302c;">====================</p>
      </div>
      <div style="margin-top:32px;font-size:15px;">
        <p style="margin:0 0 12px;font-size:17px;font-weight:700;text-transform:uppercase;">Cupom da confeccao de doces</p>
        <p style="margin:0 0 8px;">CUPOM ID: <span style="font-weight:700;">ord_${pedido.numero}</span></p>
        <p style="margin:0 0 8px;">DATA: ${new Date(pedido.created_at).toLocaleString("pt-BR")}</p>
        <p style="margin:0 0 8px;">CLIENTE: <span style="font-weight:700;">${escapeHtml(clienteNome)}</span></p>
        ${clienteEmail ? `<p style="margin:0 0 8px;">EMAIL: ${escapeHtml(clienteEmail)}</p>` : ""}
        <div style="border-top:1px solid #a1a1aa;padding-top:12px;">
          <p style="margin:0 0 8px;">ORIGEM: <span style="font-weight:700;">${escapeHtml(resumo.canalLabel)}</span></p>
          <p style="margin:0 0 8px;">TIPO: <span style="font-weight:700;">${escapeHtml(resumo.atendimentoLabel)}</span></p>
          ${resumo.endereco ? `<p style="margin:0;">BAIRRO: ${escapeHtml(resumo.endereco)}</p>` : ""}
        </div>
      </div>
      <div style="margin-top:24px;border-top:1px solid #a1a1aa;padding-top:20px;">
        <div style="margin:0 0 12px;display:flex;align-items:center;gap:8px;">
          <p style="margin:0;font-size:17px;font-weight:700;text-transform:uppercase;">Produtos no pedido:</p>
        </div>
        <ul style="list-style:none;padding:0;margin:0;font-size:15px;">
          ${itensHtml}
        </ul>
      </div>
      <div style="margin-top:24px;border-top:1px solid #a1a1aa;padding-top:20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
          <p style="margin:0;font-size:18px;font-weight:700;text-transform:uppercase;">Total geral pago:</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#047857;">${Number(
            pedido.total,
          ).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}</p>
        </div>
        <p style="margin:4px 0 0;text-align:right;font-size:13px;font-weight:700;color:#b18434;">Pago via ${escapeHtml(formatarPagamento(pedido.forma_pagamento))}</p>
      </div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
