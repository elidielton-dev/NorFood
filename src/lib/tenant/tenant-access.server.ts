import { isInTrial } from "@/lib/platform/billing-plans";

export type TenantAccessReason =
  | "ok"
  | "suspended"
  | "pending_verification"
  | "trial_expired"
  | "overdue";

export type TenantAccessStatus = {
  allowed: boolean;
  reason: TenantAccessReason;
  message: string;
  canAccessBillingPage: boolean;
  inTrial: boolean;
  signupVerified: boolean;
};

type TenantRow = {
  id: string;
  status: string;
  slug: string;
};

type BillingRow = {
  trial_ends_at: string | null;
  payment_status: string;
  signup_payment_verified_at: string | null;
} | null;

export function evaluateTenantAccess(
  tenant: TenantRow,
  billing: BillingRow,
  options?: { skipSignupVerification?: boolean },
): TenantAccessStatus {
  const inTrial = isInTrial(billing?.trial_ends_at);
  const signupVerified = Boolean(
    billing?.signup_payment_verified_at || options?.skipSignupVerification,
  );
  const canAccessBillingPage = true;

  if (tenant.status === "suspended") {
    return {
      allowed: false,
      reason: "suspended",
      message: "Restaurante suspenso. Regularize o plano em Estabelecimento → Plano.",
      canAccessBillingPage,
      inTrial,
      signupVerified,
    };
  }

  if (billing?.payment_status === "pending_verification" && !signupVerified) {
    return {
      allowed: false,
      reason: "pending_verification",
      message: "Valide seu método de pagamento (R$ 1,00) para ativar o restaurante.",
      canAccessBillingPage,
      inTrial,
      signupVerified,
    };
  }

  if (!inTrial && billing?.payment_status === "overdue") {
    return {
      allowed: false,
      reason: "overdue",
      message: "Plano em atraso. Pague a fatura em Estabelecimento → Plano para continuar.",
      canAccessBillingPage,
      inTrial,
      signupVerified,
    };
  }

  if (!inTrial && billing?.trial_ends_at) {
    return {
      allowed: false,
      reason: "trial_expired",
      message: "Seu trial de 14 dias encerrou. Assine o plano para continuar.",
      canAccessBillingPage,
      inTrial,
      signupVerified,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    message: "",
    canAccessBillingPage,
    inTrial,
    signupVerified,
  };
}

export async function loadTenantAccessBySlug(slug: string): Promise<TenantAccessStatus | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .select("id, status, slug")
    .eq("slug", slug)
    .maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant) return null;

  const { data: billing } = await supabaseAdmin
    .from("tenant_billing")
    .select("trial_ends_at, payment_status, signup_payment_verified_at")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  const skipSignupVerification =
    process.env.SIGNUP_SKIP_PAYMENT_VERIFY === "true" || !process.env.MP_ACCESS_TOKEN;

  return evaluateTenantAccess(tenant, billing, { skipSignupVerification });
}

export async function assertTenantOperationalBySlug(slug: string) {
  const access = await loadTenantAccessBySlug(slug);
  if (!access) throw new Error("Restaurante não encontrado.");
  if (!access.allowed) throw new Error(access.message);
  return access;
}

export async function assertTenantOperationalById(tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tenant, error } = await supabaseAdmin
    .from("tenants")
    .select("id, status, slug")
    .eq("id", tenantId)
    .single();
  if (error) throw error;

  const { data: billing } = await supabaseAdmin
    .from("tenant_billing")
    .select("trial_ends_at, payment_status, signup_payment_verified_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const skipSignupVerification =
    process.env.SIGNUP_SKIP_PAYMENT_VERIFY === "true" || !process.env.MP_ACCESS_TOKEN;

  const access = evaluateTenantAccess(tenant, billing, { skipSignupVerification });
  if (!access.allowed) throw new Error(access.message);
  return access;
}

/** Suspende tenants com trial expirado e fatura em aberto. */
export async function enforceExpiredTrialSuspensions() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();

  const { data: billings, error } = await supabaseAdmin
    .from("tenant_billing")
    .select("tenant_id, trial_ends_at, payment_status, signup_payment_verified_at")
    .lt("trial_ends_at", now)
    .neq("payment_status", "active");
  if (error) throw error;

  let suspended = 0;
  let markedOverdue = 0;

  for (const billing of billings ?? []) {
    if (isInTrial(billing.trial_ends_at)) continue;

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, status")
      .eq("id", billing.tenant_id)
      .maybeSingle();
    if (!tenant || tenant.status === "suspended") continue;

    const { data: paidInvoice } = await supabaseAdmin
      .from("tenant_billing_invoices")
      .select("id")
      .eq("tenant_id", billing.tenant_id)
      .eq("status", "paid")
      .limit(1)
      .maybeSingle();

    const needsPayment = !paidInvoice && !billing.signup_payment_verified_at;

    if (needsPayment || billing.payment_status === "overdue") {
      await supabaseAdmin
        .from("tenant_billing")
        .update({ payment_status: "overdue", updated_at: now })
        .eq("tenant_id", billing.tenant_id);
      markedOverdue += 1;

      await supabaseAdmin
        .from("tenants")
        .update({ status: "suspended", updated_at: now })
        .eq("id", billing.tenant_id);
      suspended += 1;
    }
  }

  return { suspended, markedOverdue };
}
