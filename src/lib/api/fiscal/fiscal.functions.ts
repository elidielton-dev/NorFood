import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth/auth-helpers.server";
import type { EmpresaFiscal, FiscalAmbiente } from "@/lib/fiscal/fiscal-types";
import type { SaveFiscalConfigInput } from "@/lib/api/fiscal/fiscal-store.server";

async function resolveFiscalTenantId(userId: string, tenantSlug: string) {
  const { resolveStaffTenantId } = await import("@/lib/api/auth/auth-helpers.server");
  await assertStaffUserId(userId);
  return resolveStaffTenantId(userId, tenantSlug);
}

async function assertNotaBelongsToTenant(notaId: string, tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("notas_fiscais")
    .select("id")
    .eq("id", notaId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Nota fiscal nao encontrada neste restaurante.");
}

export const fetchFiscalSettingsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, tenantSlug);
    const { fetchFiscalSettings } = await import("@/lib/api/fiscal/fiscal-store.server");
    return fetchFiscalSettings(tenantId);
  });

export const saveEmpresaFiscalServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; empresa: EmpresaFiscal }) => input)
  .handler(async ({ context, data }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, data.tenantSlug);
    const { saveEmpresaFiscal } = await import("@/lib/api/fiscal/fiscal-store.server");
    await saveEmpresaFiscal(tenantId, data.empresa);
    return { ok: true as const };
  });

export const lookupCnpjPublicServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { cnpj: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { lookupCnpjPublic } = await import("@/lib/api/fiscal/cnpj-lookup.server");
    return lookupCnpjPublic(data.cnpj);
  });

export const saveFiscalConfigServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; config: SaveFiscalConfigInput }) => input)
  .handler(async ({ context, data }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, data.tenantSlug);
    const { saveFiscalConfig } = await import("@/lib/api/fiscal/fiscal-store.server");
    await saveFiscalConfig(tenantId, data.config);
    return { ok: true as const };
  });

export const setFiscalAmbienteServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; ambiente: FiscalAmbiente }) => input)
  .handler(async ({ context, data }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, data.tenantSlug);
    const { setFiscalAmbiente } = await import("@/lib/api/fiscal/fiscal-store.server");
    return setFiscalAmbiente(tenantId, data.ambiente);
  });

export const uploadFiscalCertificateServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      tenantSlug: string;
      pfxBase64: string;
      password: string;
      empresaCnpj: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, data.tenantSlug);
    const { installFiscalCertificate } = await import("@/lib/api/fiscal/fiscal.server");
    return installFiscalCertificate(tenantId, {
      pfxBase64: data.pfxBase64,
      password: data.password,
      empresaCnpj: data.empresaCnpj,
    });
  });

export const removeFiscalCertificateServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, tenantSlug);
    const { removeStoredCertificate } = await import("@/lib/api/fiscal/fiscal-store.server");
    await removeStoredCertificate(tenantId);
    return { ok: true as const };
  });

export const emitNfceForPedidoServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; pedidoId: string; consumidorCpf?: string }) => input)
  .handler(async ({ context, data }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pedido } = await supabaseAdmin
      .from("pedidos")
      .select("tenant_id")
      .eq("id", data.pedidoId)
      .maybeSingle();
    if (!pedido || pedido.tenant_id !== tenantId) {
      throw new Error("Pedido nao encontrado neste restaurante.");
    }
    const { emitNfceForPedido } = await import("@/lib/api/fiscal/fiscal.server");
    return emitNfceForPedido(data.pedidoId, data.consumidorCpf);
  });

export const emitNfceHomologacaoTestServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, tenantSlug);
    const { emitNfceHomologacaoTest } = await import("@/lib/api/fiscal/fiscal.server");
    return emitNfceHomologacaoTest(tenantId);
  });

export const testSefazConnectionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, tenantSlug);
    const { testSefazConnection } = await import("@/lib/api/fiscal/fiscal.server");
    return testSefazConnection(tenantId);
  });

export const fetchNotasFiscaisServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("notas_fiscais")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const consultarStatusNotaFiscalServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; notaId: string }) => input)
  .handler(async ({ context, data }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, data.tenantSlug);
    await assertNotaBelongsToTenant(data.notaId, tenantId);
    const { consultarStatusNotaFiscal } = await import("@/lib/api/fiscal/fiscal.server");
    return consultarStatusNotaFiscal(data.notaId, tenantId);
  });

export const cancelarNotaFiscalServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; notaId: string; justificativa: string }) => input)
  .handler(async ({ context, data }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, data.tenantSlug);
    await assertNotaBelongsToTenant(data.notaId, tenantId);
    const { cancelarNotaFiscal } = await import("@/lib/api/fiscal/fiscal.server");
    return cancelarNotaFiscal(data.notaId, data.justificativa, tenantId);
  });

export const inutilizarNumeracaoFiscalServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      tenantSlug: string;
      serie: number;
      numeroInicial: number;
      numeroFinal: number;
      justificativa: string;
      ano?: number;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const tenantId = await resolveFiscalTenantId(context.userId, data.tenantSlug);
    const { inutilizarNumeracaoFiscal } = await import("@/lib/api/fiscal/fiscal.server");
    const { tenantSlug, ...payload } = data;
    return inutilizarNumeracaoFiscal(tenantId, payload);
  });
