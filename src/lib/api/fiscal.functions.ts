import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";
import type { EmpresaFiscal, FiscalAmbiente } from "@/lib/fiscal/fiscal-types";
import type { SaveFiscalConfigInput } from "@/lib/api/fiscal-store.server";

export const fetchFiscalSettingsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    const { fetchFiscalSettings } = await import("@/lib/api/fiscal-store.server");
    return fetchFiscalSettings();
  });

export const saveEmpresaFiscalServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: EmpresaFiscal) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { saveEmpresaFiscal } = await import("@/lib/api/fiscal-store.server");
    await saveEmpresaFiscal(data);
    return { ok: true as const };
  });

export const lookupCnpjPublicServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { cnpj: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { lookupCnpjPublic } = await import("@/lib/api/cnpj-lookup.server");
    return lookupCnpjPublic(data.cnpj);
  });

export const saveFiscalConfigServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SaveFiscalConfigInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { saveFiscalConfig } = await import("@/lib/api/fiscal-store.server");
    await saveFiscalConfig(data);
    return { ok: true as const };
  });

export const setFiscalAmbienteServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ambiente: FiscalAmbiente }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { setFiscalAmbiente } = await import("@/lib/api/fiscal-store.server");
    return setFiscalAmbiente(data.ambiente);
  });

export const uploadFiscalCertificateServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pfxBase64: string; password: string; empresaCnpj: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { installFiscalCertificate } = await import("@/lib/api/fiscal.server");
    return installFiscalCertificate(data);
  });

export const removeFiscalCertificateServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    const { removeStoredCertificate } = await import("@/lib/api/fiscal-store.server");
    await removeStoredCertificate();
    return { ok: true as const };
  });

export const emitNfceForPedidoServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pedidoId: string; consumidorCpf?: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { emitNfceForPedido } = await import("@/lib/api/fiscal.server");
    return emitNfceForPedido(data.pedidoId, data.consumidorCpf);
  });

export const emitNfceHomologacaoTestServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    const { emitNfceHomologacaoTest } = await import("@/lib/api/fiscal.server");
    return emitNfceHomologacaoTest();
  });

export const testSefazConnectionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    const { testSefazConnection } = await import("@/lib/api/fiscal.server");
    return testSefazConnection();
  });

export const fetchNotasFiscaisServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notas_fiscais")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const consultarStatusNotaFiscalServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { notaId: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { consultarStatusNotaFiscal } = await import("@/lib/api/fiscal.server");
    return consultarStatusNotaFiscal(data.notaId);
  });

export const cancelarNotaFiscalServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { notaId: string; justificativa: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { cancelarNotaFiscal } = await import("@/lib/api/fiscal.server");
    return cancelarNotaFiscal(data.notaId, data.justificativa);
  });

export const inutilizarNumeracaoFiscalServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { serie: number; numeroInicial: number; numeroFinal: number; justificativa: string; ano?: number }) =>
      input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { inutilizarNumeracaoFiscal } = await import("@/lib/api/fiscal.server");
    return inutilizarNumeracaoFiscal(data);
  });
