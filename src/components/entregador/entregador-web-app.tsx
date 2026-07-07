import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aceitarEntrega, concluirEntrega, listarEntregas, type Entrega } from "@/lib/shared/db";
import { MapPin, Bike, Check, ArrowLeft, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { isDemoSession } from "@/lib/shared/runtime";

const ACTIVE_DELIVERY_STATUSES = new Set([
  "aceito",
  "em_rota",
  "na_loja",
  "pedido_retirado",
  "chegou_cliente",
]);

type EntregadorWebAppProps = {
  onLogout?: () => void;
  showPainelLink?: boolean;
};

export function EntregadorWebApp({ onLogout, showPainelLink = false }: EntregadorWebAppProps) {
  const qc = useQueryClient();
  const {
    data: entregas = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["entregas"],
    queryFn: listarEntregas,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (isDemoSession()) return;
    const ch = supabase
      .channel("entregas")
      .on("postgres_changes", { event: "*", schema: "public", table: "entregas" }, () =>
        qc.invalidateQueries({ queryKey: ["entregas"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  async function aceitar(e: Entrega) {
    try {
      await aceitarEntrega(e.id);
      toast.success("Entrega aceita");
      await qc.invalidateQueries({ queryKey: ["entregas"] });
    } catch (acceptError) {
      toast.error(
        acceptError instanceof Error ? acceptError.message : "Nao foi possivel aceitar a entrega",
      );
    }
  }

  async function concluir(e: Entrega) {
    try {
      await concluirEntrega(e.id);
      toast.success("Entrega concluida");
      await qc.invalidateQueries({ queryKey: ["entregas"] });
    } catch (completeError) {
      toast.error(
        completeError instanceof Error ? completeError.message : "Nao foi possivel concluir a entrega",
      );
    }
  }

  return (
    <div className="relative min-h-screen">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-md p-5">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {showPainelLink ? (
              <Link
                to="/painel"
                className="grid size-10 place-items-center rounded-full border border-border bg-card"
              >
                <ArrowLeft className="size-4" />
              </Link>
            ) : null}
            <div>
              <h1 className="flex items-center gap-2 font-display text-2xl">
                <Bike className="size-5" /> Entregas
              </h1>
              <p className="text-xs text-muted-foreground">App do entregador</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              className="grid size-10 place-items-center rounded-full border border-border bg-card"
              aria-label="Atualizar entregas"
            >
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                className="grid size-10 place-items-center rounded-full border border-border bg-card"
                aria-label="Sair"
              >
                <LogOut className="size-4" />
              </button>
            ) : null}
          </div>
        </header>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Carregando entregas...</p>
        ) : null}

        {isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Erro ao carregar entregas"}
          </div>
        ) : null}

        {!isLoading && !isError ? (
          <div className="space-y-3">
            {entregas.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Sem entregas no momento. Puxe para atualizar ou aguarde novos pedidos.
              </p>
            ) : null}
            {entregas.map((e) => (
              <div key={e.id} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                <div className="mb-2 flex items-start justify-between">
                  <span className="rounded-full bg-sage/20 px-2 py-1 text-xs capitalize text-sage">
                    {e.status.replaceAll("_", " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">{e.bairro ?? "—"}</span>
                </div>
                <p className="flex items-start gap-2 text-sm font-medium">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-gold" /> {e.endereco}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Taxa: R$ {Number(e.taxa).toFixed(2)}
                  </span>
                  {e.status === "pendente" ? (
                    <button
                      type="button"
                      onClick={() => void aceitar(e)}
                      className="gradient-sage rounded-full px-4 py-2 text-xs text-primary-foreground"
                    >
                      Aceitar
                    </button>
                  ) : null}
                  {ACTIVE_DELIVERY_STATUSES.has(e.status) ? (
                    <button
                      type="button"
                      onClick={() => void concluir(e)}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-4 py-2 text-xs text-white"
                    >
                      <Check className="size-3" /> Entreguei
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
