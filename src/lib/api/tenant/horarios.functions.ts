import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth/auth-helpers.server";
import {
  buildDefaultHorariosPainelState,
  isValidHorarioDia,
  type HorarioDia,
  type HorariosConfig,
} from "@/lib/shared/horarios";
import {
  getResolvedOperationalOpenState,
  saveHorariosConfigToDb,
  saveHorariosGradeToDb,
} from "@/lib/api/tenant/horarios.server";

export const fetchHorariosPainelServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    try {
      await assertStaffUserId(context.userId, "Acesso restrito aos horarios da loja.");
      const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
      return await getResolvedOperationalOpenState(tenantId);
    } catch (error) {
      console.error("[fetchHorariosPainelServer]", error);
      const message = error instanceof Error ? error.message : "Falha ao carregar horarios.";
      return buildDefaultHorariosPainelState({
        schemaReady: false,
        warning: message,
      });
    }
  });

export const fetchStoreOpenStatusPublicServer = createServerFn({ method: "GET" })
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ data: tenantSlug }) => {
    const { resolveTenantIdBySlug } = await import("@/lib/api/financeiro/platform-billing.functions");
    const tenantId = await resolveTenantIdBySlug(tenantSlug);
    const resolved = await getResolvedOperationalOpenState(tenantId ?? undefined);
    return {
      loja_aberta: resolved.loja_aberta,
      status: resolved.status,
      horario_automatico: resolved.config.horario_automatico,
    };
  });

export const saveHorariosConfigServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: HorariosConfig & { tenantSlug: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito aos horarios da loja.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { tenantSlug: _slug, ...config } = data;
    await saveHorariosConfigToDb(config, tenantId);
    return getResolvedOperationalOpenState(tenantId);
  });

export const saveHorariosGradeServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; horarios: HorarioDia[] }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito aos horarios da loja.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    for (const horario of data.horarios) {
      if (!isValidHorarioDia(horario)) {
        throw new Error("Horario invalido: abertura deve ser antes do fechamento.");
      }
    }
    await saveHorariosGradeToDb(data.horarios, tenantId);
    return getResolvedOperationalOpenState(tenantId);
  });

export const saveHorariosPainelServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; config: HorariosConfig; horarios: HorarioDia[] }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito aos horarios da loja.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    for (const horario of data.horarios) {
      if (!isValidHorarioDia(horario)) {
        throw new Error("Horario invalido: abertura deve ser antes do fechamento.");
      }
    }
    await saveHorariosConfigToDb(data.config, tenantId);
    await saveHorariosGradeToDb(data.horarios, tenantId);
    return getResolvedOperationalOpenState(tenantId);
  });
