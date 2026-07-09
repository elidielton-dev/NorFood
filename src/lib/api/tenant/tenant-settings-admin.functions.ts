import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth/auth-helpers.server";
import {
  DEFAULT_PAYMENT_METHODS,
  normalizePaymentMethods,
  type PaymentMethodId,
} from "@/lib/payment-methods";
import type { PrinterPanelKey } from "@/lib/painel/painel-configuracoes";
import { getPrinterPanelConfig, printerPanels } from "@/lib/painel/painel-configuracoes";
import {
  DEFAULT_MESAS_SETTINGS,
  parseMesasSettings,
  type MesasSettings,
} from "@/lib/mesas-settings";

export type TenantAppearance = {
  banner_url?: string | null;
  tagline?: string | null;
};

export type PrinterSettings = {
  printerName: string;
  copies: number;
  paper: string;
  autoPrint: boolean;
  cutPaper: boolean;
  showPreview: boolean;
};

export type TenantAdminSettings = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    subtitle: string | null;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
  };
  settings: {
    phone: string | null;
    address: string | null;
    description: string | null;
    delivery_fee_default: number;
    delivery_time_minutes: number;
    pedido_minimo: number;
    loja_aberta: boolean;
    pontos_por_real: number;
    payment_methods: PaymentMethodId[];
    appearance: TenantAppearance;
    printers: Partial<Record<PrinterPanelKey, PrinterSettings>>;
    mesas: MesasSettings;
  };
};

function defaultPrinterSettings(key: PrinterPanelKey): PrinterSettings {
  const panel = getPrinterPanelConfig(key);
  return {
    printerName: panel?.printerName ?? "Impressora",
    copies: panel?.copies ?? 1,
    paper: panel?.paper ?? "80mm",
    autoPrint: panel?.autoPrint ?? false,
    cutPaper: panel?.cutPaper ?? true,
    showPreview: panel?.showPreview ?? false,
  };
}

function parseStoreAppearance(raw: unknown): {
  appearance: TenantAppearance;
  printers: Partial<Record<PrinterPanelKey, PrinterSettings>>;
  mesas: MesasSettings;
} {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const appearance: TenantAppearance = {
    banner_url: typeof obj.banner_url === "string" ? obj.banner_url : null,
    tagline: typeof obj.tagline === "string" ? obj.tagline : null,
  };
  const mesas = parseMesasSettings(obj.mesas);
  const printers: Partial<Record<PrinterPanelKey, PrinterSettings>> = {};
  const printersRaw = obj.printers;
  if (printersRaw && typeof printersRaw === "object") {
    for (const key of ["mesas", "kds", "delivery", "fiscal"] as PrinterPanelKey[]) {
      const row = (printersRaw as Record<string, unknown>)[key];
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const base = defaultPrinterSettings(key);
      printers[key] = {
        printerName: typeof r.printerName === "string" ? r.printerName : base.printerName,
        copies: typeof r.copies === "number" ? r.copies : base.copies,
        paper: typeof r.paper === "string" ? r.paper : base.paper,
        autoPrint: typeof r.autoPrint === "boolean" ? r.autoPrint : base.autoPrint,
        cutPaper: typeof r.cutPaper === "boolean" ? r.cutPaper : base.cutPaper,
        showPreview: typeof r.showPreview === "boolean" ? r.showPreview : base.showPreview,
      };
    }
  }
  return { appearance, printers, mesas };
}

export const fetchTenantAdminSettingsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<TenantAdminSettings> => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [tenantResult, settingsResult, configResult] = await Promise.all([
      supabaseAdmin
        .from("tenants")
        .select("id,name,slug,subtitle,logo_url,primary_color,secondary_color,accent_color")
        .eq("id", tenantId)
        .single(),
      supabaseAdmin.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
      supabaseAdmin
        .from("config_operacional")
        .select("pedido_minimo, loja_aberta, pontos_por_real, valor_padrao_entrega")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);
    if (tenantResult.error) throw tenantResult.error;

    const row = settingsResult.data;
    const configRow = configResult.data;
    const { appearance, printers, mesas } = parseStoreAppearance(row?.store_appearance);

    const fullPrinters = Object.fromEntries(
      printerPanels.map((p) => [p.key, printers[p.key] ?? defaultPrinterSettings(p.key)]),
    ) as Record<PrinterPanelKey, PrinterSettings>;

    return {
      tenant: tenantResult.data as TenantAdminSettings["tenant"],
      settings: {
        phone: row?.phone ?? null,
        address: row?.address ?? null,
        description: row?.description ?? null,
        delivery_fee_default: Number(
          configRow?.valor_padrao_entrega ?? row?.delivery_fee_default ?? 6,
        ),
        delivery_time_minutes: Number(row?.delivery_time_minutes ?? 40),
        pedido_minimo: Number(configRow?.pedido_minimo ?? row?.pedido_minimo ?? 15),
        loja_aberta: configRow?.loja_aberta ?? row?.loja_aberta ?? true,
        pontos_por_real: Number(configRow?.pontos_por_real ?? row?.pontos_por_real ?? 1),
        payment_methods: normalizePaymentMethods(row?.payment_methods),
        appearance,
        printers: fullPrinters,
        mesas,
      },
    };
  });

export const saveTenantProfileServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      tenantSlug: string;
      name: string;
      subtitle?: string | null;
      logo_url?: string | null;
      primary_color: string;
      secondary_color: string;
      accent_color: string;
      phone?: string | null;
      address?: string | null;
      description?: string | null;
      delivery_time_minutes?: number;
      appearance?: TenantAppearance;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current } = await supabaseAdmin
      .from("tenant_settings")
      .select("store_appearance")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const parsed = parseStoreAppearance(current?.store_appearance);
    const appearance = { ...parsed.appearance, ...data.appearance };

    const { error: tenantError } = await supabaseAdmin
      .from("tenants")
      .update({
        name: data.name.trim(),
        subtitle: data.subtitle?.trim() || null,
        logo_url: data.logo_url?.trim() || null,
        primary_color: data.primary_color,
        secondary_color: data.secondary_color,
        accent_color: data.accent_color,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);
    if (tenantError) throw tenantError;

    const { error: settingsError } = await supabaseAdmin.from("tenant_settings").upsert(
      {
        tenant_id: tenantId,
        phone: data.phone?.trim() || null,
        address: data.address?.trim() || null,
        description: data.description?.trim() || null,
        delivery_time_minutes: data.delivery_time_minutes ?? 40,
        store_appearance: { appearance, printers: parsed.printers, mesas: parsed.mesas },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (settingsError) throw settingsError;
    return { ok: true as const };
  });

export const savePaymentMethodsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; payment_methods: PaymentMethodId[] }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const methods = normalizePaymentMethods(data.payment_methods);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tenant_settings").upsert(
      {
        tenant_id: tenantId,
        payment_methods: methods,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) throw error;
    return { ok: true as const, payment_methods: methods };
  });

export const savePrinterSettingsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { tenantSlug: string; panelKey: PrinterPanelKey; settings: PrinterSettings }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current } = await supabaseAdmin
      .from("tenant_settings")
      .select("store_appearance")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const parsed = parseStoreAppearance(current?.store_appearance);
    const printers = { ...parsed.printers, [data.panelKey]: data.settings };

    const { error } = await supabaseAdmin.from("tenant_settings").upsert(
      {
        tenant_id: tenantId,
        store_appearance: {
          appearance: parsed.appearance,
          printers,
          mesas: parsed.mesas,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) throw error;
    return { ok: true as const };
  });

export const saveMesasSettingsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; mesas: MesasSettings }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current } = await supabaseAdmin
      .from("tenant_settings")
      .select("store_appearance")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const parsed = parseStoreAppearance(current?.store_appearance);

    const { error } = await supabaseAdmin.from("tenant_settings").upsert(
      {
        tenant_id: tenantId,
        store_appearance: {
          appearance: parsed.appearance,
          printers: parsed.printers,
          mesas: data.mesas,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) throw error;
    return { ok: true as const };
  });

export { DEFAULT_PAYMENT_METHODS };
export type { MesasSettings };
