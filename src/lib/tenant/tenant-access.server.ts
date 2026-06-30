import { isInTrial } from "@/lib/platform/billing-plans";

export type TenantAccessReason =
  | "ok"
  | "suspended"
  | "pending_approval"
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
  suspensionKind?: "admin" | "billing" | null;
  tenantName?: string | null;
  tenantSlug?: string | null;
};

type TenantRow = {
  id: string;
  name?: string | null;
  status: string;
  slug: string;
  rejection_reason?: string | null;
};

type BillingRow = {
  trial_ends_at: string | null;
  payment_status: string;
  signup_payment_verified_at: string | null;
} | null;

export function evaluateTenantAccess(tenant: TenantRow, billing: BillingRow): TenantAccessStatus {
  const inTrial = isInTrial(billing?.trial_ends_at);
  const signupVerified = true;
  const canAccessBillingPage = tenant.status !== "pending";

  if (tenant.status === "pending") {
    return {
      allowed: false,
      reason: "pending_approval",
      message:
        "Seu cadastro está em análise. Em algumas horas você receberá e-mail e WhatsApp quando o acesso for liberado.",
      canAccessBillingPage: false,
      inTrial,
      signupVerified,
      suspensionKind: null,
      tenantName: tenant.name ?? null,
      tenantSlug: tenant.slug,
    };
  }

  if (tenant.status === "suspended") {
    const isAdmin = Boolean(tenant.rejection_reason?.trim());
    const message =
      tenant.rejection_reason?.trim() ||
      "Conta suspensa por pendência de plano ou pagamento. Regularize em Estabelecimento → Plano ou fale com suporte@norfood.com.br.";
    return {
      allowed: false,
      reason: "suspended",
      message,
      canAccessBillingPage,
      inTrial,
      signupVerified,
      suspensionKind: isAdmin ? "admin" : "billing",
      tenantName: tenant.name ?? null,
      tenantSlug: tenant.slug,
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
      suspensionKind: "billing",
      tenantName: tenant.name ?? null,
      tenantSlug: tenant.slug,
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
      suspensionKind: "billing",
      tenantName: tenant.name ?? null,
      tenantSlug: tenant.slug,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    message: "",
    canAccessBillingPage,
    inTrial,
    signupVerified,
    suspensionKind: null,
    tenantName: tenant.name ?? null,
    tenantSlug: tenant.slug,
  };
}

export async function loadTenantAccessBySlug(slug: string): Promise<TenantAccessStatus | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .select("id, name, status, slug, rejection_reason")
    .eq("slug", slug)
    .maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant) return null;

  const { data: billing } = await supabaseAdmin
    .from("tenant_billing")
    .select("trial_ends_at, payment_status, signup_payment_verified_at")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  return evaluateTenantAccess(tenant, billing);
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
    .select("id, name, status, slug, rejection_reason")
    .eq("id", tenantId)
    .single();
  if (error) throw error;

  const { data: billing } = await supabaseAdmin
    .from("tenant_billing")
    .select("trial_ends_at, payment_status, signup_payment_verified_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const access = evaluateTenantAccess(tenant, billing);
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

    const needsPayment = !paidInvoice;

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
