import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  cancelarNotaFiscalServer,
  consultarStatusNotaFiscalServer,
  inutilizarNumeracaoFiscalServer,
} from "@/lib/api/fiscal.functions";
import { formatBRL } from "@/lib/db";
import {
  canCancelarNota,
  labelNotaStatus,
  labelSefazCStat,
  notaStatusTone,
  type NotaFiscalRow,
} from "@/lib/fiscal/fiscal-nota-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VendaDetalheModal } from "@/components/venda-detalhe-modal";
import {
  GestaoButton,
  GestaoCard,
  GestaoEmptyState,
  GestaoField,
  GestaoInput,
  GestaoSectionTitle,
  GestaoTable,
  GestaoTableHead,
  StatusPill,
} from "@/components/gestao-ui";

type FiscalNotasPanelProps = {
  notas: NotaFiscalRow[];
  seriePadrao?: number;
};

function mutationErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Nao foi possivel concluir a acao fiscal.";
}

export function FiscalNotasPanel({ notas, seriePadrao = 1 }: FiscalNotasPanelProps) {
  const qc = useQueryClient();
  const [cancelNota, setCancelNota] = useState<NotaFiscalRow | null>(null);
  const [pedidoDetalheId, setPedidoDetalheId] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [inutilForm, setInutilForm] = useState({
    serie: seriePadrao,
    numeroInicial: 1,
    numeroFinal: 1,
    justificativa: "",
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["notas-fiscais"] });

  const consultarMutation = useMutation({
    mutationFn: (notaId: string) => consultarStatusNotaFiscalServer({ data: { notaId } }),
    onMutate: () => toast.loading("Consultando SEFAZ...", { id: "fiscal-consulta" }),
    onSuccess: (data) => {
      toast.success(
        `SEFAZ: ${labelSefazCStat(data.result.codigoStatus)} — ${data.result.motivo}`,
        { id: "fiscal-consulta" },
      );
      invalidate();
    },
    onError: (err) => toast.error(mutationErrorMessage(err), { id: "fiscal-consulta" }),
  });

  const cancelarMutation = useMutation({
    mutationFn: (input: { notaId: string; justificativa: string }) =>
      cancelarNotaFiscalServer({ data: input }),
    onMutate: () => toast.loading("Cancelando na SEFAZ...", { id: "fiscal-cancelar" }),
    onSuccess: () => {
      toast.success("NFC-e cancelada na SEFAZ.", { id: "fiscal-cancelar" });
      setCancelNota(null);
      setJustificativa("");
      invalidate();
    },
    onError: (err) => toast.error(mutationErrorMessage(err), { id: "fiscal-cancelar" }),
  });

  const inutilizarMutation = useMutation({
    mutationFn: () => inutilizarNumeracaoFiscalServer({ data: inutilForm }),
    onMutate: () => toast.loading("Inutilizando numeracao na SEFAZ...", { id: "fiscal-inutil" }),
    onSuccess: (data) => {
      toast.success(
        `Inutilizacao homologada: serie ${data.serie}, ${data.numeroInicial}-${data.numeroFinal}.`,
        { id: "fiscal-inutil" },
      );
      setInutilForm((current) => ({ ...current, justificativa: "" }));
    },
    onError: (err) => toast.error(mutationErrorMessage(err), { id: "fiscal-inutil" }),
  });

  return (
    <>
      <GestaoCard>
        <GestaoSectionTitle
          title="Notas emitidas"
          description="Clique na linha para ver a venda vinculada. Use os botoes para consultar, cancelar ou inutilizar."
        />
        {notas.length === 0 ? (
          <GestaoEmptyState
            title="Nenhuma nota emitida"
            description="Configure empresa, certificado e ambiente antes de emitir."
          />
        ) : (
          <div className="mt-4 max-h-[min(520px,65vh)] overflow-auto overscroll-y-contain [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-muted/95 [&_thead]:backdrop-blur-sm">
            <GestaoTable>
              <GestaoTableHead>
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Numero</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3">Acoes</th>
                </tr>
              </GestaoTableHead>
              <tbody>
                {notas.map((nota) => (
                  <tr
                    key={nota.id}
                    className={`border-t border-[color:var(--honey-line)] ${nota.pedido_id ? "cursor-pointer transition hover:bg-[color:var(--gestao-cream)]/60" : ""}`}
                    onClick={() => {
                      if (nota.pedido_id) setPedidoDetalheId(nota.pedido_id);
                    }}
                  >
                    <td className="p-3 whitespace-nowrap text-sm">
                      {new Date(nota.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-3 text-sm">
                      {nota.serie ? `${nota.serie}/` : ""}
                      {nota.numero ?? "—"}
                    </td>
                    <td className="p-3">
                      <StatusPill tone={notaStatusTone(nota.status)}>
                        {labelNotaStatus(nota.status)}
                      </StatusPill>
                    </td>
                    <td className="p-3 text-right text-sm">{formatBRL(Number(nota.valor))}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
                        <GestaoButton
                          type="button"
                          variant="secondary"
                          className="h-8 px-2 text-xs"
                          disabled={!nota.chave_acesso || consultarMutation.isPending}
                          onClick={() => consultarMutation.mutate(nota.id)}
                        >
                          <Search className="size-3.5" />
                          Status
                        </GestaoButton>
                        {canCancelarNota(nota) && (
                          <GestaoButton
                            type="button"
                            variant="secondary"
                            className="h-8 px-2 text-xs text-rose-700"
                            onClick={() => {
                              setCancelNota(nota);
                              setJustificativa("");
                            }}
                          >
                            <Ban className="size-3.5" />
                            Cancelar
                          </GestaoButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </GestaoTable>
          </div>
        )}
      </GestaoCard>

      <GestaoCard className="mt-4">
        <GestaoSectionTitle
          title="Inutilizar numeracao"
          description="Use quando um numero da serie foi pulado sem emissao de nota (minimo 15 caracteres na justificativa)."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <GestaoField label="Serie">
            <GestaoInput
              type="number"
              min={1}
              value={inutilForm.serie}
              onChange={(e) =>
                setInutilForm((c) => ({ ...c, serie: Number(e.target.value) || 1 }))
              }
            />
          </GestaoField>
          <GestaoField label="Numero inicial">
            <GestaoInput
              type="number"
              min={1}
              value={inutilForm.numeroInicial}
              onChange={(e) =>
                setInutilForm((c) => ({ ...c, numeroInicial: Number(e.target.value) || 1 }))
              }
            />
          </GestaoField>
          <GestaoField label="Numero final">
            <GestaoInput
              type="number"
              min={1}
              value={inutilForm.numeroFinal}
              onChange={(e) =>
                setInutilForm((c) => ({ ...c, numeroFinal: Number(e.target.value) || 1 }))
              }
            />
          </GestaoField>
          <GestaoField label="Justificativa" className="sm:col-span-2 lg:col-span-4">
            <GestaoInput
              value={inutilForm.justificativa}
              onChange={(e) => setInutilForm((c) => ({ ...c, justificativa: e.target.value }))}
              placeholder="Numeracao pulada por erro no sistema emissor"
            />
          </GestaoField>
        </div>
        <GestaoButton
          className="mt-4"
          variant="secondary"
          disabled={inutilizarMutation.isPending}
          onClick={() => inutilizarMutation.mutate()}
        >
          {inutilizarMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          Inutilizar na SEFAZ
        </GestaoButton>
      </GestaoCard>

      <Dialog open={Boolean(cancelNota)} onOpenChange={(open) => !open && setCancelNota(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar NFC-e na SEFAZ</DialogTitle>
          </DialogHeader>
          {cancelNota && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Nota {cancelNota.serie}/{cancelNota.numero} — {formatBRL(Number(cancelNota.valor))}
              </p>
              <GestaoField label="Justificativa (min. 15 caracteres)">
                <GestaoInput
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Venda cancelada pelo cliente no balcao"
                />
              </GestaoField>
              <div className="flex gap-2 justify-end">
                <GestaoButton type="button" variant="secondary" onClick={() => setCancelNota(null)}>
                  Voltar
                </GestaoButton>
                <GestaoButton
                  type="button"
                  disabled={cancelarMutation.isPending || justificativa.trim().length < 15}
                  onClick={() =>
                    cancelarMutation.mutate({
                      notaId: cancelNota.id,
                      justificativa: justificativa.trim(),
                    })
                  }
                >
                  {cancelarMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Confirmar cancelamento
                </GestaoButton>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <VendaDetalheModal
        open={Boolean(pedidoDetalheId)}
        onClose={() => setPedidoDetalheId(null)}
        pedidoId={pedidoDetalheId}
      />
    </>
  );
}
