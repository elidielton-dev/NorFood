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
  type StoreOpenStatus,
} from "@/lib/shared/horarios";

const DEFAULT_TENANT_ID = "a0000000-0000-4000-8000-000000000001";

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

export type TenantOpenState = {
  config: HorariosConfig;
  horarios: HorarioDia[];
  status: StoreOpenStatus;
  loja_aberta_efetiva: boolean;
  loja_aberta_manual: boolean;
  horario_automatico: boolean;
  pausa_imediata: boolean;
  schemaReady: boolean;
  warning?: string;
};

function isMissingHorariosSchema(message: string) {
  return /horarios_funcionamento|horario_automatico|pausa_imediata|fuso_horario|does not exist|schema cache|PGRST20/i.test(
    message,
  );
}

export async function bootstrapTenantOperationalData(tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: configRow } = await supabaseAdmin
    .from("config_operacional")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!configRow) {
    const { data: settings } = await supabaseAdmin
      .from("tenant_settings")
      .select("pedido_minimo, delivery_fee_default, loja_aberta, pontos_por_real")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    await supabaseAdmin.from("config_operacional").upsert({
      id: tenantId,
      tenant_id: tenantId,
      pedido_minimo: Number(settings?.pedido_minimo ?? 0),
      valor_padrao_entrega: Number(settings?.delivery_fee_default ?? 5),
      loja_aberta: settings?.loja_aberta ?? true,
      pontos_por_real: Number(settings?.pontos_por_real ?? 1),
      horario_automatico: true,
      pausa_imediata: false,
      fuso_horario: STORE_TIMEZONE,
      updated_at: new Date().toISOString(),
    });
  }

  const { data: horariosRows } = await supabaseAdmin
    .from("horarios_funcionamento")
    .select("dia_semana")
    .eq("tenant_id", tenantId);

  if ((horariosRows ?? []).length >= 7) return;

  let source = DEFAULT_HORARIOS;
  const { data: templateRows } = await supabaseAdmin
    .from("horarios_funcionamento")
    .select("dia_semana, ativo, abre, fecha")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .order("dia_semana");

  if (templateRows?.length) {
    source = templateRows.map((row) =>
      normalizeHorarioDia({
        dia_semana: row.dia_semana,
        ativo: row.ativo,
        abre: String(row.abre).slice(0, 5),
        fecha: String(row.fecha).slice(0, 5),
      }),
    );
  }

  await saveHorariosGradeToDb(source, tenantId, { skipSync: true });
}

export async function fetchHorariosFromDb(tenantId?: string): Promise<{
  horarios: HorarioDia[];
  schemaReady: boolean;
  fromDefaults: boolean;
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
        return { horarios: ensureFullWeek(DEFAULT_HORARIOS), schemaReady: false, fromDefaults: true };
      }
      throw error;
    }

    if (!data?.length) {
      return { horarios: ensureFullWeek(DEFAULT_HORARIOS), schemaReady: true, fromDefaults: true };
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
      fromDefaults: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar horarios.";
    if (isMissingHorariosSchema(message)) {
      return { horarios: ensureFullWeek(DEFAULT_HORARIOS), schemaReady: false, fromDefaults: true };
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

export async function getTenantOpenState(tenantId?: string): Promise<TenantOpenState> {
  try {
    if (tenantId) {
      await bootstrapTenantOperationalData(tenantId).catch(console.error);
    }

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
      loja_aberta_efetiva: resolveEffectiveLojaAberta(config, horarios),
      loja_aberta_manual: config.loja_aberta,
      horario_automatico: config.horario_automatico,
      pausa_imediata: config.pausa_imediata,
      schemaReady,
      warning: schemaReady
        ? horariosResult.fromDefaults
          ? "Horarios padrao em uso. Salve a grade para personalizar."
          : undefined
        : "Migration de horarios ainda nao aplicada no Supabase. Exibindo horario padrao ate salvar.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar horarios.";
    const fallback = buildDefaultHorariosPainelState({
      schemaReady: false,
      warning: message,
    });
    return {
      config: fallback.config,
      horarios: fallback.horarios,
      status: fallback.status,
      loja_aberta_efetiva: fallback.loja_aberta,
      loja_aberta_manual: fallback.config.loja_aberta,
      horario_automatico: fallback.config.horario_automatico,
      pausa_imediata: fallback.config.pausa_imediata,
      schemaReady: false,
      warning: message,
    };
  }
}

export async function getResolvedOperationalOpenState(tenantId?: string): Promise<HorariosPainelState> {
  const state = await getTenantOpenState(tenantId);
  return {
    config: state.config,
    horarios: state.horarios,
    status: state.status,
    loja_aberta: state.loja_aberta_efetiva,
    schemaReady: state.schemaReady,
    warning: state.warning,
  };
}

export async function saveHorariosConfigToDb(config: HorariosConfig, tenantId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const normalized = normalizeHorariosConfig(config);

  if (tenantId) {
    await bootstrapTenantOperationalData(tenantId);
    const { error } = await supabaseAdmin.from("config_operacional").upsert({
      id: tenantId,
      tenant_id: tenantId,
      loja_aberta: normalized.loja_aberta,
      horario_automatico: normalized.horario_automatico,
      pausa_imediata: normalized.pausa_imediata,
      fuso_horario: STORE_TIMEZONE,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (isMissingHorariosSchema(error.message)) {
        throw new Error(
          "Migration de horarios nao aplicada. Rode 20260617300000_horarios_funcionamento.sql no Supabase.",
        );
      }
      throw error;
    }
  } else {
    const { error } = await supabaseAdmin
      .from("config_operacional")
      .update({
        loja_aberta: normalized.loja_aberta,
        horario_automatico: normalized.horario_automatico,
        pausa_imediata: normalized.pausa_imediata,
        fuso_horario: STORE_TIMEZONE,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
    if (error) {
      if (isMissingHorariosSchema(error.message)) {
        throw new Error(
          "Migration de horarios nao aplicada. Rode 20260617300000_horarios_funcionamento.sql no Supabase.",
        );
      }
      throw error;
    }
  }

  const { syncAtendimentoWithStoreHoursNow } =
    await import("@/lib/atendimento/atendimento-hours.server");
  void syncAtendimentoWithStoreHoursNow(tenantId).catch(console.error);
}

export async function saveHorariosGradeToDb(
  horarios: HorarioDia[],
  tenantId?: string,
  options?: { skipSync?: boolean },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const resolvedTenantId = tenantId ?? DEFAULT_TENANT_ID;

  if (tenantId) {
    await bootstrapTenantOperationalData(tenantId);
  }

  const payload = ensureFullWeek(horarios).map((horario) => ({
    tenant_id: resolvedTenantId,
    dia_semana: horario.dia_semana,
    ativo: horario.ativo,
    abre: horario.abre,
    fecha: horario.fecha,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from("horarios_funcionamento")
    .upsert(payload, { onConflict: "tenant_id,dia_semana" });

  if (error) {
    if (isMissingHorariosSchema(error.message)) {
      throw new Error(
        "Tabela horarios_funcionamento ausente. Aplique a migration de horarios no Supabase.",
      );
    }
    throw error;
  }

  if (!options?.skipSync) {
    const { syncAtendimentoWithStoreHoursNow } =
      await import("@/lib/atendimento/atendimento-hours.server");
    void syncAtendimentoWithStoreHoursNow(tenantId).catch(console.error);
  }
}
