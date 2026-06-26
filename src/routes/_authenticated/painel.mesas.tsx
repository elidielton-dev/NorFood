import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import {
  formatBRL,
  itensDoPedido,
  listarMesas,
  listarPedidos,
  listarProdutos,
  type Mesa,
  type Pedido,
  type Produto,
} from "@/lib/db";
import {
  finalizeMesaOrderServer,
  openMesaOrderServer,
  updateMesaStatusServer,
} from "@/lib/api/mesas.functions";
import { printHtmlReceipt } from "@/lib/print";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Printer, Receipt, ShoppingBasket, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  GestaoButton,
  GestaoCard,
  GestaoEmptyState,
  GestaoField,
  GestaoPage,
  GestaoSelect,
  GestaoStat,
} from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/mesas")({
  component: MesasPage,
});

type CarrinhoMesaItem = {
  produto: Produto;
  quantidade: number;
};

function MesasPage() {
  const qc = useQueryClient();
  const { data: mesas = [] } = useQuery({ queryKey: ["mesas"], queryFn: listarMesas });
  const { data: produtos = [] } = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });
  const { data: pedidos = [] } = useQuery({ queryKey: ["pedidos"], queryFn: listarPedidos });

  const [mesaCriando, setMesaCriando] = useState<Mesa | null>(null);
  const [mesaDetalhe, setMesaDetalhe] = useState<Mesa | null>(null);
  const [pedidoDetalhe, setPedidoDetalhe] = useState<Pedido | null>(null);
  const [pedidoRecibo, setPedidoRecibo] = useState<Pedido | null>(null);
  const [carrinho, setCarrinho] = useState<CarrinhoMesaItem[]>([]);
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [salvando, setSalvando] = useState(false);
  const [pagando, setPagando] = useState(false);

  const pedidosAtivosPorMesa = useMemo(() => {
    const mapa = new Map<string, Pedido>();
    for (const pedido of pedidos) {
      if (!pedido.mesa_id) continue;
      if (pedido.status === "entregue" || pedido.status === "cancelado") continue;
      if (!mapa.has(pedido.mesa_id)) mapa.set(pedido.mesa_id, pedido);
    }
    return mapa;
  }, [pedidos]);

  function getPedidoAtivoDaMesa(mesa: Mesa) {
    return pedidosAtivosPorMesa.get(mesa.id) ?? null;
  }

  function getMesaStatusVisual(mesa: Mesa) {
    const pedidoAtivo = getPedidoAtivoDaMesa(mesa);
    if (pedidoAtivo) return "ocupada";
    if (mesa.status === "reservada") return "reservada";
    return "livre";
  }

  async function abrirMesa(mesa: Mesa) {
    const pedidoAtivo = getPedidoAtivoDaMesa(mesa);
    const statusVisual = getMesaStatusVisual(mesa);

    if (!pedidoAtivo && (mesa.status === "ocupada" || mesa.status === "fechando")) {
      try {
        await updateMesaStatusServer({
          data: {
            mesaId: mesa.id,
            status: "livre",
          },
        });
        await qc.invalidateQueries({ queryKey: ["mesas"] });
        toast.info(
          `Mesa ${mesa.numero} estava ocupada sem pedido. Ela foi liberada para novo atendimento.`,
        );
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Nao foi possivel corrigir o status da mesa."));
        return;
      }
    }

    if (pedidoAtivo && statusVisual === "ocupada") {
      setPedidoDetalhe(pedidoAtivo);
      setMesaDetalhe(mesa);
      return;
    }

    if (mesa.status === "reservada") {
      toast.error("Esta mesa esta reservada.");
      return;
    }

    setCarrinho([]);
    setFormaPagamento("pix");
    setMesaCriando(mesa);
  }

  function alterarQuantidade(produto: Produto, delta: number) {
    setCarrinho((atual) => {
      const existente = atual.find((item) => item.produto.id === produto.id);
      if (!existente && delta > 0) {
        return [...atual, { produto, quantidade: 1 }];
      }
      return atual
        .map((item) =>
          item.produto.id === produto.id
            ? { ...item, quantidade: Math.max(0, item.quantidade + delta) }
            : item,
        )
        .filter((item) => item.quantidade > 0);
    });
  }

  async function criarPedidoMesa() {
    if (!mesaCriando) return;
    if (!carrinho.length) {
      toast.error("Adicione produtos antes de abrir a mesa.");
      return;
    }

    setSalvando(true);
    try {
      const mesaAtual = mesaCriando;
      const pedido = await openMesaOrderServer({
        data: {
          mesaId: mesaAtual.id,
          forma_pagamento: formaPagamento,
          observacoes: `Mesa ${mesaAtual.numero}`,
          itens: carrinho.map((item) => ({
            produto_id: item.produto.id,
            quantidade: item.quantidade,
            preco_unitario: item.produto.preco,
          })),
        },
      });
      toast.success(`Mesa ${mesaAtual.numero} aberta com sucesso.`);
      setMesaCriando(null);
      setCarrinho([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["mesas"] }),
        qc.invalidateQueries({ queryKey: ["pedidos"] }),
      ]);
      setPedidoDetalhe(pedido);
      setMesaDetalhe(mesaAtual);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Nao foi possivel abrir a mesa."));
    } finally {
      setSalvando(false);
    }
  }

  async function pagarMesa(mesa: Mesa) {
    const pedido = pedidoDetalhe ?? getPedidoAtivoDaMesa(mesa);
    if (!pedido) {
      toast.error("Nenhum pedido ativo encontrado para esta mesa.");
      return;
    }

    setPagando(true);
    try {
      await finalizeMesaOrderServer({
        data: {
          mesaId: mesa.id,
          pedidoId: pedido.id,
        },
      });
      toast.success(`Mesa ${mesa.numero} finalizada e liberada.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["mesas"] }),
        qc.invalidateQueries({ queryKey: ["pedidos"] }),
      ]);
      setPedidoDetalhe(null);
      setMesaDetalhe(null);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Nao foi possivel finalizar a mesa."));
    } finally {
      setPagando(false);
    }
  }

  const livres = mesas.filter((mesa) => getMesaStatusVisual(mesa) === "livre").length;
  const ocupadas = mesas.filter((mesa) => getMesaStatusVisual(mesa) === "ocupada").length;

  return (
    <GestaoPage
      title="Painel de Mesas"
      subtitle="Mesa livre abre pedido. Mesa ocupada mostra produtos, recibo e pagamento."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <GestaoStat label="Mesas livres" value={String(livres)} tone="success" />
        <GestaoStat label="Mesas ocupadas" value={String(ocupadas)} tone="warning" />
        <GestaoStat label="Total de mesas" value={String(mesas.length)} tone="gold" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {mesas.map((mesa) => {
          const pedidoAtivo = getPedidoAtivoDaMesa(mesa);
          const statusVisual = getMesaStatusVisual(mesa);
          const ocupada = statusVisual === "ocupada";
          const reservada = statusVisual === "reservada";

          return (
            <button
              key={mesa.id}
              onClick={() => abrirMesa(mesa)}
              className={`aspect-square rounded-[24px] border-2 p-5 text-left transition hover:-translate-y-1 ${
                ocupada
                  ? "border-rose-300 bg-rose-50 text-rose-900"
                  : reservada
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-emerald-300 bg-emerald-50 text-emerald-900"
              }`}
            >
              <div className="flex h-full flex-col justify-between">
                <div>
                  <p className="font-display text-4xl">#{mesa.numero}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] opacity-75">
                    {ocupada ? "Ocupada" : reservada ? "Reservada" : "Livre"}
                  </p>
                </div>
                <div>
                  <p className="text-xs opacity-70">{mesa.capacidade} lugares</p>
                  <p className="mt-1 text-sm font-medium">
                    {ocupada && pedidoAtivo
                      ? `${formatBRL(pedidoAtivo.total)} em consumo`
                      : reservada
                        ? "Mesa reservada"
                        : "Toque para abrir pedido"}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {mesas.length === 0 ? (
        <GestaoEmptyState
          title="Nenhuma mesa cadastrada"
          description="O painel depende do cadastro real das mesas no Supabase para abrir pedidos no salao. Seed recomendado: mesas 1 a 12."
        />
      ) : null}

      <Dialog open={Boolean(mesaCriando)} onOpenChange={(open) => !open && setMesaCriando(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Abrir mesa {mesaCriando ? `#${mesaCriando.numero}` : ""}</DialogTitle>
            <DialogDescription>
              Adicione os produtos e confirme. A mesa muda automaticamente para ocupada.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {produtos.map((produto) => {
                const quantidade =
                  carrinho.find((item) => item.produto.id === produto.id)?.quantidade ?? 0;
                return (
                  <div
                    key={produto.id}
                    className="rounded-2xl border border-[color:var(--honey-line)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{produto.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {produto.descricao || "Produto disponivel para a mesa"}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-sage">{formatBRL(produto.preco)}</p>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => alterarQuantidade(produto, -1)}
                        className="size-9 rounded-full border border-border text-lg"
                      >
                        -
                      </button>
                      <div className="min-w-10 text-center text-sm font-semibold">{quantidade}</div>
                      <button
                        onClick={() => alterarQuantidade(produto, 1)}
                        className="size-9 rounded-full border border-border text-lg"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <GestaoCard className="bg-muted/30">
              <h3 className="font-display text-2xl">Resumo da mesa</h3>
              <p className="text-sm text-muted-foreground">
                {carrinho.length} produtos selecionados
              </p>

              <div className="mt-4 space-y-3">
                {carrinho.length === 0 ? (
                  <GestaoEmptyState
                    title="Nenhum item selecionado"
                    description="Escolha os itens para abrir a mesa."
                  />
                ) : (
                  carrinho.map((item) => (
                    <div
                      key={item.produto.id}
                      className="rounded-2xl border border-border bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{item.produto.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantidade}x {formatBRL(item.produto.preco)}
                          </p>
                        </div>
                        <p className="font-semibold">
                          {formatBRL(item.quantidade * item.produto.preco)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <GestaoField label="Forma de pagamento sugerida" className="mt-4">
                <GestaoSelect
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                >
                  <option value="pix">Pix</option>
                  <option value="credito">Cartao de credito</option>
                  <option value="debito">Cartao de debito</option>
                  <option value="dinheiro">Dinheiro</option>
                </GestaoSelect>
              </GestaoField>

              <div className="mt-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm">
                <span className="text-muted-foreground">Total da mesa</span>
                <span className="text-xl font-semibold">
                  {formatBRL(
                    carrinho.reduce((sum, item) => sum + item.quantidade * item.produto.preco, 0),
                  )}
                </span>
              </div>

              <GestaoButton
                className="mt-5 w-full"
                size="lg"
                onClick={criarPedidoMesa}
                disabled={salvando}
              >
                {salvando ? "Abrindo mesa..." : "Confirmar e ocupar mesa"}
              </GestaoButton>
            </GestaoCard>
          </div>
        </DialogContent>
      </Dialog>

      {mesaDetalhe ? (
        <MesaDetalheModal
          mesa={mesaDetalhe}
          pedido={pedidoDetalhe ?? getPedidoAtivoDaMesa(mesaDetalhe)}
          pagando={pagando}
          onClose={() => {
            setMesaDetalhe(null);
            setPedidoDetalhe(null);
          }}
          onPagar={() => pagarMesa(mesaDetalhe)}
          onRecibo={(pedido) => {
            setMesaDetalhe(null);
            setPedidoDetalhe(null);
            setPedidoRecibo(pedido);
          }}
        />
      ) : null}

      {pedidoRecibo ? (
        <ReciboMesaModal pedido={pedidoRecibo} onClose={() => setPedidoRecibo(null)} />
      ) : null}
    </GestaoPage>
  );
}

function MesaDetalheModal({
  mesa,
  pedido,
  pagando,
  onClose,
  onPagar,
  onRecibo,
}: {
  mesa: Mesa;
  pedido: Pedido | null;
  pagando: boolean;
  onClose: () => void;
  onPagar: () => void;
  onRecibo: (pedido: Pedido) => void;
}) {
  const { data: itens = [] } = useQuery({
    queryKey: ["itens", pedido?.id],
    queryFn: () => (pedido ? itensDoPedido(pedido.id) : Promise.resolve([])),
    enabled: Boolean(pedido),
  });

  return (
    <Dialog open={Boolean(mesa)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mesa #{mesa.numero}</DialogTitle>
          <DialogDescription>
            {pedido
              ? "Confira os produtos, imprima o recibo ou finalize o pagamento."
              : "Mesa sem pedido ativo."}
          </DialogDescription>
        </DialogHeader>

        {!pedido ? (
          <GestaoEmptyState
            title="Sem pedido ativo"
            description="Esta mesa nao possui pedido ativo no momento."
          />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              <InfoBox
                titulo="Status"
                valor="Ocupada"
                icon={<ShoppingBasket className="size-4" />}
              />
              <InfoBox
                titulo="Pedido"
                valor={`#${pedido.numero}`}
                icon={<Receipt className="size-4" />}
              />
              <InfoBox
                titulo="Total"
                valor={formatBRL(pedido.total)}
                icon={<Wallet className="size-4" />}
              />
            </div>

            <GestaoCard className="bg-muted/25">
              <p className="mb-3 text-sm font-semibold">Produtos da mesa</p>
              <div className="space-y-3">
                {itens.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-background p-3"
                  >
                    <div>
                      <p className="font-medium">{item.produtos?.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantidade}x {formatBRL(item.preco_unitario)}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {formatBRL(item.quantidade * item.preco_unitario)}
                    </p>
                  </div>
                ))}
              </div>
            </GestaoCard>

            <div className="flex flex-col gap-3 sm:flex-row">
              <GestaoButton variant="secondary" className="flex-1" onClick={() => onRecibo(pedido)}>
                <Printer className="size-4" /> Imprimir recibo
              </GestaoButton>
              <GestaoButton className="flex-1" onClick={onPagar} disabled={pagando}>
                <Wallet className="size-4" /> {pagando ? "Finalizando..." : "Pagar e liberar mesa"}
              </GestaoButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReciboMesaModal({ pedido, onClose }: { pedido: Pedido; onClose: () => void }) {
  const { data: itens = [] } = useQuery({
    queryKey: ["itens", pedido.id],
    queryFn: () => itensDoPedido(pedido.id),
  });

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
              CLIENTE: <span className="font-bold">Mesa em atendimento</span>
            </p>
            <p>
              ORIGEM: <span className="font-bold">Mesa</span>
            </p>
            <p>
              TIPO: <span className="font-bold">Consumo na mesa</span>
            </p>
          </div>

          <div className="mt-6 border-t border-zinc-400 pt-5">
            <p className="mb-3 text-[17px] font-bold uppercase">Produtos no pedido:</p>
            <ul className="space-y-3 text-[15px]">
              {itens.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3">
                  <div>
                    <p>
                      - {item.quantidade}x {item.produtos?.nome}
                    </p>
                    <p className="text-zinc-400">(Consumo da mesa)</p>
                  </div>
                  <span className="font-bold">OK</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 border-t border-zinc-400 pt-5">
            <div className="flex items-end justify-between gap-4">
              <p className="text-[18px] font-bold uppercase">Total geral pago:</p>
              <p className="text-[18px] font-bold text-emerald-700">{formatBRL(pedido.total)}</p>
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
                  `Recibo mesa ${pedido.numero}`,
                  renderMesaReceiptHtml({ pedido, itens }),
                );
                toast.success("Recibo enviado para impressao.");
              } catch (error) {
                toast.error(getErrorMessage(error, "Nao foi possivel imprimir o recibo."));
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

function InfoBox({ titulo, valor, icon }: { titulo: string; valor: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[color:var(--honey-line)] bg-background p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-xs uppercase tracking-[0.14em]">{titulo}</p>
      </div>
      <p className="font-display text-2xl">{valor}</p>
    </div>
  );
}

function formatarPagamento(forma: string | null) {
  if (!forma) return "pedido do sistema";
  if (forma === "credito") return "cartao de credito";
  if (forma === "debito") return "cartao de debito";
  return forma;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function renderMesaReceiptHtml({
  pedido,
  itens,
}: {
  pedido: Pedido;
  itens: Awaited<ReturnType<typeof itensDoPedido>>;
}) {
  const itensHtml = itens
    .map(
      (item) => `
        <li style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px;">
          <div>
            <p style="margin:0;">- ${item.quantidade}x ${escapeHtml(item.produtos?.nome ?? "Item")}</p>
            <p style="margin:4px 0 0;color:#a1a1aa;">(Consumo da mesa)</p>
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
        <p style="margin:0 0 8px;">CLIENTE: <span style="font-weight:700;">Mesa em atendimento</span></p>
        <p style="margin:0 0 8px;">ORIGEM: <span style="font-weight:700;">Mesa</span></p>
        <p style="margin:0;">TIPO: <span style="font-weight:700;">Consumo na mesa</span></p>
      </div>
      <div style="margin-top:24px;border-top:1px solid #a1a1aa;padding-top:20px;">
        <p style="margin:0 0 12px;font-size:17px;font-weight:700;text-transform:uppercase;">Produtos no pedido:</p>
        <ul style="list-style:none;padding:0;margin:0;font-size:15px;">
          ${itensHtml}
        </ul>
      </div>
      <div style="margin-top:24px;border-top:1px solid #a1a1aa;padding-top:20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
          <p style="margin:0;font-size:18px;font-weight:700;text-transform:uppercase;">Total geral pago:</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#047857;">${formatBRL(pedido.total)}</p>
        </div>
        <p style="margin:4px 0 0;text-align:right;font-size:13px;font-weight:700;color:#b18434;">Pago via ${escapeHtml(formatarPagamento(pedido.forma_pagamento))}</p>
      </div>
      <div style="margin-top:32px;text-align:center;font-size:13px;font-style:italic;color:#71717a;">
        <p style="margin:0;">------------------------------------</p>
        <p style="margin:4px 0 0;">Obrigado pela preferencia.</p>
        <p style="margin:4px 0 0;">NorFood</p>
        <p style="margin:4px 0 0;">------------------------------------</p>
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
