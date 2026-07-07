import { useMutation, useQueryClient } from "@tanstack/react-query";
import { tenantQueryKey } from "@/lib/tenant/query-keys";
import { FlaskConical, Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { setFiscalAmbienteServer } from "@/lib/api/fiscal/fiscal.functions";
import type { FiscalAmbiente } from "@/lib/fiscal/fiscal-types";
import { cn } from "@/lib/shared/utils";

type Props = {
  ambiente: FiscalAmbiente;
  tenantSlug: string;
  compact?: boolean;
};

function ambienteLabel(ambiente: FiscalAmbiente) {
  return ambiente === "producao" ? "Producao" : "Homologacao";
}

export function FiscalAmbienteToggle({ ambiente, tenantSlug, compact }: Props) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (next: FiscalAmbiente) =>
      setFiscalAmbienteServer({ data: { tenantSlug, ambiente: next } }),
    onMutate: (next) => {
      toast.loading(`Alterando para ${ambienteLabel(next)}...`, { id: "fiscal-ambiente" });
    },
    onSuccess: (_result, next) => {
      toast.success(
        next === "producao"
          ? "Ambiente SEFAZ: Producao — notas com valor fiscal."
          : "Ambiente SEFAZ: Homologacao — notas de teste.",
        { id: "fiscal-ambiente" },
      );
      void qc.invalidateQueries({ queryKey: tenantQueryKey("fiscal-settings", tenantSlug) });
      void qc.invalidateQueries({ queryKey: tenantQueryKey("integration-status", tenantSlug) });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Nao foi possivel alterar o ambiente.";
      toast.error(message, { id: "fiscal-ambiente" });
    },
  });

  function requestChange(next: FiscalAmbiente) {
    if (next === ambiente || mutation.isPending) return;

    if (next === "producao") {
      const ok = window.confirm(
        "Ativar PRODUCAO na SEFAZ?\n\nAs proximas NFC-e terao valor fiscal real. Confirme que empresa, certificado e CSC de producao estao corretos.",
      );
      if (!ok) return;
    }

    mutation.mutate(next);
  }

  const isHomolog = ambiente === "homologacao";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between",
        isHomolog
          ? "border-sky-200 bg-sky-50/80"
          : "border-amber-300 bg-amber-50/90",
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ambiente SEFAZ
        </p>
        <p className="text-sm font-medium text-foreground">
          {isHomolog
            ? "Homologacao — testes sem valor fiscal"
            : "Producao — vendas reais na SEFAZ"}
        </p>
        {!compact && (
          <p className="text-xs text-muted-foreground mt-0.5">
            A troca vale imediatamente para novas emissoes NFC-e.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {mutation.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <div
          className="inline-flex rounded-lg border border-[color:var(--honey-line)] bg-background p-1 shadow-sm"
          role="group"
          aria-label="Alternar ambiente SEFAZ"
        >
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => requestChange("homologacao")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
              isHomolog
                ? "bg-sky-600 text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            <FlaskConical className="size-3.5" />
            Homologacao
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => requestChange("producao")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
              !isHomolog
                ? "bg-amber-600 text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            <Store className="size-3.5" />
            Producao
          </button>
        </div>
      </div>
    </div>
  );
}
