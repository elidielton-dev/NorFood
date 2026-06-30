import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Clock, Copy, PauseCircle, PlayCircle, RefreshCw, Save, Store, Timer } from "lucide-react";
import { toast } from "sonner";
import { fetchHorariosPainelServer, saveHorariosPainelServer } from "@/lib/api/horarios.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import {
  DIAS_SEMANA,
  ensureFullWeek,
  isValidHorarioDia,
  resolveStoreOpenStatus,
  STORE_TIMEZONE,
  type HorarioDia,
  type HorariosConfig,
} from "@/lib/horarios";
import {
  GestaoAlert,
  GestaoButton,
  GestaoCard,
  GestaoInput,
  GestaoPage,
  GestaoSectionTitle,
  GestaoTable,
  GestaoTableHead,
  StatusPill,
} from "@/components/gestao-ui";

export const Route = createFileRoute("/_authenticated/painel/estabelecimento/horarios")({
  component: HorariosPage,
});

function HorariosPage() {
  const tenantSlug = useTenantSlug();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["horarios-painel", tenantSlug],
    queryFn: () => fetchHorariosPainelServer({ data: tenantSlug }),
    retry: 1,
    staleTime: 30_000,
  });

  const [config, setConfig] = useState<HorariosConfig | null>(null);
  const [horarios, setHorarios] = useState<HorarioDia[] | null>(null);

  const activeConfig = config ?? data?.config ?? null;
  const activeHorarios = horarios ?? data?.horarios ?? [];

  const status = useMemo(() => {
    if (data?.status && !config && !horarios) return data.status;
    if (!activeConfig) return null;
    return resolveStoreOpenStatus(activeConfig, ensureFullWeek(activeHorarios));
  }, [activeConfig, activeHorarios, config, data?.status, horarios]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!activeConfig) throw new Error("Configuracao indisponivel.");
      const grade = ensureFullWeek(activeHorarios);
      return saveHorariosPainelServer({
        data: {
          tenantSlug,
          config: { ...activeConfig, fuso_horario: STORE_TIMEZONE },
          horarios: grade,
        },
      });
    },
    onSuccess: (result) => {
      toast.success("Horarios salvos e aplicados na operacao.");
      setConfig(null);
      setHorarios(null);
      qc.setQueryData(["horarios-painel", tenantSlug], result);
      void qc.invalidateQueries({ queryKey: ["sidebar-operacao", tenantSlug] });
      void qc.invalidateQueries({ queryKey: ["operational-admin", tenantSlug] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function updateHorario(dia: number, patch: Partial<HorarioDia>) {
    setHorarios((current) => {
      const base = ensureFullWeek(current ?? data?.horarios ?? []);
      return base.map((item) => (item.dia_semana === dia ? { ...item, ...patch } : item));
    });
  }

  function aplicarHorarioComercial() {
    setHorarios(
      ensureFullWeek([]).map((item) => ({
        ...item,
        ativo: true,
        abre: "08:00",
        fecha: item.dia_semana === 0 ? "14:00" : item.dia_semana === 6 ? "18:00" : "20:00",
      })),
    );
  }

  function copiarSegundaParaDiasUteis() {
    const base = ensureFullWeek(horarios ?? data?.horarios ?? []);
    const segunda = base.find((item) => item.dia_semana === 1);
    if (!segunda) return;
    setHorarios(
      base.map((item) =>
        item.dia_semana >= 2 && item.dia_semana <= 5
          ? { ...item, ativo: segunda.ativo, abre: segunda.abre, fecha: segunda.fecha }
          : item,
      ),
    );
    toast.message("Horario de segunda-feira copiado para terca a sexta.");
  }

  function salvarTudo() {
    if (!activeConfig) return;
    const grade = ensureFullWeek(activeHorarios);
    for (const horario of grade) {
      if (!isValidHorarioDia(horario)) {
        toast.error("Corrija os horarios: abertura deve ser antes do fechamento.");
        return;
      }
    }
    saveMutation.mutate();
  }

  if (isLoading && !data) {
    return (
      <GestaoPage title="Horarios" subtitle="Carregando grade de funcionamento...">
        <GestaoCard>
          <p className="text-sm text-muted-foreground">Carregando horarios...</p>
        </GestaoCard>
      </GestaoPage>
    );
  }

  if ((isError || !activeConfig || !status) && !data) {
    return (
      <GestaoPage title="Horarios" subtitle="Nao foi possivel carregar os horarios.">
        <GestaoCard className="space-y-4">
          <GestaoAlert tone="warning">
            {error instanceof Error ? error.message : "Erro ao buscar horarios da loja."}
          </GestaoAlert>
          <GestaoButton onClick={() => void refetch()}>
            <RefreshCw className="size-4" />
            Tentar novamente
          </GestaoButton>
        </GestaoCard>
      </GestaoPage>
    );
  }

  if (!activeConfig || !status) {
    return (
      <GestaoPage title="Horarios" subtitle="Carregando grade de funcionamento...">
        <GestaoCard>
          <p className="text-sm text-muted-foreground">Preparando horarios...</p>
        </GestaoCard>
      </GestaoPage>
    );
  }

  return (
    <GestaoPage
      title="Horarios de funcionamento"
      subtitle="Grade semanal, pausa imediata e controle de quando a loja aceita pedidos."
      actions={
        <GestaoButton variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </GestaoButton>
      }
    >
      {data?.warning ? <GestaoAlert tone="warning">{data.warning}</GestaoAlert> : null}
      {!data?.schemaReady ? (
        <GestaoAlert tone="info">
          Para persistir horarios no banco, aplique a migration{" "}
          <code className="rounded bg-sky-100 px-1">20260617300000_horarios_funcionamento.sql</code>{" "}
          no Supabase.
        </GestaoAlert>
      ) : null}

      <GestaoCard
        className={
          status.abertaAgora
            ? "border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-white"
            : "border-rose-200 bg-gradient-to-br from-rose-50/80 to-white"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`size-3 rounded-full ${status.abertaAgora ? "bg-emerald-500" : "bg-rose-500"}`}
              />
              <p className="font-display text-2xl text-[color:var(--gestao-ink)]">
                {status.abertaAgora ? "Loja aberta agora" : "Loja fechada agora"}
              </p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{status.motivo}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {status.diaAtual}
              {status.horarioHoje?.ativo
                ? ` · ${status.horarioHoje.abre} as ${status.horarioHoje.fecha}`
                : " · sem expediente hoje"}
              {status.proximaAbertura ? ` · Proxima abertura: ${status.proximaAbertura}` : ""}
            </p>
          </div>
          <StatusPill tone={status.abertaAgora ? "success" : "danger"}>
            {activeConfig.horario_automatico ? "Grade automatica" : "Controle manual"}
          </StatusPill>
        </div>
      </GestaoCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <GestaoCard>
          <GestaoSectionTitle
            title="Modo de funcionamento"
            description="Automatico segue a grade. Manual usa o interruptor e a grade continua editavel."
            action={<Timer className="size-5 text-sage" />}
          />
          <div className="mt-4 space-y-3">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[color:var(--honey-line)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Seguir grade de horarios</p>
                <p className="text-xs text-muted-foreground">
                  Ligado: abre e fecha sozinho. Desligado: voce controla com o interruptor abaixo.
                </p>
              </div>
              <input
                type="checkbox"
                checked={activeConfig.horario_automatico}
                onChange={(e) =>
                  setConfig({
                    ...activeConfig,
                    horario_automatico: e.target.checked,
                  })
                }
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
              <div className="flex items-start gap-2">
                <PauseCircle className="mt-0.5 size-4 text-amber-700" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Pausa imediata</p>
                  <p className="text-xs text-amber-800">
                    Fecha a loja agora, em qualquer modo, ate desativar.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={activeConfig.pausa_imediata}
                onChange={(e) => setConfig({ ...activeConfig, pausa_imediata: e.target.checked })}
              />
            </label>

            {!activeConfig.horario_automatico ? (
              <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
                <div className="flex items-start gap-2">
                  <Store className="mt-0.5 size-4 text-sky-700" />
                  <div>
                    <p className="text-sm font-semibold text-sky-900">Controle manual de pedidos</p>
                    <p className="text-xs text-sky-800">
                      Decide se a loja aceita pedidos agora. A grade semanal abaixo continua
                      editavel para vitrine e referencia.
                    </p>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-sky-200 bg-white px-4 py-3">
                  <span className="text-sm font-semibold">Loja aberta para pedidos</span>
                  <input
                    type="checkbox"
                    checked={activeConfig.loja_aberta}
                    onChange={(e) => setConfig({ ...activeConfig, loja_aberta: e.target.checked })}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <GestaoButton
                    size="sm"
                    onClick={() =>
                      setConfig({ ...activeConfig, loja_aberta: true, pausa_imediata: false })
                    }
                  >
                    <PlayCircle className="size-4" />
                    Abrir loja agora
                  </GestaoButton>
                  <GestaoButton
                    size="sm"
                    variant="secondary"
                    onClick={() => setConfig({ ...activeConfig, loja_aberta: false })}
                  >
                    <PauseCircle className="size-4" />
                    Fechar loja agora
                  </GestaoButton>
                </div>
              </div>
            ) : null}
          </div>
        </GestaoCard>

        <GestaoCard>
          <GestaoSectionTitle
            title="Atalhos"
            description="Presets rapidos da grade semanal."
            action={<Clock className="size-5 text-gold" />}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <GestaoButton variant="secondary" size="sm" onClick={aplicarHorarioComercial}>
              <PlayCircle className="size-4" />
              Horario comercial padrao
            </GestaoButton>
            <GestaoButton variant="secondary" size="sm" onClick={copiarSegundaParaDiasUteis}>
              <Copy className="size-4" />
              Segunda para dias uteis
            </GestaoButton>
            <Link to="/painel/configuracoes/operacao">
              <GestaoButton variant="secondary" size="sm">
                Operacao da loja
              </GestaoButton>
            </Link>
          </div>
        </GestaoCard>
      </div>

      <GestaoCard>
        <GestaoSectionTitle
          title="Grade semanal"
          description={
            activeConfig.horario_automatico
              ? "Define quando a loja abre e fecha automaticamente."
              : "Edite os horarios de funcionamento. No modo manual, a grade fica salva para vitrine e referencia."
          }
        />
        {!activeConfig.horario_automatico ? (
          <GestaoAlert tone="info" className="mt-4">
            Modo manual ativo: a grade abaixo pode ser editada e salva normalmente. O interruptor de
            controle manual decide se a loja aceita pedidos neste momento.
          </GestaoAlert>
        ) : null}
        <GestaoTable className="mt-4">
          <GestaoTableHead>
            <tr>
              <th className="p-3">Dia</th>
              <th className="p-3">Ativo</th>
              <th className="p-3">Abre</th>
              <th className="p-3">Fecha</th>
            </tr>
          </GestaoTableHead>
          <tbody>
            {ensureFullWeek(activeHorarios).map((horario) => {
              const dia = DIAS_SEMANA.find((d) => d.dia === horario.dia_semana);
              const invalido = horario.ativo && !isValidHorarioDia(horario);
              return (
                <tr
                  key={horario.dia_semana}
                  className={`border-t border-[color:var(--honey-line)] ${invalido ? "bg-rose-50/50" : ""}`}
                >
                  <td className="p-3 font-medium">{dia?.label}</td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={horario.ativo}
                      onChange={(e) =>
                        updateHorario(horario.dia_semana, { ativo: e.target.checked })
                      }
                    />
                  </td>
                  <td className="p-3">
                    <GestaoInput
                      type="time"
                      value={horario.abre}
                      disabled={!horario.ativo}
                      onChange={(e) => updateHorario(horario.dia_semana, { abre: e.target.value })}
                    />
                  </td>
                  <td className="p-3">
                    <GestaoInput
                      type="time"
                      value={horario.fecha}
                      disabled={!horario.ativo}
                      onChange={(e) => updateHorario(horario.dia_semana, { fecha: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </GestaoTable>

        {!ensureFullWeek(activeHorarios).every((h) => !h.ativo || isValidHorarioDia(h)) ? (
          <GestaoAlert tone="warning" className="mt-4">
            Alguns dias tem horario invalido. A abertura deve ser antes do fechamento.
          </GestaoAlert>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <GestaoButton onClick={salvarTudo} disabled={saveMutation.isPending}>
            <Save className="size-4" />
            Salvar horarios
          </GestaoButton>
        </div>
      </GestaoCard>
    </GestaoPage>
  );
}
