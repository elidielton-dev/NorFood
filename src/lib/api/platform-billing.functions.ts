import { createServerFn } from "@tanstack/react-start";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanCreateTenant } from "@/lib/platform/platform-limits";
import { isValidTenantSlug, slugifyTenantName } from "@/lib/platform-admin/slug";
import {
  BILLABLE_ORDER_STATUSES,
  addTrialDays,
  calculateBillingAmount,
  getMonthPeriod,
  getPlanPrice,
  isInTrial,
  type BillingModel,
  type BillingPlanId,
} from "@/lib/platform/billing-plans";

export type TenantBillingRow = {
  tenant_id: string;
  billing_model: BillingModel;
  plan: BillingPlanId | null;
  monthly_price: number | null;
  revenue_share_percent: number;
  revenue_share_min: number;
  revenue_share_cap: number;
  trial_ends_at: string | null;
  billing_cycle_day: number;
  payment_status: string;
  accepted_terms_at: string | null;
};

export type AdminBillingTenantRow = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
  owner_email: string | null;
  billing: TenantBillingRow | null;
  period_gross_sales: number;
  period_order_count: number;
  period_amount_due: number;
  in_trial: boolean;
};

export type BillingInvoiceRow = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  period_start: string;
  period_end: string;
  billing_model: BillingModel;
  plan: BillingPlanId | null;
  gross_sales: number;
  order_count: number;
  revenue_share_percent: number | null;
  calculated_amount: number;
  final_amount: number;
  status: string;
  mp_payment_id?: string | null;
  mp_preference_id?: string | null;
  mp_checkout_url?: string | null;
  mp_pix_qr_code?: string | null;
  mp_pix_qr_base64?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
};

export type RegisterRestaurantPayload = {
  restaurantName: string;
  slug: string;
  billingModel: BillingModel;
  plan?: BillingPlanId;
  acceptedTerms: boolean;
};

export type UpsertTenantBillingPayload = {
  tenantId: string;
  billingModel: BillingModel;
  plan?: BillingPlanId | null;
  paymentStatus?: string;
  notes?: string | null;
};

function isDemoBackend() {
  return (
    process.env.VITE_DEMO_MODE === "true" ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function assertBillingBackend() {
  if (isDemoBackend()) {
    throw new Error(
      "Faturamento indisponível: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.",
    );
  }
}

function formatUnknownError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

function throwSupabaseError(error: unknown, fallback: string): never {
  throw new Error(formatUnknownError(error, fallback));
}

async function sumTenantSales(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const startIso = `${periodStart}T00:00:00.000Z`;
  const endIso = `${periodEnd}T23:59:59.999Z`;

  const { data, error } = await supabaseAdmin
    .from("pedidos")
    .select("total, status, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .in("status", [...BILLABLE_ORDER_STATUSES]);

  if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");

  const rows = data ?? [];
  const gross = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  return { gross, orderCount: rows.length };
}

async function loadOwnerEmail(tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!data?.user_id) return null;
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
  return userData.user?.email ?? null;
}

export async function loadAdminBillingRows(
  year: number,
  month: number,
): Promise<AdminBillingTenantRow[]> {
  assertBillingBackend();
  const { periodStart, periodEnd } = getMonthPeriod(year, month);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tenants, error } = await supabaseAdmin
    .from("tenants")
    .select("id, name, slug, status")
    .order("name");
  if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");

  const rows: AdminBillingTenantRow[] = [];

  for (const tenant of tenants ?? []) {
    const tenantId = String(tenant.id);
    const { data: billing } = await supabaseAdmin
      .from("tenant_billing")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const sales = await sumTenantSales(tenantId, periodStart, periodEnd);
    const billingRow = billing as TenantBillingRow | null;
    const trial = isInTrial(billingRow?.trial_ends_at);

    let amountDue = 0;
    if (billingRow) {
      amountDue = calculateBillingAmount({
        billingModel: billingRow.billing_model,
        plan: billingRow.plan,
        monthlyPrice: billingRow.monthly_price,
        revenueSharePercent: billingRow.revenue_share_percent,
        revenueShareMin: billingRow.revenue_share_min,
        revenueShareCap: billingRow.revenue_share_cap,
        grossSales: sales.gross,
        inTrial: trial,
      }).final;
    }

    rows.push({
      tenant_id: tenantId,
      tenant_name: String(tenant.name),
      tenant_slug: String(tenant.slug),
      tenant_status: String(tenant.status),
      owner_email: await loadOwnerEmail(tenantId),
      billing: billingRow,
      period_gross_sales: sales.gross,
      period_order_count: sales.orderCount,
      period_amount_due: amountDue,
      in_trial: trial,
    });
  }

  return rows;
}

export function computeBillingSummary(rows: AdminBillingTenantRow[]) {
  const mrr = rows
    .filter((r) => r.billing?.billing_model === "monthly" && !r.in_trial)
    .reduce((sum, r) => sum + Number(r.billing?.monthly_price ?? 0), 0);
  const revenueShareDue = rows
    .filter((r) => r.billing?.billing_model === "revenue_share" && !r.in_trial)
    .reduce((sum, r) => sum + r.period_amount_due, 0);
  const totalDue = rows.reduce((sum, r) => sum + r.period_amount_due, 0);
  const inTrial = rows.filter((r) => r.in_trial).length;
  const withoutBilling = rows.filter((r) => !r.billing).length;

  return {
    tenantCount: rows.length,
    mrr,
    revenueShareDue,
    totalDue,
    inTrial,
    withoutBilling,
  };
}

export async function loadBillingInvoicesForPeriod(
  year: number,
  month: number,
): Promise<BillingInvoiceRow[]> {
  assertBillingBackend();
  const { periodStart, periodEnd } = getMonthPeriod(year, month);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: invoices, error } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .select("*")
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .order("final_amount", { ascending: false });
  if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");

  const tenantIds = [...new Set((invoices ?? []).map((i) => String(i.tenant_id)))];
  const { data: tenants } = await supabaseAdmin
    .from("tenants")
    .select("id, name, slug")
    .in("id", tenantIds.length ? tenantIds : ["00000000-0000-0000-0000-000000000000"]);

  const tenantMap = new Map((tenants ?? []).map((t) => [String(t.id), t]));

  return (invoices ?? []).map((inv) => {
    const tenant = tenantMap.get(String(inv.tenant_id));
    return {
      id: String(inv.id),
      tenant_id: String(inv.tenant_id),
      tenant_name: String(tenant?.name ?? "—"),
      tenant_slug: String(tenant?.slug ?? "—"),
      period_start: String(inv.period_start),
      period_end: String(inv.period_end),
      billing_model: inv.billing_model as BillingModel,
      plan: (inv.plan as BillingPlanId | null) ?? null,
      gross_sales: Number(inv.gross_sales),
      order_count: Number(inv.order_count),
      revenue_share_percent:
        inv.revenue_share_percent != null ? Number(inv.revenue_share_percent) : null,
      calculated_amount: Number(inv.calculated_amount),
      final_amount: Number(inv.final_amount),
      status: String(inv.status),
      mp_payment_id: (inv.mp_payment_id as string | null) ?? null,
      mp_preference_id: (inv.mp_preference_id as string | null) ?? null,
      mp_checkout_url: (inv.mp_checkout_url as string | null) ?? null,
      mp_pix_qr_code: (inv.mp_pix_qr_code as string | null) ?? null,
      mp_pix_qr_base64: (inv.mp_pix_qr_base64 as string | null) ?? null,
      payment_method: (inv.payment_method as string | null) ?? null,
      paid_at: (inv.paid_at as string | null) ?? null,
    };
  });
}

export async function generateBillingInvoicesForPeriod(
  year: number,
  month: number,
  markPending = true,
): Promise<{
  created: number;
  updated: number;
  waived: number;
  pending: number;
  skippedNoBilling: number;
}> {
  assertBillingBackend();
  const { periodStart, periodEnd } = getMonthPeriod(year, month);
  const rows = await loadAdminBillingRows(year, month);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let created = 0;
  let updated = 0;
  let waived = 0;
  let pending = 0;
  let skippedNoBilling = 0;

  for (const row of rows) {
    if (!row.billing) {
      skippedNoBilling += 1;
      continue;
    }

    const calc = calculateBillingAmount({
      billingModel: row.billing.billing_model,
      plan: row.billing.plan,
      monthlyPrice: row.billing.monthly_price,
      revenueSharePercent: row.billing.revenue_share_percent,
      revenueShareMin: row.billing.revenue_share_min,
      revenueShareCap: row.billing.revenue_share_cap,
      grossSales: row.period_gross_sales,
      inTrial: row.in_trial,
    });

    const status = row.in_trial ? "waived" : markPending ? "pending" : "draft";
    if (status === "waived") waived += 1;
    if (status === "pending") pending += 1;

    const payload = {
      tenant_id: row.tenant_id,
      period_start: periodStart,
      period_end: periodEnd,
      billing_model: row.billing.billing_model,
      plan: row.billing.plan,
      gross_sales: row.period_gross_sales,
      order_count: row.period_order_count,
      revenue_share_percent:
        row.billing.billing_model === "revenue_share" ? row.billing.revenue_share_percent : null,
      calculated_amount: calc.calculated,
      final_amount: calc.final,
      status,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabaseAdmin
      .from("tenant_billing_invoices")
      .select("id, status")
      .eq("tenant_id", row.tenant_id)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle();

    if (existing?.id) {
      if (existing.status === "paid") continue;
      const { error } = await supabaseAdmin
        .from("tenant_billing_invoices")
        .update(payload)
        .eq("id", existing.id);
      if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");
      updated += 1;
    } else {
      const { error } = await supabaseAdmin.from("tenant_billing_invoices").insert(payload);
      if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");
      created += 1;
    }
  }

  return { created, updated, waived, pending, skippedNoBilling };
}

export async function upsertTenantBillingRecord(
  tenantId: string,
  input: {
    billingModel: BillingModel;
    plan?: BillingPlanId | null;
    trialEndsAt?: string | null;
    acceptedTermsAt?: string | null;
  },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    billing_model: input.billingModel,
    trial_ends_at: input.trialEndsAt ?? addTrialDays(),
    accepted_terms_at: input.acceptedTermsAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (input.billingModel === "monthly") {
    if (!input.plan) throw new Error("Plano mensal é obrigatório.");
    row.plan = input.plan;
    row.monthly_price = getPlanPrice(input.plan);
  } else {
    row.plan = null;
    row.monthly_price = null;
  }

  const { error } = await supabaseAdmin.from("tenant_billing").upsert(row, {
    onConflict: "tenant_id",
  });
  if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");
}

export async function markBillingInvoicePaid(
  invoiceId: string,
  options?: { paymentMethod?: string; paidAt?: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const paidAt = options?.paidAt ?? new Date().toISOString();

  const { data: invoice, error: loadError } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .select("id, tenant_id, status")
    .eq("id", invoiceId)
    .single();
  if (loadError || !invoice) throw new Error("Fatura não encontrada.");

  const { error: invoiceError } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .update({
      status: "paid",
      paid_at: paidAt,
      payment_method: options?.paymentMethod ?? "manual",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);
  if (invoiceError) throw invoiceError;

  await supabaseAdmin
    .from("tenant_billing")
    .update({
      payment_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", invoice.tenant_id);

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("status")
    .eq("id", invoice.tenant_id)
    .maybeSingle();
  if (tenant?.status === "suspended") {
    await supabaseAdmin
      .from("tenants")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", invoice.tenant_id);
  }
}

export const registerRestaurantServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((payload: RegisterRestaurantPayload) => payload)
  .handler(async ({ data, context }) => {
    if (isDemoBackend()) {
      throw new Error("Cadastro de restaurante disponível apenas com Supabase configurado.");
    }
    if (!data.acceptedTerms) {
      throw new Error("Aceite os termos de uso para continuar.");
    }

    const slug = data.slug.trim().toLowerCase();
    if (!isValidTenantSlug(slug)) {
      throw new Error("Slug inválido. Use letras minúsculas, números e hífens.");
    }
    if (data.billingModel === "monthly" && !data.plan) {
      throw new Error("Selecione um plano mensal.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existingSlug } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existingSlug) throw new Error("Este endereço da loja já está em uso. Escolha outro slug.");

    const { data: existingOwner } = await supabaseAdmin
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", context.userId)
      .eq("role", "owner")
      .eq("status", "active")
      .maybeSingle();
    if (existingOwner) {
      throw new Error("Você já possui um restaurante cadastrado. Acesse o painel.");
    }

    const { count: tenantCount, error: countError } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;
    assertCanCreateTenant(tenantCount ?? 0);

    const tenantId = crypto.randomUUID();
    const name = data.restaurantName.trim();

    const { error: tenantError } = await supabaseAdmin.from("tenants").insert({
      id: tenantId,
      name,
      slug,
      subtitle: "Delivery e retirada",
      primary_color: "#FF9100",
      secondary_color: "#111111",
      accent_color: "#FF5A00",
      status: "trial",
      timezone: "America/Sao_Paulo",
      currency: "BRL",
    });
    if (tenantError) throw tenantError;

    const { error: settingsError } = await supabaseAdmin
      .from("tenant_settings")
      .insert({ tenant_id: tenantId });
    if (settingsError) throw settingsError;

    await supabaseAdmin.from("profiles").upsert({
      id: context.userId,
      updated_at: new Date().toISOString(),
    });

    const { error: linkError } = await supabaseAdmin.from("tenant_users").upsert(
      {
        tenant_id: tenantId,
        user_id: context.userId,
        role: "owner",
        status: "active",
      },
      { onConflict: "tenant_id,user_id,role" },
    );
    if (linkError) throw linkError;

    await upsertTenantBillingRecord(tenantId, {
      billingModel: data.billingModel,
      plan: data.plan ?? null,
    });

    return { tenantId, slug, name };
  });

export const suggestRestaurantSlugServer = createServerFn({ method: "GET" })
  .validator((name: string) => name)
  .handler(async ({ data: name }): Promise<string> => {
    const base = slugifyTenantName(name) || "restaurante";
    if (isDemoBackend()) return base;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let candidate = base;
    let suffix = 0;
    while (suffix < 20) {
      const { data: row } = await supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!row) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return `${base}-${Date.now().toString(36).slice(-4)}`;
  });

export const listAdminBillingServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .validator((input: { year?: number; month?: number } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<AdminBillingTenantRow[]> => {
    const now = new Date();
    return loadAdminBillingRows(
      data.year ?? now.getFullYear(),
      data.month ?? now.getMonth() + 1,
    );
  });

export const generateBillingInvoicesServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((input: { year: number; month: number; markPending?: boolean }) => input)
  .handler(async ({ data }): Promise<{
    created: number;
    updated: number;
    waived: number;
    pending: number;
    skippedNoBilling: number;
  }> => {
    return generateBillingInvoicesForPeriod(data.year, data.month, data.markPending ?? true);
  });

export const listBillingInvoicesServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .validator((input: { year?: number; month?: number } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<BillingInvoiceRow[]> => {
    const now = new Date();
    return loadBillingInvoicesForPeriod(
      data.year ?? now.getFullYear(),
      data.month ?? now.getMonth() + 1,
    );
  });

export const updateBillingInvoiceStatusServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((input: { invoiceId: string; status: string }) => input)
  .handler(async ({ data }) => {
    if (isDemoBackend()) throw new Error("Indisponível no modo demo.");
    if (data.status === "paid") {
      await markBillingInvoicePaid(data.invoiceId, { paymentMethod: "manual" });
      return { ok: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenant_billing_invoices")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.invoiceId);
    if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");
    return { ok: true };
  });

export const upsertTenantBillingAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((payload: UpsertTenantBillingPayload) => payload)
  .handler(async ({ data }) => {
    if (isDemoBackend()) throw new Error("Indisponível no modo demo.");
    await upsertTenantBillingRecord(data.tenantId, {
      billingModel: data.billingModel,
      plan: data.plan ?? null,
    });

    if (data.paymentStatus || data.notes != null) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.paymentStatus) patch.payment_status = data.paymentStatus;
      if (data.notes != null) patch.notes = data.notes;
      const { error } = await supabaseAdmin
        .from("tenant_billing")
        .update(patch)
        .eq("tenant_id", data.tenantId);
      if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");
    }

    return { ok: true };
  });

export const getBillingSummaryServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .validator((input: { year?: number; month?: number } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const now = new Date();
    const rows = await loadAdminBillingRows(
      data.year ?? now.getFullYear(),
      data.month ?? now.getMonth() + 1,
    );
    return computeBillingSummary(rows);
  });

async function assertUserCanManageTenant(userId: string, tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenant_users")
    .select("role, status")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");
  const managerRoles = new Set(["owner", "admin", "gerente", "financeiro"]);
  if (!data || data.status !== "active" || !managerRoles.has(data.role)) {
    throw new Error("Sem permissao para gerenciar cobranca deste restaurante.");
  }
}

async function resolveTenantIdBySlug(slug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throwSupabaseError(error, "Erro ao somar vendas do restaurante.");
  if (!data?.id) throw new Error("Restaurante nao encontrado.");
  return String(data.id);
}

export type TenantBillingOverview = {
  billing: TenantBillingRow | null;
  in_trial: boolean;
  current_invoice: BillingInvoiceRow | null;
  recent_invoices: BillingInvoiceRow[];
  mercado_pago_enabled: boolean;
};

export const getTenantBillingOverviewServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ data: tenantSlug, context }): Promise<TenantBillingOverview> => {
    if (isDemoBackend()) {
      return {
        billing: null,
        in_trial: true,
        current_invoice: null,
        recent_invoices: [],
        mercado_pago_enabled: false,
      };
    }

    const tenantId = await resolveTenantIdBySlug(tenantSlug);
    await assertUserCanManageTenant(context.userId, tenantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date();
    const { periodStart, periodEnd } = getMonthPeriod(now.getFullYear(), now.getMonth() + 1);

    const { data: billing } = await supabaseAdmin
      .from("tenant_billing")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const { data: invoices } = await supabaseAdmin
      .from("tenant_billing_invoices")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("period_start", { ascending: false })
      .limit(6);

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("name, slug")
      .eq("id", tenantId)
      .single();

    const mapInvoice = (inv: Record<string, unknown>): BillingInvoiceRow => ({
      id: String(inv.id),
      tenant_id: tenantId,
      tenant_name: String(tenant?.name ?? "—"),
      tenant_slug: String(tenant?.slug ?? tenantSlug),
      period_start: String(inv.period_start),
      period_end: String(inv.period_end),
      billing_model: inv.billing_model as BillingModel,
      plan: (inv.plan as BillingPlanId | null) ?? null,
      gross_sales: Number(inv.gross_sales),
      order_count: Number(inv.order_count),
      revenue_share_percent:
        inv.revenue_share_percent != null ? Number(inv.revenue_share_percent) : null,
      calculated_amount: Number(inv.calculated_amount),
      final_amount: Number(inv.final_amount),
      status: String(inv.status),
      mp_payment_id: (inv.mp_payment_id as string | null) ?? null,
      mp_preference_id: (inv.mp_preference_id as string | null) ?? null,
      mp_checkout_url: (inv.mp_checkout_url as string | null) ?? null,
      mp_pix_qr_code: (inv.mp_pix_qr_code as string | null) ?? null,
      mp_pix_qr_base64: (inv.mp_pix_qr_base64 as string | null) ?? null,
      payment_method: (inv.payment_method as string | null) ?? null,
      paid_at: (inv.paid_at as string | null) ?? null,
    });

    const mapped = (invoices ?? []).map((inv) => mapInvoice(inv as Record<string, unknown>));
    const current =
      mapped.find((inv) => inv.period_start === periodStart && inv.period_end === periodEnd) ??
      null;

    return {
      billing: (billing as TenantBillingRow | null) ?? null,
      in_trial: isInTrial(billing?.trial_ends_at),
      current_invoice: current,
      recent_invoices: mapped,
      mercado_pago_enabled: Boolean(process.env.MP_ACCESS_TOKEN),
    };
  });

export const payBillingInvoiceCheckoutServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; invoiceId?: string }) => input)
  .handler(async ({ data, context }) => {
    if (isDemoBackend()) throw new Error("Indisponível no modo demo.");
    const tenantId = await resolveTenantIdBySlug(data.tenantSlug);
    await assertUserCanManageTenant(context.userId, tenantId);

    const {
      ensureCurrentBillingInvoice,
      createPlatformBillingCheckout,
    } = await import("@/lib/api/platform-billing-mercadopago.server");

    const invoiceId =
      data.invoiceId ?? (await ensureCurrentBillingInvoice(tenantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invoice } = await supabaseAdmin
      .from("tenant_billing_invoices")
      .select("tenant_id")
      .eq("id", invoiceId)
      .single();
    if (String(invoice.tenant_id) !== tenantId) {
      throw new Error("Fatura nao pertence a este restaurante.");
    }

    return createPlatformBillingCheckout(invoiceId);
  });

export const payBillingInvoicePixServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; invoiceId?: string }) => input)
  .handler(async ({ data, context }) => {
    if (isDemoBackend()) throw new Error("Indisponível no modo demo.");
    const tenantId = await resolveTenantIdBySlug(data.tenantSlug);
    await assertUserCanManageTenant(context.userId, tenantId);

    const {
      ensureCurrentBillingInvoice,
      createPlatformBillingPix,
    } = await import("@/lib/api/platform-billing-mercadopago.server");

    const invoiceId =
      data.invoiceId ?? (await ensureCurrentBillingInvoice(tenantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invoice } = await supabaseAdmin
      .from("tenant_billing_invoices")
      .select("tenant_id")
      .eq("id", invoiceId)
      .single();
    if (String(invoice.tenant_id) !== tenantId) {
      throw new Error("Fatura nao pertence a este restaurante.");
    }

    return createPlatformBillingPix(invoiceId);
  });

export const refreshBillingInvoicePixServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; invoiceId: string }) => input)
  .handler(async ({ data, context }) => {
    if (isDemoBackend()) throw new Error("Indisponível no modo demo.");
    const tenantId = await resolveTenantIdBySlug(data.tenantSlug);
    await assertUserCanManageTenant(context.userId, tenantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invoice } = await supabaseAdmin
      .from("tenant_billing_invoices")
      .select("tenant_id")
      .eq("id", data.invoiceId)
      .single();
    if (String(invoice.tenant_id) !== tenantId) {
      throw new Error("Fatura nao pertence a este restaurante.");
    }
    const { refreshPlatformBillingPixStatus } =
      await import("@/lib/api/platform-billing-mercadopago.server");
    return refreshPlatformBillingPixStatus(data.invoiceId);
  });

export const adminPayBillingInvoiceCheckoutServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((input: { invoiceId: string }) => input)
  .handler(async ({ data }) => {
    if (isDemoBackend()) throw new Error("Indisponível no modo demo.");
    const { createPlatformBillingCheckout } =
      await import("@/lib/api/platform-billing-mercadopago.server");
    return createPlatformBillingCheckout(data.invoiceId);
  });

export const adminPayBillingInvoicePixServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((input: { invoiceId: string }) => input)
  .handler(async ({ data }) => {
    if (isDemoBackend()) throw new Error("Indisponível no modo demo.");
    const { createPlatformBillingPix } =
      await import("@/lib/api/platform-billing-mercadopago.server");
    return createPlatformBillingPix(data.invoiceId);
  });
