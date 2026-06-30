import {
  DEFAULT_HORARIOS,
  buildDefaultHorariosConfig,
  buildDefaultHorariosPainelState,
  ensureFullWeek,
  normalizeHorarioDia,
  normalizeHorariosConfig,
  resolveEffectiveLojaAberta,
  resolveStoreOpenStatus,
  STORE_TIMEZONE,
  type HorarioDia,
  type HorariosConfig,
  type HorariosPainelState,
} from "@/lib/horarios";

type DbHorarioRow = {
  dia_semana: number;
  ativo: boolean;
  abre: string;
  fecha: string;
};

type DbConfigRow = {
  loja_aberta: boolean;
  horario_automatico?: boolean | null;
  pausa_imediata?: boolean | null;
  fuso_horario?: string | null;
};

function isMissingHorariosSchema(message: string) {
  return /horarios_funcionamento|horario_automatico|pausa_imediata|fuso_horario|does not exist|schema cache|PGRST20/i.test(
    message,
  );
}

export async function fetchHorariosFromDb(tenantId?: string): Promise<{
  horarios: HorarioDia[];
  schemaReady: boolean;
}> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("horarios_funcionamento")
      .select("dia_semana, ativo, abre, fecha")
      .order("dia_semana");
    if (tenantId) query = query.eq("tenant_id", tenantId);

    const { data, error } = await query;

    if (error) {
      if (isMissingHorariosSchema(error.message)) {
        return { horarios: ensureFullWeek(DEFAULT_HORARIOS), schemaReady: false };
      }
      throw error;
    }

    if (!data?.length) {
      return { horarios: ensureFullWeek(DEFAULT_HORARIOS), schemaReady: true };
    }

    return {
      horarios: ensureFullWeek(
        (data as DbHorarioRow[]).map((row) =>
          normalizeHorarioDia({
            dia_semana: row.dia_semana,
            ativo: row.ativo,
            abre: String(row.abre).slice(0, 5),
            fecha: String(row.fecha).slice(0, 5),
          }),
        ),
      ),
      schemaReady: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar horarios.";
    if (isMissingHorariosSchema(message)) {
      return { horarios: ensureFullWeek(DEFAULT_HORARIOS), schemaReady: false };
    }
    throw error;
  }
}

export async function fetchHorariosConfigFromDb(tenantId?: string): Promise<{
  config: HorariosConfig;
  schemaReady: boolean;
}> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("config_operacional")
      .select("loja_aberta, horario_automatico, pausa_imediata, fuso_horario");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    else query = query.eq("id", "default");

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (isMissingHorariosSchema(error.message)) {
        return { config: buildDefaultHorariosConfig(), schemaReady: false };
      }
      throw error;
    }

    const row = (data ?? {}) as DbConfigRow;
    return {
      config: normalizeHorariosConfig({
        loja_aberta: row.loja_aberta ?? true,
        horario_automatico: row.horario_automatico ?? true,
        pausa_imediata: row.pausa_imediata ?? false,
        fuso_horario: row.fuso_horario ?? STORE_TIMEZONE,
      }),
      schemaReady: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar config.";
    if (isMissingHorariosSchema(message)) {
      return { config: buildDefaultHorariosConfig(), schemaReady: false };
    }
    throw error;
  }
}

export async function getResolvedOperationalOpenState(tenantId?: string): Promise<HorariosPainelState> {
  try {
    const [configResult, horariosResult] = await Promise.all([
      fetchHorariosConfigFromDb(tenantId),
      fetchHorariosFromDb(tenantId),
    ]);
    const config = normalizeHorariosConfig(configResult.config);
    const horarios = horariosResult.horarios;
    const status = resolveStoreOpenStatus(config, horarios);
    const schemaReady = configResult.schemaReady && horariosResult.schemaReady;

    return {
      config,
      horarios,
      status,
      loja_aberta: resolveEffectiveLojaAberta(config, horarios),
      schemaReady,
      warning: schemaReady
        ? undefined
        : "Migration de horarios ainda nao aplicada no Supabase. Exibindo horario padrao ate salvar.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar horarios.";
    return buildDefaultHorariosPainelState({
      schemaReady: false,
      warning: message,
    });
  }
}

export async function saveHorariosConfigToDb(config: HorariosConfig, tenantId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const normalized = normalizeHorariosConfig(config);
  let query = supabaseAdmin.from("config_operacional").update({
    loja_aberta: normalized.loja_aberta,
    horario_automatico: normalized.horario_automatico,
    pausa_imediata: normalized.pausa_imediata,
    fuso_horario: STORE_TIMEZONE,
    updated_at: new Date().toISOString(),
  });
  if (tenantId) query = query.eq("tenant_id", tenantId);
  else query = query.eq("id", "default");

  const { error } = await query;
  if (error) {
    if (isMissingHorariosSchema(error.message)) {
      throw new Error(
        "Migration de horarios nao aplicada. Rode 20260617300000_horarios_funcionamento.sql no Supabase.",
      );
    }
    throw error;
  }

  const { syncAtendimentoWithStoreHoursNow } =
    await import("@/lib/atendimento/atendimento-hours.server");
  void syncAtendimentoWithStoreHoursNow().catch(console.error);
}

export async function saveHorariosGradeToDb(horarios: HorarioDia[], tenantId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const payload = ensureFullWeek(horarios).map((horario) => ({
    dia_semana: horario.dia_semana,
    ativo: horario.ativo,
    abre: horario.abre,
    fecha: horario.fecha,
    tenant_id: tenantId ?? null,
    updated_at: new Date().toISOString(),
  }));

  if (tenantId) {
    const { error: deleteError } = await supabaseAdmin
      .from("horarios_funcionamento")
      .delete()
      .eq("tenant_id", tenantId);
    if (deleteError) throw deleteError;
    const { error } = await supabaseAdmin.from("horarios_funcionamento").insert(payload);
    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from("horarios_funcionamento").upsert(payload, {
    onConflict: "dia_semana",
  });
  if (error) {
    if (isMissingHorariosSchema(error.message)) {
      throw new Error(
        "Tabela horarios_funcionamento ausente. Aplique a migration de horarios no Supabase.",
      );
    }
    throw error;
  }

  const { syncAtendimentoWithStoreHoursNow } =
    await import("@/lib/atendimento/atendimento-hours.server");
  void syncAtendimentoWithStoreHoursNow().catch(console.error);
}
