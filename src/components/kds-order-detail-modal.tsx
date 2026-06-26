import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import {
  formatBRL,
  getOrderMetadataValue,
  getOrderNeighborhood,
  type Pedido,
  type PedidoItem,
} from "@/lib/db";
import {
  fetchKdsOrderItemsServer,
  updateKdsOrderStatusServer,
} from "@/lib/api/delivery-panel.functions";
import { resolveProductImage } from "@/lib/cardapio";
import {
  ArrowRight,
  Banknote,
  Check,
  CircleCheckBig,
  Clock,
  CreditCard,
  MapPin,
  MessageSquare,
  Phone,
  Printer,
  Smartphone,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type KdsOrderDetailModalProps = {
  pedido: Pedido | null;
  onClose: () => void;
  onPrint: (pedido: Pedido) => void;
};

export function KdsOrderDetailModal({ pedido, onClose, onPrint }: KdsOrderDetailModalProps) {
  const qc = useQueryClient();
  const [updating, setUpdating] = useState(false);

  const { data: itens = [], isLoading: loadingItens } = useQuery({
    queryKey: ["itens", pedido?.id],
    queryFn: () =>
      fetchKdsOrderItemsServer({ data: { orderId: pedido!.id } }) as Promise<PedidoItem[]>,
    enabled: Boolean(pedido?.id),
  });

  if (!pedido) return null;

  const tempoMin = Math.floor((Date.now() - new Date(pedido.created_at).getTime()) / 60000);
  const resumo = getPedidoResumo(pedido);
  const acaoPrincipal = getPrimaryAction(pedido.status);
  const PaymentIcon = getPaymentIcon(pedido.forma_pagamento);
  const telefone = getClienteTelefone(pedido);
  const enderecoCompleto = getEnderecoCompleto(pedido);
  const referencia = getOrderMetadataValue(pedido.observacoes, "referencia");
  const cep = getOrderMetadataValue(pedido.observacoes, "cep");
  const cidade = getOrderMetadataValue(pedido.observacoes, "cidade");
  const uf = getOrderMetadataValue(pedido.observacoes, "uf");
  const notasLivres = getOrderFreeNotes(pedido.observacoes);
  const trocoMeta = getOrderMetadataValue(pedido.observacoes, "troco_para");
  const trocoValor =
    pedido.troco_para ?? (trocoMeta && !Number.isNaN(Number(trocoMeta)) ? Number(trocoMeta) : null);

  async function avancar(status: "em_preparo" | "pronto" | "em_entrega" | "entregue") {
    try {
      setUpdating(true);
      await updateKdsOrderStatusServer({
        data: { orderId: pedido!.id, status },
      });
      toast.success(`Pedido #${pedido!.numero} atualizado.`);
      qc.invalidateQueries({ queryKey: ["kds-pedidos"] });
      if (status === "entregue") onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nao foi possivel atualizar o pedido.");
    } finally {
      setUpdating(false);
    }
  }

  async function cancelar() {
    try {
      setUpdating(true);
      await updateKdsOrderStatusServer({
        data: { orderId: pedido!.id, status: "cancelado" },
      });
      toast.success(`Pedido #${pedido!.numero} cancelado`);
      qc.invalidateQueries({ queryKey: ["kds-pedidos"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nao foi possivel cancelar o pedido.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <Dialog open={Boolean(pedido)} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="z-[200]" />
        <DialogPrimitive.Content className="fixed inset-0 z-[201] flex items-center justify-center p-4 outline-none sm:p-6">
          <DialogPrimitive.Title className="sr-only">Pedido #{pedido.numero}</DialogPrimitive.Title>
          <div className="relative flex max-h-[min(90vh,900px)] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/30 shadow-2xl">
            <DialogPrimitive.Close className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-lg text-primary-foreground opacity-90 transition hover:bg-white/15 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/40">
              <X className="size-4" />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>
            <div className="shrink-0 bg-sage px-5 py-4 text-primary-foreground">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div>
                  <p className="text-lg font-extrabold tracking-tight">
                    #{pedido.numero} · {getOrderShortCode(pedido)}
                  </p>
                  <p className="mt-1 text-xs font-semibold opacity-90">
                    {new Date(pedido.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
                    <Clock className="size-3" />
                    {formatTempoLabel(tempoMin)}
                  </span>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] opacity-95">
                    {getStatusLabel(pedido.status)}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <DetailSection icon={<User className="size-4" />} title="Cliente">
                <DetailRow label="Nome" value={getClienteNome(pedido)} highlight />
                {telefone ? (
                  <DetailRow
                    label="Telefone"
                    value={
                      <a
                        href={`https://wa.me/55${telefone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-bold text-[color:var(--gestao-green)] hover:underline"
                      >
                        <Phone className="size-3.5" />
                        {telefone}
                      </a>
                    }
                  />
                ) : null}
                {getClienteEmail(pedido) ? (
                  <DetailRow label="E-mail" value={getClienteEmail(pedido)!} />
                ) : null}
              </DetailSection>

              <DetailSection icon={<MapPin className="size-4" />} title="Entrega">
                <DetailRow label="Tipo" value={resumo.atendimentoLabel} />
                <DetailRow label="Bairro" value={getOrderNeighborhood(pedido)} highlight />
                {enderecoCompleto ? <DetailRow label="Endereco" value={enderecoCompleto} /> : null}
                {referencia ? <DetailRow label="Referencia" value={referencia} /> : null}
                {cep || cidade ? (
                  <DetailRow
                    label="Cidade"
                    value={[cidade, uf, cep ? `CEP ${cep}` : null].filter(Boolean).join(" · ")}
                  />
                ) : null}
                <DetailRow label="Origem" value={resumo.canalLabel} />
              </DetailSection>

              <DetailSection icon={<Wallet className="size-4" />} title="Pagamento">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Forma
                    </p>
                    <p className="mt-0.5 text-sm font-extrabold capitalize text-[color:var(--gestao-ink)]">
                      {formatarPagamento(pedido.forma_pagamento)}
                    </p>
                  </div>
                  <PaymentIcon className="size-6 text-[color:var(--gestao-green)]" />
                </div>
                {trocoValor && trocoValor > 0 ? (
                  <DetailRow label="Troco para" value={formatBRL(trocoValor)} highlight />
                ) : null}
                <div className="mt-2 space-y-1.5 border-t border-[color:var(--honey-line)] pt-3 text-sm">
                  <ValueRow label="Subtotal" value={formatBRL(Number(pedido.subtotal))} />
                  {Number(pedido.taxa_entrega) > 0 ? (
                    <ValueRow
                      label="Taxa de entrega"
                      value={formatBRL(Number(pedido.taxa_entrega))}
                    />
                  ) : null}
                  {Number(pedido.desconto) > 0 ? (
                    <ValueRow
                      label="Desconto"
                      value={`-${formatBRL(Number(pedido.desconto))}`}
                      className="text-emerald-700"
                    />
                  ) : null}
                  <ValueRow
                    label="Total"
                    value={formatBRL(Number(pedido.total))}
                    highlight
                    className="text-base"
                  />
                </div>
              </DetailSection>

              <DetailSection
                icon={<MessageSquare className="size-4" />}
                title={`Itens (${itens.length})`}
              >
                {loadingItens ? (
                  <p className="text-sm text-muted-foreground">Carregando itens...</p>
                ) : itens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
                ) : (
                  <ul className="space-y-3">
                    {itens.map((item) => (
                      <li
                        key={item.id}
                        className="flex gap-3 rounded-xl border border-[color:var(--honey-line)]/70 bg-white p-3"
                      >
                        <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]">
                          <img
                            src={resolveProductImage("", item.produtos?.imagem_url)}
                            alt={item.produtos?.nome ?? "Produto"}
                            className="size-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-extrabold text-[color:var(--gestao-ink)]">
                              {item.produtos?.nome ?? "Item"}
                            </p>
                            <p className="shrink-0 text-sm font-extrabold text-[color:var(--gestao-ink)]">
                              {formatBRL(Number(item.preco_unitario) * Number(item.quantidade))}
                            </p>
                          </div>
                          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                            {formatQuantidade(item.quantidade)} ·{" "}
                            {formatBRL(Number(item.preco_unitario))} un.
                          </p>
                          {item.observacao ? (
                            <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                              Obs: {item.observacao}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </DetailSection>

              {notasLivres ? (
                <DetailSection
                  icon={<MessageSquare className="size-4" />}
                  title="Observacoes do pedido"
                >
                  <p className="text-sm font-semibold leading-relaxed text-[color:var(--gestao-ink)]">
                    {notasLivres}
                  </p>
                </DetailSection>
              ) : null}
            </div>

            <div className="shrink-0 space-y-2 border-t border-[color:var(--honey-line)] bg-card px-4 py-4">
              <div className="flex items-center gap-2">
                {pedido.status !== "entregue" && pedido.status !== "cancelado" ? (
                  <button
                    type="button"
                    disabled={updating}
                    onClick={cancelar}
                    className="grid size-11 shrink-0 place-items-center rounded-xl border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                    aria-label="Cancelar pedido"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onPrint(pedido)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/50 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.05em] text-[color:var(--gestao-ink)] transition hover:bg-white"
                >
                  <Printer className="size-4" />
                  Imprimir
                </button>
                {acaoPrincipal?.nextStatus ? (
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() => avancar(acaoPrincipal.nextStatus)}
                    className="inline-flex flex-[1.4] items-center justify-center gap-2 rounded-xl bg-sage px-4 py-3 text-sm font-extrabold uppercase tracking-[0.06em] text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
                  >
                    {acaoPrincipal.label}
                    {acaoPrincipal.icon}
                  </button>
                ) : (
                  <span className="inline-flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-700">
                    <CircleCheckBig className="size-4" />
                    Concluido
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function DetailSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--honey-line)] bg-card p-4 shadow-[0_1px_4px_rgba(17,17,17,0.05)]">
      <div className="mb-3 flex items-center gap-2 text-[color:var(--gestao-green)]">
        {icon}
        <h3 className="text-xs font-extrabold uppercase tracking-[0.1em]">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold text-[color:var(--gestao-ink)]",
          highlight && "font-extrabold",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ValueRow({
  label,
  value,
  highlight,
  className,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span
        className={cn(
          "font-semibold text-muted-foreground",
          highlight && "font-extrabold text-[color:var(--gestao-ink)]",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-bold text-[color:var(--gestao-ink)]",
          highlight && "text-lg font-extrabold",
        )}
      >
        {value}
      </span>
    </div>
  );
}

const METADATA_KEYS = new Set([
  "cliente",
  "telefone",
  "email",
  "cep",
  "cidade",
  "uf",
  "bairro",
  "endereco",
  "referencia",
  "payment_mode",
  "troco_para",
  "gps_lat",
  "gps_lng",
  "gps_accuracy",
  "mp_status",
  "mp_checkout_url",
  "mp_pix_qr_code",
  "mp_pix_qr_code_base64",
  "mp_ticket_url",
]);

function getOrderFreeNotes(observacoes: string | null | undefined) {
  if (!observacoes?.trim()) return null;
  const freeParts = observacoes
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const key = part.split("=")[0]?.trim().toLowerCase();
      return !key || !METADATA_KEYS.has(key);
    });
  return freeParts.length > 0 ? freeParts.join(" · ") : null;
}

function getEnderecoCompleto(pedido: Pedido) {
  const fromMeta = getOrderMetadataValue(pedido.observacoes, "endereco");
  if (fromMeta) return fromMeta;
  return pedido.endereco?.trim() || null;
}

function getClienteTelefone(pedido: Pedido) {
  return getOrderMetadataValue(pedido.observacoes, "telefone");
}

function getClienteNome(pedido: Pedido) {
  const cliente = getOrderMetadataValue(pedido.observacoes, "cliente");
  if (cliente) return cliente;
  if (pedido.canal === "mesa") return "Cliente mesa";
  if (pedido.canal === "balcao") return "Cliente balcao";
  return "Cliente delivery";
}

function getClienteEmail(pedido: Pedido) {
  return getOrderMetadataValue(pedido.observacoes, "email");
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
  if (pedido.canal === "balcao") canalLabel = "Balcao";
  if (pedido.canal === "ifood") canalLabel = "iFood";
  if (origemQuero) canalLabel = "Quero Delivery";

  let atendimentoLabel = "Entrega";
  if (pedido.canal === "mesa") atendimentoLabel = "Consumo na mesa";
  if (pedido.canal === "balcao") atendimentoLabel = "Retira no balcao";
  if (retira) atendimentoLabel = "Retira";

  return { canalLabel, atendimentoLabel };
}

function getOrderShortCode(pedido: Pedido) {
  return pedido.id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function formatTempoLabel(tempoMin: number) {
  if (tempoMin <= 0) return "agora";
  if (tempoMin === 1) return "1 min";
  return `${tempoMin} min`;
}

function getStatusLabel(status: Pedido["status"]) {
  if (status === "aberto") return "Pendente";
  if (status === "em_preparo") return "Em preparo";
  if (status === "pronto") return "Pronto";
  if (status === "em_entrega") return "Em entrega";
  if (status === "entregue") return "Entregue";
  if (status === "cancelado") return "Cancelado";
  return status;
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
  if (!forma) return "Nao informado";
  if (forma === "credito") return "Cartao de credito";
  if (forma === "debito") return "Cartao de debito";
  if (forma === "dinheiro") return "Dinheiro";
  if (forma === "pix") return "Pix";
  return forma;
}

function getPrimaryAction(status: Pedido["status"]) {
  if (status === "aberto") {
    return {
      nextStatus: "em_preparo" as const,
      label: "aceitar",
      icon: <Check className="size-4" />,
    };
  }
  if (status === "em_preparo") {
    return {
      nextStatus: "pronto" as const,
      label: "preparar",
      icon: <ArrowRight className="size-4" />,
    };
  }
  if (status === "pronto") {
    return {
      nextStatus: "em_entrega" as const,
      label: "enviar",
      icon: <ArrowRight className="size-4" />,
    };
  }
  if (status === "em_entrega") {
    return {
      nextStatus: "entregue" as const,
      label: "entregue",
      icon: <Check className="size-4" />,
    };
  }
  return null;
}
