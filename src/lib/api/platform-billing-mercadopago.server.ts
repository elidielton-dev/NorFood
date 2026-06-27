import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildMercadoPagoWebhookUrl,
  fetchMercadoPagoPayment,
  getMercadoPagoAccessToken,
  mercadoPagoRequest,
} from "@/lib/api/mercado-pago.server";
import {
  calculateBillingAmount,
  formatPlanPrice,
  getBillingModelLabel,
  getMonthPeriod,
  getPlanLabel,
  isInTrial,
} from "@/lib/platform/billing-plans";

export const PLATFORM_BILLING_REF_PREFIX = "norfood-billing:";

type MercadoPagoPreferenceResponse = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

type MercadoPagoPaymentPayload = {
  id: number | string;
  status?: string | null;
  external_reference?: string | null;
  transaction_amount?: number | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string | null;
      qr_code_base64?: string | null;
      ticket_url?: string | null;
    } | null;
  } | null;
  date_approved?: string | null;
};

type InvoiceRow = {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  billing_model: string;
  plan: string | null;
  gross_sales: number;
  final_amount: number;
  status: string;
};

function getApplicationBaseUrl() {
  const configured =
    process.env.PUBLIC_APP_URL?.trim() || process.env.MP_APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "https://norfood.com.br";
}

export function buildPlatformBillingExternalReference(invoiceId: string) {
  return `${PLATFORM_BILLING_REF_PREFIX}${invoiceId}`;
}

export function parsePlatformBillingInvoiceId(externalReference: string | null | undefined) {
  if (!externalReference?.startsWith(PLATFORM_BILLING_REF_PREFIX)) return null;
  return externalReference.slice(PLATFORM_BILLING_REF_PREFIX.length);
}

function checkoutUrlFromPreference(preference: MercadoPagoPreferenceResponse) {
  const url =
    (process.env.MP_ENVIRONMENT ?? "production") === "production"
      ? preference.init_point
      : preference.sandbox_init_point || preference.init_point;
  if (!url) throw new Error("Mercado Pago nao retornou URL de checkout.");
  return url;
}

function formatPeriodLabel(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T12:00:00`);
  const end = new Date(`${periodEnd}T12:00:00`);
  const fmt = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" });
  if (periodStart.slice(0, 7) === periodEnd.slice(0, 7)) {
    return fmt.format(start);
  }
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

async function loadInvoice(invoiceId: string) {
  const { data, error } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Fatura nao encontrada.");
  return data as InvoiceRow;
}

async function loadTenantContext(tenantId: string) {
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .select("id, name, slug, status")
    .eq("id", tenantId)
    .single();
  if (tenantError) throw tenantError;

  const { data: ownerLink } = await supabaseAdmin
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  let payerEmail = "financeiro@norfood.local";
  let payerName = String(tenant.name);

  if (ownerLink?.user_id) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ownerLink.user_id);
    payerEmail = userData.user?.email ?? payerEmail;
    payerName =
      (userData.user?.user_metadata?.name as string | undefined) ??
      userData.user?.user_metadata?.full_name ??
      payerName;
  }

  return {
    tenant,
    payer: { email: payerEmail, name: String(payerName) },
  };
}

function assertInvoicePayable(invoice: InvoiceRow) {
  if (invoice.status === "paid") {
    throw new Error("Esta fatura ja foi paga.");
  }
  if (invoice.status === "waived") {
    throw new Error("Esta fatura esta isenta.");
  }
  const amount = Number(invoice.final_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Valor da fatura invalido ou isento.");
  }
}

export async function createPlatformBillingCheckout(invoiceId: string) {
  getMercadoPagoAccessToken();
  const invoice = await loadInvoice(invoiceId);
  assertInvoicePayable(invoice);

  const { tenant, payer } = await loadTenantContext(invoice.tenant_id);
  const amount = Number(invoice.final_amount);
  const periodLabel = formatPeriodLabel(invoice.period_start, invoice.period_end);
  const planLabel =
    invoice.billing_model === "monthly"
      ? getPlanLabel(invoice.plan as "starter" | "pro" | "business" | null)
      : getBillingModelLabel("revenue_share");
  const title = `Norfood ${planLabel} — ${periodLabel}`;

  const returnUrl = `${getApplicationBaseUrl()}/t/${tenant.slug}/estabelecimento/plano?fatura=${invoice.id}`;

  const preference = await mercadoPagoRequest<MercadoPagoPreferenceResponse>(
    "/checkout/preferences",
    {
      method: "POST",
      headers: { "X-Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        external_reference: buildPlatformBillingExternalReference(invoice.id),
        notification_url: buildMercadoPagoWebhookUrl(),
        statement_descriptor: "NORFOOD",
        auto_return: "approved",
        back_urls: {
          success: returnUrl,
          pending: returnUrl,
          failure: returnUrl,
        },
        payer: {
          name: payer.name,
          email: payer.email,
        },
        items: [
          {
            id: invoice.id,
            title,
            description: `Assinatura Norfood — ${tenant.name}`,
            quantity: 1,
            unit_price: amount,
            currency_id: "BRL",
          },
        ],
        metadata: {
          kind: "platform_billing",
          invoice_id: invoice.id,
          tenant_id: invoice.tenant_id,
          tenant_slug: tenant.slug,
        },
      }),
    },
  );

  const checkoutUrl = checkoutUrlFromPreference(preference);

  const { error } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .update({
      mp_preference_id: preference.id,
      mp_checkout_url: checkoutUrl,
      payment_method: "checkout",
      status: invoice.status === "draft" ? "pending" : invoice.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);
  if (error) throw error;

  return { invoiceId: invoice.id, preferenceId: preference.id, checkoutUrl, amount };
}

export async function createPlatformBillingPix(invoiceId: string) {
  getMercadoPagoAccessToken();
  const invoice = await loadInvoice(invoiceId);
  assertInvoicePayable(invoice);

  const { tenant, payer } = await loadTenantContext(invoice.tenant_id);
  const amount = Number(invoice.final_amount);
  const periodLabel = formatPeriodLabel(invoice.period_start, invoice.period_end);
  const description = `Norfood ${tenant.name} — ${periodLabel}`;

  const payment = await mercadoPagoRequest<MercadoPagoPaymentPayload>("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": randomUUID() },
    body: JSON.stringify({
      transaction_amount: Number(amount.toFixed(2)),
      description,
      payment_method_id: "pix",
      external_reference: buildPlatformBillingExternalReference(invoice.id),
      notification_url: buildMercadoPagoWebhookUrl(),
      payer: {
        email: payer.email,
        first_name: payer.name,
      },
      metadata: {
        kind: "platform_billing",
        invoice_id: invoice.id,
        tenant_id: invoice.tenant_id,
      },
    }),
  });

  const transactionData = payment.point_of_interaction?.transaction_data;
  if (!transactionData?.qr_code || !transactionData.qr_code_base64) {
    throw new Error("Mercado Pago nao retornou QR Code Pix.");
  }

  const { error } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .update({
      mp_payment_id: String(payment.id),
      mp_pix_qr_code: transactionData.qr_code,
      mp_pix_qr_base64: transactionData.qr_code_base64,
      payment_method: "pix",
      status: invoice.status === "draft" ? "pending" : invoice.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id);
  if (error) throw error;

  return {
    invoiceId: invoice.id,
    paymentId: String(payment.id),
    amount,
    qrCode: transactionData.qr_code,
    qrCodeBase64: transactionData.qr_code_base64,
    paymentStatus: payment.status ?? "pending",
  };
}

export async function syncPlatformBillingMercadoPagoPayment(
  payment: MercadoPagoPaymentPayload,
) {
  const invoiceId = parsePlatformBillingInvoiceId(payment.external_reference);
  if (!invoiceId) {
    throw new Error("Referencia de fatura invalida.");
  }

  const invoice = await loadInvoice(invoiceId);
  const paymentId = String(payment.id);
  const patch: Record<string, unknown> = {
    mp_payment_id: paymentId,
    updated_at: new Date().toISOString(),
  };

  if (payment.status === "approved") {
    patch.status = "paid";
    patch.paid_at = payment.date_approved ?? new Date().toISOString();

    const { error: invoiceError } = await supabaseAdmin
      .from("tenant_billing_invoices")
      .update(patch)
      .eq("id", invoice.id);
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

    return {
      kind: "platform_billing" as const,
      invoiceId: invoice.id,
      tenantId: invoice.tenant_id,
      paymentId,
      paymentStatus: payment.status,
      invoiceStatus: "paid",
    };
  }

  if (payment.status === "pending" || payment.status === "in_process") {
    patch.status = "pending";
  }

  const { error } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .update(patch)
    .eq("id", invoice.id);
  if (error) throw error;

  return {
    kind: "platform_billing" as const,
    invoiceId: invoice.id,
    tenantId: invoice.tenant_id,
    paymentId,
    paymentStatus: payment.status ?? "unknown",
    invoiceStatus: patch.status ?? invoice.status,
  };
}

export async function ensureCurrentBillingInvoice(tenantId: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const { periodStart, periodEnd } = getMonthPeriod(year, month);

  const { data: existing } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .select("id, status, final_amount")
    .eq("tenant_id", tenantId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: billing } = await supabaseAdmin
    .from("tenant_billing")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!billing) throw new Error("Plano de cobranca nao configurado.");

  const startIso = `${periodStart}T00:00:00.000Z`;
  const endIso = `${periodEnd}T23:59:59.999Z`;
  const { data: orders } = await supabaseAdmin
    .from("pedidos")
    .select("total")
    .eq("tenant_id", tenantId)
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  const gross = (orders ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const trial = isInTrial(billing.trial_ends_at);
  const calc = calculateBillingAmount({
    billingModel: billing.billing_model,
    plan: billing.plan,
    monthlyPrice: billing.monthly_price,
    revenueSharePercent: billing.revenue_share_percent,
    revenueShareMin: billing.revenue_share_min,
    revenueShareCap: billing.revenue_share_cap,
    grossSales: gross,
    inTrial: trial,
  });

  const { data: created, error } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .insert({
      tenant_id: tenantId,
      period_start: periodStart,
      period_end: periodEnd,
      billing_model: billing.billing_model,
      plan: billing.plan,
      gross_sales: gross,
      order_count: orders?.length ?? 0,
      revenue_share_percent:
        billing.billing_model === "revenue_share" ? billing.revenue_share_percent : null,
      calculated_amount: calc.calculated,
      final_amount: calc.final,
      status: trial ? "waived" : calc.final > 0 ? "pending" : "waived",
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(created.id);
}

export async function refreshPlatformBillingPixStatus(invoiceId: string) {
  const { data: row, error } = await supabaseAdmin
    .from("tenant_billing_invoices")
    .select("mp_payment_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw error;
  if (!row?.mp_payment_id) {
    throw new Error("Nenhum pagamento Pix associado a esta fatura.");
  }

  const payment = await fetchMercadoPagoPayment(row.mp_payment_id);
  return syncPlatformBillingMercadoPagoPayment(payment);
}

export function describeInvoiceAmount(amount: number) {
  return formatPlanPrice(amount);
}
