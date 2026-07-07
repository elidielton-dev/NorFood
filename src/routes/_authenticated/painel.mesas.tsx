import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  formatBRL,
  itensDoPedido,
  listarMesaVinculos,
  listarMesas,
  listarPedidos,
  type Mesa,
  type Pedido,

} from "@/lib/shared/db";
import { mergeMesasServer, updateMesaStatusServer } from "@/lib/api/pedidos/mesas.functions";
import { printHtmlReceipt } from "@/lib/shared/print";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Link2, Printer } from "lucide-react";

import { toast } from "sonner";
import {
  GestaoButton,
  GestaoEmptyState,
  GestaoPage,
  GestaoStat,

} from "@/components/painel/gestao-ui";
import { BalcaoPos } from "@/components/balcao/balcao-pos";

import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { tenantQueryKey } from "@/lib/tenant/query-keys";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/_authenticated/painel/mesas")({
  component: MesasPage,
});

function MesasPage() {
  const qc = useQueryClient();
  const tenantSlug = useTenantSlug();
  const { data: mesas = [] } = useQuery({
    queryKey: tenantQueryKey("mesas", tenantSlug),
    queryFn: listarMesas,
  });
  const { data: pedidos = [] } = useQuery({
    queryKey: tenantQueryKey("pedidos", tenantSlug),
    queryFn: listarPedidos,
  });
  const { data: vinculos = [] } = useQuery({
    queryKey: tenantQueryKey("mesa-vinculos", tenantSlug),
    queryFn: listarMesaVinculos,
  });

  const [mesaPos, setMesaPos] = useState<Mesa | null>(null);
  const [pedidoRecibo, setPedidoRecibo] = useState<Pedido | null>(null);
  const [modoJuntar, setModoJuntar] = useState(false);
  const [mesasSelecionadas, setMesasSelecionadas] = useState<string[]>([]);
  const [juntando, setJuntando] = useState(false);

  const pedidosAtivosPorMesa = useMemo(() => {
    const mapa = new Map<string, Pedido>();
    for (const pedido of pedidos) {
      if (!pedido.mesa_id) continue;
      if (pedido.status === "entregue" || pedido.status === "cancelado") continue;
      if (!mapa.has(pedido.mesa_id)) mapa.set(pedido.mesa_id, pedido);
    }
    for (const vinculo of vinculos) {
      const pedido = pedidos.find(
        (p) =>
          p.id === vinculo.pedido_id &&
          p.status !== "entregue" &&
          p.status !== "cancelado",
      );
      if (pedido && !mapa.has(vinculo.mesa_id)) {
        mapa.set(vinculo.mesa_id, pedido);
      }
    }
    return mapa;
  }, [pedidos, vinculos]);

  const vinculosPorPedido = useMemo(() => {
    const mapa = new Map<string, number[]>();
    for (const vinculo of vinculos) {
      const mesa = mesas.find((m) => m.id === vinculo.mesa_id);
      if (!mesa) continue;
      const atual = mapa.get(vinculo.pedido_id) ?? [];
      atual.push(mesa.numero);
      mapa.set(vinculo.pedido_id, atual);
    }
    return mapa;
  }, [vinculos, mesas]);

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
    if (modoJuntar) {
      setMesasSelecionadas((atual) =>
        atual.includes(mesa.id) ? atual.filter((id) => id !== mesa.id) : [...atual, mesa.id],
      );
      return;
    }

    const pedidoAtivo = getPedidoAtivoDaMesa(mesa);
    const statusVisual = getMesaStatusVisual(mesa);

    if (!pedidoAtivo && (mesa.status === "ocupada" || mesa.status === "fechando")) {
      try {
        await updateMesaStatusServer({
          data: {
            mesaId: mesa.id,
            status: "livre",
            tenantSlug: tenantSlug!,
          },
        });
        await qc.invalidateQueries({ queryKey: tenantQueryKey("mesas", tenantSlug) });
        toast.info(
          `Mesa ${mesa.numero} estava ocupada sem pedido. Ela foi liberada para novo atendimento.`,
        );
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Nao foi possivel corrigir o status da mesa."));
        return;
      }
    }

    if (mesa.status === "reservada" && statusVisual === "reservada") {
      toast.error("Esta mesa esta reservada.");
      return;
    }

    await Promise.all([
      qc.refetchQueries({ queryKey: tenantQueryKey("pedidos", tenantSlug) }),
      qc.refetchQueries({ queryKey: tenantQueryKey("mesa-vinculos", tenantSlug) }),
    ]);
    setMesaPos(mesa);
  }

  async function confirmarJuncao() {
    if (mesasSelecionadas.length < 2) {
      toast.error("Selecione ao menos duas mesas para juntar.");
      return;
    }

    const principalId =
      mesasSelecionadas.find((id) => getPedidoAtivoDaMesa(mesas.find((m) => m.id === id)!)) ??
      mesasSelecionadas[0];
    const secundarias = mesasSelecionadas.filter((id) => id !== principalId);

    setJuntando(true);
    try {
      await mergeMesasServer({
        data: {
          tenantSlug: tenantSlug!,
          mesaPrincipalId: principalId,
          mesaIds: secundarias,
        },
      });
      toast.success("Mesas juntadas com sucesso.");
      setModoJuntar(false);
      setMesasSelecionadas([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: tenantQueryKey("mesas", tenantSlug) }),
        qc.invalidateQueries({ queryKey: tenantQueryKey("pedidos", tenantSlug) }),
        qc.invalidateQueries({ queryKey: tenantQueryKey("mesa-vinculos", tenantSlug) }),
      ]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Nao foi possivel juntar as mesas."));
    } finally {
      setJuntando(false);
    }
  }

  function invalidarMesas() {
    void Promise.all([
      qc.invalidateQueries({ queryKey: tenantQueryKey("mesas", tenantSlug) }),
      qc.invalidateQueries({ queryKey: tenantQueryKey("pedidos", tenantSlug) }),
      qc.invalidateQueries({ queryKey: tenantQueryKey("mesa-vinculos", tenantSlug) }),
    ]);
  }

  const mesaPosPedido = mesaPos ? getPedidoAtivoDaMesa(mesaPos) : null;
  const mesasVinculadas =
    mesaPosPedido && mesaPos
      ? (vinculosPorPedido.get(mesaPosPedido.id) ?? []).filter((n) => n !== mesaPos.numero)
      : [];

  const livres = mesas.filter((mesa) => getMesaStatusVisual(mesa) === "livre").length;
  const ocupadas = mesas.filter((mesa) => getMesaStatusVisual(mesa) === "ocupada").length;

  return (
    <GestaoPage
      title="Painel de Mesas"
      subtitle="Toque na mesa para abrir o PDV. Use juntar mesas para unir contas."
      actions={
        <GestaoButton
          variant={modoJuntar ? "primary" : "secondary"}
          onClick={() => {
            setModoJuntar((atual) => !atual);
            setMesasSelecionadas([]);
          }}
        >
          <Link2 className="size-4" />
          {modoJuntar ? "Cancelar junção" : "Juntar mesas"}
        </GestaoButton>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <GestaoStat label="Mesas livres" value={String(livres)} tone="success" />
        <GestaoStat label="Mesas ocupadas" value={String(ocupadas)} tone="warning" />
        <GestaoStat label="Total de mesas" value={String(mesas.length)} tone="gold" />
      </div>

      {modoJuntar ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            {mesasSelecionadas.length} mesa(s) selecionada(s). Toque nas mesas para marcar ou
            desmarcar.
          </span>
          <GestaoButton size="sm" onClick={() => void confirmarJuncao()} disabled={juntando}>
            {juntando ? "Juntando..." : "Confirmar junção"}
          </GestaoButton>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {mesas.map((mesa) => {
          const pedidoAtivo = getPedidoAtivoDaMesa(mesa);
          const statusVisual = getMesaStatusVisual(mesa);
          const ocupada = statusVisual === "ocupada";
          const reservada = statusVisual === "reservada";
          const selecionada = mesasSelecionadas.includes(mesa.id);
          const vinculadas = pedidoAtivo
            ? (vinculosPorPedido.get(pedidoAtivo.id) ?? []).filter((n) => n !== mesa.numero)
            : [];

          return (
            <button
              key={mesa.id}
              onClick={() => void abrirMesa(mesa)}
              className={cn(
                "aspect-square rounded-[24px] border-2 p-5 text-left transition hover:-translate-y-1",
                selecionada && modoJuntar
                  ? "border-[#FF9100] bg-[#FFF7ED] ring-2 ring-[#FF9100]/40"
                  : ocupada
                    ? "border-rose-300 bg-rose-50 text-rose-900"
                    : reservada
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-emerald-300 bg-emerald-50 text-emerald-900",
              )}
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
                        : modoJuntar
                          ? selecionada
                            ? "Selecionada"
                            : "Toque para selecionar"
                          : "Toque para abrir PDV"}
                  </p>
                  {vinculadas.length > 0 ? (
                    <p className="mt-1 text-xs font-medium opacity-80">
                      Junta: {vinculadas.map((n) => `#${n}`).join(", ")}
                    </p>
                  ) : null}
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

      <Dialog open={Boolean(mesaPos)} onOpenChange={(open) => !open && setMesaPos(null)}>
        <DialogContent className="flex h-[min(92vh,900px)] w-[min(98vw,1400px)] max-w-none flex-col gap-0 overflow-hidden p-0">
          {mesaPos ? (
            <BalcaoPos
              key={mesaPos.id}
              embedded
              mesa={{
                mesaId: mesaPos.id,
                mesaNumero: mesaPos.numero,
                pedidoId: mesaPosPedido?.id ? mesaPosPedido.id : null,
                pedidoNumero: mesaPosPedido?.numero ?? null,
                pedidoTotal: mesaPosPedido?.total,
                mesasVinculadas,
              }}
              onClose={() => setMesaPos(null)}
              onMesaUpdated={invalidarMesas}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {pedidoRecibo ? (
        <ReciboMesaModal pedido={pedidoRecibo} onClose={() => setPedidoRecibo(null)} />
      ) : null}
    </GestaoPage>
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
