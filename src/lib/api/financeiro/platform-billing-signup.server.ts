import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildMercadoPagoWebhookUrl,
  getMercadoPagoAccessToken,
  mercadoPagoRequest,
} from "@/lib/api/financeiro/mercado-pago.server";

export const SIGNUP_VERIFICATION_AMOUNT = 1;
export const SIGNUP_VERIFICATION_REF_PREFIX = "norfood-signup:";

type MercadoPagoPreferenceResponse = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

type MercadoPagoPaymentPayload = {
  id: number | string;
  status?: string | null;
  external_reference?: string | null;
  date_approved?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string | null;
      qr_code_base64?: string | null;
      ticket_url?: string | null;
    } | null;
  } | null;
};

function getApplicationBaseUrl() {
  const configured =
    process.env.PUBLIC_APP_URL?.trim() || process.env.MP_APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "https://norfood.com.br";
}

function checkoutUrlFromPreference(preference: MercadoPagoPreferenceResponse) {
  const url =
    (process.env.MP_ENVIRONMENT ?? "production") === "production"
      ? preference.init_point
      : preference.sandbox_init_point || preference.init_point;
  if (!url) throw new Error("Mercado Pago não retornou URL de checkout.");
  return url;
}

export function buildSignupVerificationExternalReference(tenantId: string) {
  return `${SIGNUP_VERIFICATION_REF_PREFIX}${tenantId}`;
}

export function parseSignupVerificationTenantId(externalReference: string | null | undefined) {
  if (!externalReference?.startsWith(SIGNUP_VERIFICATION_REF_PREFIX)) return null;
  return externalReference.slice(SIGNUP_VERIFICATION_REF_PREFIX.length);
}

async function loadTenantSignupContext(tenantId: string) {
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .select("id, name, slug")
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

  let payerEmail = "financeiro@norfood.com.br";
  let payerName = String(tenant.name);

  if (ownerLink?.user_id) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ownerLink.user_id);
    const email = userData.user?.email;
    if (email && !email.endsWith("@norfood.local")) payerEmail = email;
    payerName =
      (userData.user?.user_metadata?.nome as string | undefined) ??
      userData.user?.user_metadata?.full_name ??
      payerName;
  }

  return { tenant, payer: { email: payerEmail, name: String(payerName) } };
}

export async function createSignupVerificationCheckout(tenantId: string) {
  getMercadoPagoAccessToken();
  const { tenant, payer } = await loadTenantSignupContext(tenantId);
  const returnUrl = `${getApplicationBaseUrl()}/t/${tenant.slug}/estabelecimento/plano?cadastro=validado`;

  const preference = await mercadoPagoRequest<MercadoPagoPreferenceResponse>(
    "/checkout/preferences",
    {
      method: "POST",
      headers: { "X-Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        external_reference: buildSignupVerificationExternalReference(tenantId),
        notification_url: buildMercadoPagoWebhookUrl(),
        statement_descriptor: "NORFOOD",
        auto_return: "approved",
        back_urls: {
          success: returnUrl,
          pending: returnUrl,
          failure: returnUrl,
        },
        payer: { name: payer.name, email: payer.email },
        items: [
          {
            id: `signup-${tenantId}`,
            title: "Validação de cadastro Norfood",
            description: "Cobrança simbólica de R$ 1,00 para validar método de pagamento.",
            quantity: 1,
            unit_price: SIGNUP_VERIFICATION_AMOUNT,
            currency_id: "BRL",
          },
        ],
        metadata: { kind: "signup_verification", tenant_id: tenantId, tenant_slug: tenant.slug },
      }),
    },
  );

  const checkoutUrl = checkoutUrlFromPreference(preference);

  await supabaseAdmin
    .from("tenant_billing")
    .update({
      signup_mp_preference_id: preference.id,
      signup_mp_checkout_url: checkoutUrl,
      payment_status: "pending_verification",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);

  return { tenantId, checkoutUrl, amount: SIGNUP_VERIFICATION_AMOUNT };
}

export async function createSignupVerificationPix(tenantId: string) {
  getMercadoPagoAccessToken();
  const { tenant, payer } = await loadTenantSignupContext(tenantId);

  const payment = await mercadoPagoRequest<MercadoPagoPaymentPayload>("/v1/payments", {
    method: "POST",
    headers: { "X-Idempotency-Key": randomUUID() },
    body: JSON.stringify({
      transaction_amount: SIGNUP_VERIFICATION_AMOUNT,
      description: `Validação cadastro Norfood — ${tenant.name}`,
      payment_method_id: "pix",
      external_reference: buildSignupVerificationExternalReference(tenantId),
      notification_url: buildMercadoPagoWebhookUrl(),
      payer: { email: payer.email, first_name: payer.name.split(" ")[0] ?? payer.name },
      metadata: { kind: "signup_verification", tenant_id: tenantId },
    }),
  });

  const transactionData = payment.point_of_interaction?.transaction_data;

  await supabaseAdmin
    .from("tenant_billing")
    .update({
      signup_mp_payment_id: String(payment.id),
      signup_mp_pix_qr_code: transactionData?.qr_code ?? null,
      signup_mp_pix_qr_base64: transactionData?.qr_code_base64 ?? null,
      payment_status: "pending_verification",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);

  return {
    tenantId,
    paymentId: String(payment.id),
    qrCode: transactionData?.qr_code ?? "",
    qrCodeBase64: transactionData?.qr_code_base64 ?? "",
    amount: SIGNUP_VERIFICATION_AMOUNT,
  };
}

export async function syncSignupVerificationPayment(payment: MercadoPagoPaymentPayload) {
  const tenantId = parseSignupVerificationTenantId(payment.external_reference);
  if (!tenantId) throw new Error("Referência de validação de cadastro inválida.");

  const patch: Record<string, unknown> = {
    signup_mp_payment_id: String(payment.id),
    updated_at: new Date().toISOString(),
  };

  if (payment.status === "approved") {
    patch.signup_payment_verified_at = payment.date_approved ?? new Date().toISOString();
    patch.payment_status = "active";

    await supabaseAdmin.from("tenant_billing").update(patch).eq("tenant_id", tenantId);

    await supabaseAdmin
      .from("tenants")
      .update({ status: "trial", updated_at: new Date().toISOString() })
      .eq("id", tenantId);

    return {
      kind: "signup_verification" as const,
      tenantId,
      paymentId: String(payment.id),
      paymentStatus: payment.status,
      verified: true,
    };
  }

  await supabaseAdmin.from("tenant_billing").update(patch).eq("tenant_id", tenantId);

  return {
    kind: "signup_verification" as const,
    tenantId,
    paymentId: String(payment.id),
    paymentStatus: payment.status ?? "unknown",
    verified: false,
  };
}

export async function markSignupVerifiedIfSkipped(tenantId: string) {
  const skip =
    process.env.SIGNUP_SKIP_PAYMENT_VERIFY === "true" || !process.env.MP_ACCESS_TOKEN;
  if (!skip) return false;

  await supabaseAdmin
    .from("tenant_billing")
    .update({
      signup_payment_verified_at: new Date().toISOString(),
      payment_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);

  return true;
}
