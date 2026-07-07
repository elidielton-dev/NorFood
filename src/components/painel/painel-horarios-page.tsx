import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Clock, Copy, PauseCircle, PlayCircle, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { fetchHorariosPainelServer, saveHorariosPainelServer } from "@/lib/api/tenant/horarios.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import {
  DIAS_SEMANA,
  ensureFullWeek,
  isValidHorarioDia,
  resolveStoreOpenStatus,
  STORE_TIMEZONE,
  type HorarioDia,
  type HorariosConfig,
} from "@/lib/shared/horarios";
import {
  GestaoAlert,
  GestaoButton,
  GestaoInput,
  GestaoTable,
  GestaoTableHead,
  StatusPill,
} from "@/components/painel/gestao-ui";
import {
  ConfigSection,
  ConfigSwitchRow,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { tenantPath } from "@/lib/tenant/painel-routes";

export function HorariosPage(_props: { backTo?: string } = {}) {
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
      <ConfiguracoesPageFrame title="Horários de funcionamento" description="Carregando...">
        <p className="text-sm text-muted-foreground">Carregando horários...</p>
      </ConfiguracoesPageFrame>
    );
  }

  if ((isError || !activeConfig || !status) && !data) {
    return (
      <ConfiguracoesPageFrame
        title="Horários de funcionamento"
        description="Não foi possível carregar os horários."
      >
        <GestaoAlert tone="warning">
          {error instanceof Error ? error.message : "Erro ao buscar horários da loja."}
        </GestaoAlert>
        <GestaoButton className="mt-4" onClick={() => void refetch()}>
          <RefreshCw className="size-4" />
          Tentar novamente
        </GestaoButton>
      </ConfiguracoesPageFrame>
    );
  }

  if (!activeConfig || !status) {
    return (
      <ConfiguracoesPageFrame title="Horários de funcionamento" description="Carregando...">
        <p className="text-sm text-muted-foreground">Preparando horários...</p>
      </ConfiguracoesPageFrame>
    );
  }

  return (
    <ConfiguracoesPageFrame
      title="Horários de funcionamento"
      description="Grade semanal, pausa imediata e controle de quando a loja aceita pedidos."
      actions={
        <div className="flex flex-wrap gap-2">
          <GestaoButton variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </GestaoButton>
          <GestaoButton onClick={salvarTudo} disabled={saveMutation.isPending}>
            <Save className="size-4" />
            Salvar horários
          </GestaoButton>
        </div>
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

      <ConfigSection title="Status atual" description={status.motivo}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`size-3 rounded-full ${status.abertaAgora ? "bg-emerald-500" : "bg-rose-500"}`}
              />
              <p className="text-lg font-semibold text-[#1F2937]">
                {status.abertaAgora ? "Loja aberta agora" : "Loja fechada agora"}
              </p>
            </div>
            <p className="mt-2 text-sm text-[#6B7280]">
              {status.diaAtual}
              {status.horarioHoje?.ativo
                ? ` · ${status.horarioHoje.abre} às ${status.horarioHoje.fecha}`
                : " · sem expediente hoje"}
              {status.proximaAbertura ? ` · Próxima abertura: ${status.proximaAbertura}` : ""}
            </p>
          </div>
          <StatusPill tone={status.abertaAgora ? "success" : "danger"}>
            {activeConfig.horario_automatico ? "Grade automática" : "Controle manual"}
          </StatusPill>
        </div>
      </ConfigSection>

      <ConfigSection
        title="Operação da loja"
        description="Automático segue a grade. Manual usa o interruptor e a grade continua editável."
      >
        <ConfigSwitchRow
          description="Define se a loja abre e fecha automaticamente conforme a grade semanal abaixo."
          label="Seguir grade de horários"
          checked={activeConfig.horario_automatico}
          onCheckedChange={(checked) =>
            setConfig({ ...activeConfig, horario_automatico: checked })
          }
        />
        <ConfigSwitchRow
          description="Fecha a loja imediatamente, em qualquer modo, até você desativar esta opção."
          label="Pausa imediata"
          checked={activeConfig.pausa_imediata}
          onCheckedChange={(checked) => setConfig({ ...activeConfig, pausa_imediata: checked })}
        />
        {!activeConfig.horario_automatico ? (
          <>
            <ConfigSwitchRow
              description="No modo manual, decide se a loja aceita pedidos neste momento."
              label="Loja aberta para pedidos"
              checked={activeConfig.loja_aberta}
              onCheckedChange={(checked) => setConfig({ ...activeConfig, loja_aberta: checked })}
            />
            <div className="flex flex-wrap gap-2 border-t border-[#F3F4F6] pt-4">
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
          </>
        ) : null}
      </ConfigSection>

      <ConfigSection title="Atalhos" description="Presets rápidos da grade semanal.">
        <div className="flex flex-wrap gap-2">
          <GestaoButton variant="secondary" size="sm" onClick={aplicarHorarioComercial}>
            <PlayCircle className="size-4" />
            Horário comercial padrão
          </GestaoButton>
          <GestaoButton variant="secondary" size="sm" onClick={copiarSegundaParaDiasUteis}>
            <Copy className="size-4" />
            Segunda para dias úteis
          </GestaoButton>
          <Link to={tenantPath(tenantSlug, "configuracoes/operacao")}>
            <GestaoButton variant="secondary" size="sm">
              Operação da loja
            </GestaoButton>
          </Link>
        </div>
      </ConfigSection>

      <ConfigSection
        title="Grade semanal"
        description={
          activeConfig.horario_automatico
            ? "Define quando a loja abre e fecha automaticamente."
            : "Edite os horários de funcionamento. No modo manual, a grade fica salva para vitrine e referência."
        }
      >
        {!activeConfig.horario_automatico ? (
          <GestaoAlert tone="info" className="mb-4">
            Modo manual ativo: a grade abaixo pode ser editada e salva normalmente. O interruptor de
            controle manual decide se a loja aceita pedidos neste momento.
          </GestaoAlert>
        ) : null}
        <GestaoTable>
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
            Alguns dias têm horário inválido. A abertura deve ser antes do fechamento.
          </GestaoAlert>
        ) : null}
      </ConfigSection>
    </ConfiguracoesPageFrame>
  );
}
