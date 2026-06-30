import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Receipt,
  Smartphone,
  User,
  Wallet,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { fetchVendaDetalheServer } from "@/lib/api/pedido-detalhe.functions";
import { formatBRL } from "@/lib/db";
import { resolveProductImage } from "@/lib/cardapio";
import { formatNotaNumero, shouldShowNeighborhood, simplifyNotaRejection } from "@/lib/order-display";
import {
  labelFormaPagamento,
  labelStatusVenda,
  statusVendaTone,
  type VendaDetalhe,
} from "@/lib/venda-detalhe";
import { labelNotaStatus, notaStatusTone } from "@/lib/fiscal/fiscal-nota-utils";
import { StatusPill } from "@/components/gestao-ui";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type VendaDetalheModalProps = {
  open: boolean;
  onClose: () => void;
  pedidoId?: string | null;
  venda?: VendaDetalhe | null;
};

export function VendaDetalheModal({ open, onClose, pedidoId, venda }: VendaDetalheModalProps) {
  const tenantSlug = useTenantSlug();
  const shouldFetch = open && !venda && Boolean(pedidoId);

  const { data: fetchedVenda, isLoading, error } = useQuery({
    queryKey: ["venda-detalhe", tenantSlug, pedidoId],
    queryFn: () =>
      fetchVendaDetalheServer({ data: { pedidoId: pedidoId!, tenantSlug } }),
    enabled: shouldFetch,
  });

  const detalhe = venda ?? fetchedVenda ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay className="z-[200]" />
        <DialogPrimitive.Content className="fixed inset-0 z-[201] flex items-center justify-center p-4 outline-none sm:p-6">
          <DialogPrimitive.Title className="sr-only">
            {detalhe ? `Detalhes da venda #${detalhe.numero}` : "Detalhes da venda"}
          </DialogPrimitive.Title>
          <div className="relative flex max-h-[min(90vh,900px)] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/30 shadow-2xl">
            <DialogPrimitive.Close className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-lg text-primary-foreground opacity-90 transition hover:bg-white/15 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/40">
              <X className="size-4" />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>

            <div className="shrink-0 bg-sage px-5 py-4 text-primary-foreground">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div>
                  <p className="text-lg font-extrabold tracking-tight">
                    {detalhe ? `Pedido #${detalhe.numero}` : "Detalhes da venda"}
                  </p>
                  {detalhe ? (
                    <p className="mt-1 text-xs font-semibold opacity-90">
                      {detalhe.canal}
                      {detalhe.mesa ? ` · ${detalhe.mesa}` : ""}
                      {" · "}
                      {new Date(detalhe.data).toLocaleString("pt-BR")}
                    </p>
                  ) : null}
                </div>
                {detalhe ? (
                  <StatusPill tone={statusVendaTone(detalhe.status)}>
                    {labelStatusVenda(detalhe.status)}
                  </StatusPill>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Carregando detalhes...
                </div>
              ) : error ? (
                <p className="py-16 text-center text-sm text-rose-600">
                  {error instanceof Error ? error.message : "Nao foi possivel carregar a venda."}
                </p>
              ) : !detalhe ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Selecione uma venda para ver os detalhes.
                </p>
              ) : (
                <div className="space-y-4">
                  <DetailSection icon={<User className="size-4" />} title="Cliente">
                    <ValueRow label="Nome" value={detalhe.clienteNome} />
                    {detalhe.clienteTelefone ? (
                      <ValueRow label="Telefone" value={detalhe.clienteTelefone} />
                    ) : null}
                  </DetailSection>

                  {(detalhe.endereco ||
                    shouldShowNeighborhood(detalhe.bairro) ||
                    detalhe.referencia) && (
                    <DetailSection icon={<MapPin className="size-4" />} title="Entrega">
                      {detalhe.endereco ? (
                        <ValueRow label="Endereco" value={detalhe.endereco} />
                      ) : null}
                      {shouldShowNeighborhood(detalhe.bairro) ? (
                        <ValueRow label="Bairro" value={detalhe.bairro!} />
                      ) : null}
                      {detalhe.referencia ? (
                        <ValueRow label="Referencia" value={detalhe.referencia} />
                      ) : null}
                    </DetailSection>
                  )}

                  <DetailSection icon={getPaymentIcon(detalhe.formaPagamento)} title="Pagamento">
                    <ValueRow label="Forma" value={labelFormaPagamento(detalhe.formaPagamento)} />
                    {detalhe.trocoPara ? (
                      <ValueRow label="Troco para" value={formatBRL(detalhe.trocoPara)} />
                    ) : null}
                  </DetailSection>

                  <DetailSection icon={<Receipt className="size-4" />} title="Valores">
                    <ValueRow label="Subtotal" value={formatBRL(detalhe.subtotal)} />
                    {detalhe.taxaEntrega > 0 ? (
                      <ValueRow label="Taxa de entrega" value={formatBRL(detalhe.taxaEntrega)} />
                    ) : null}
                    {detalhe.desconto > 0 ? (
                      <ValueRow
                        label="Desconto"
                        value={`-${formatBRL(detalhe.desconto)}`}
                        className="text-emerald-700"
                      />
                    ) : null}
                    <ValueRow
                      label="Total"
                      value={formatBRL(detalhe.total)}
                      highlight
                      className="text-base"
                    />
                  </DetailSection>

                  <DetailSection
                    icon={<Receipt className="size-4" />}
                    title={`Itens (${detalhe.itens.length})`}
                  >
                    {detalhe.itens.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
                    ) : (
                      <ul className="space-y-3">
                        {detalhe.itens.map((item) => (
                          <li
                            key={item.id}
                            className="flex gap-3 rounded-xl border border-[color:var(--honey-line)]/70 bg-white p-3"
                          >
                            <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]">
                              <img
                                src={resolveProductImage("", item.imagemUrl)}
                                alt={item.nome}
                                className="size-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-extrabold text-[color:var(--gestao-ink)]">
                                    {item.nome}
                                  </p>
                                  {item.categoria ? (
                                    <p className="text-xs text-muted-foreground">{item.categoria}</p>
                                  ) : null}
                                </div>
                                <p className="shrink-0 text-sm font-extrabold text-[color:var(--gestao-ink)]">
                                  {formatBRL(item.precoUnitario * item.quantidade)}
                                </p>
                              </div>
                              <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                                {formatQuantidade(item.quantidade)} · {formatBRL(item.precoUnitario)}{" "}
                                un.
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

                  {detalhe.notaFiscal ? (
                    <DetailSection icon={<FileText className="size-4" />} title="Nota fiscal">
                      <div className="mb-2">
                        <StatusPill tone={notaStatusTone(detalhe.notaFiscal.status)}>
                          {labelNotaStatus(detalhe.notaFiscal.status)}
                        </StatusPill>
                      </div>
                      {formatNotaNumero(detalhe.notaFiscal.serie, detalhe.notaFiscal.numero) ? (
                        <ValueRow
                          label="Numero"
                          value={formatNotaNumero(detalhe.notaFiscal.serie, detalhe.notaFiscal.numero)!}
                        />
                      ) : null}
                      {detalhe.notaFiscal.status === "rejeitada" &&
                      simplifyNotaRejection(detalhe.notaFiscal.motivoRejeicao) ? (
                        <ValueRow
                          label="Motivo"
                          value={simplifyNotaRejection(detalhe.notaFiscal.motivoRejeicao)!}
                          className="text-rose-700"
                        />
                      ) : null}
                      {detalhe.notaFiscal.qrcodeUrl ? (
                        <a
                          href={detalhe.notaFiscal.qrcodeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-sage hover:underline"
                        >
                          <ExternalLink className="size-3.5" />
                          Ver nota fiscal
                        </a>
                      ) : null}
                    </DetailSection>
                  ) : null}

                  {detalhe.observacoes ? (
                    <DetailSection icon={<Receipt className="size-4" />} title="Observacoes do pedido">
                      <p className="text-sm font-semibold leading-relaxed text-[color:var(--gestao-ink)]">
                        {detalhe.observacoes}
                      </p>
                    </DetailSection>
                  ) : null}
                </div>
              )}
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
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--honey-line)] bg-white/80 p-4">
      <div className="mb-3 flex items-center gap-2 text-[color:var(--gestao-green)]">
        {icon}
        <h3 className="text-sm font-extrabold uppercase tracking-[0.06em] text-[color:var(--gestao-ink)]">
          {title}
        </h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
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
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "max-w-[65%] text-right font-semibold text-[color:var(--gestao-ink)]",
          highlight && "font-extrabold",
          className,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function formatQuantidade(qty: number) {
  return qty === 1 ? "1 un." : `${qty} un.`;
}

function getPaymentIcon(forma: string) {
  if (forma === "pix") return <Smartphone className="size-4" />;
  if (forma === "credito" || forma === "debito" || forma === "cartao") {
    return <CreditCard className="size-4" />;
  }
  if (forma === "online") return <Wallet className="size-4" />;
  return <Banknote className="size-4" />;
}
