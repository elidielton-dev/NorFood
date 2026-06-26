import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";
import {
  buildDefaultHorariosPainelState,
  isValidHorarioDia,
  type HorarioDia,
  type HorariosConfig,
} from "@/lib/horarios";
import {
  getResolvedOperationalOpenState,
  saveHorariosConfigToDb,
  saveHorariosGradeToDb,
} from "@/lib/api/horarios.server";

export const fetchHorariosPainelServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await assertStaffUserId(context.userId, "Acesso restrito aos horarios da loja.");
      return await getResolvedOperationalOpenState();
    } catch (error) {
      console.error("[fetchHorariosPainelServer]", error);
      const message = error instanceof Error ? error.message : "Falha ao carregar horarios.";
      return buildDefaultHorariosPainelState({
        schemaReady: false,
        warning: message,
      });
    }
  });

export const fetchStoreOpenStatusPublicServer = createServerFn({ method: "GET" }).handler(
  async () => {
    const resolved = await getResolvedOperationalOpenState();
    return {
      loja_aberta: resolved.loja_aberta,
      status: resolved.status,
      horario_automatico: resolved.config.horario_automatico,
    };
  },
);

export const saveHorariosConfigServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: HorariosConfig) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito aos horarios da loja.");
    await saveHorariosConfigToDb(data);
    return getResolvedOperationalOpenState();
  });

export const saveHorariosGradeServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { horarios: HorarioDia[] }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito aos horarios da loja.");
    for (const horario of data.horarios) {
      if (!isValidHorarioDia(horario)) {
        throw new Error("Horario invalido: abertura deve ser antes do fechamento.");
      }
    }
    await saveHorariosGradeToDb(data.horarios);
    return getResolvedOperationalOpenState();
  });

export const saveHorariosPainelServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { config: HorariosConfig; horarios: HorarioDia[] }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito aos horarios da loja.");
    for (const horario of data.horarios) {
      if (!isValidHorarioDia(horario)) {
        throw new Error("Horario invalido: abertura deve ser antes do fechamento.");
      }
    }
    await saveHorariosConfigToDb(data.config);
    await saveHorariosGradeToDb(data.horarios);
    return getResolvedOperationalOpenState();
  });
