import {
  BILLABLE_ORDER_STATUSES,
  getMonthPeriod,
  getPlanLabel,
  isInTrial,
  type BillingModel,
  type BillingPlanId,
} from "@/lib/platform/billing-plans";
import {
  getEffectivePlanId,
  getFeatureLabel,
  getFeaturesForPlan,
  getPlanUpgradeLabel,
  hasPlanFeature,
  STARTER_MONTHLY_ORDER_LIMIT,
  type PlanFeatureKey,
} from "@/lib/platform/plan-features";

export type TenantPlanSnapshot = {
  tenantId: string;
  billingModel: BillingModel;
  planId: BillingPlanId;
  planLabel: string;
  inTrial: boolean;
  features: PlanFeatureKey[];
  monthlyOrderLimit: number | null;
  monthlyOrderCount: number;
  ordersRemaining: number | null;
};

export async function loadTenantPlanSnapshot(tenantId: string): Promise<TenantPlanSnapshot> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: billing, error } = await supabaseAdmin
    .from("tenant_billing")
    .select("billing_model, plan, trial_ends_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;

  const billingModel = (billing?.billing_model as BillingModel | undefined) ?? "monthly";
  const inTrial = isInTrial(billing?.trial_ends_at ?? null);
  const planId = getEffectivePlanId(
    billingModel,
    (billing?.plan as BillingPlanId | null | undefined) ?? null,
    { inTrial },
  );
  const monthlyOrderLimit = hasPlanFeature(planId, "unlimited_orders")
    ? null
    : STARTER_MONTHLY_ORDER_LIMIT;
  const monthlyOrderCount = await countTenantOrdersThisMonth(tenantId);

  return {
    tenantId,
    billingModel,
    planId,
    planLabel: getPlanLabel(planId),
    inTrial,
    features: getFeaturesForPlan(planId),
    monthlyOrderLimit,
    monthlyOrderCount,
    ordersRemaining:
      monthlyOrderLimit == null ? null : Math.max(0, monthlyOrderLimit - monthlyOrderCount),
  };
}

export async function countTenantOrdersThisMonth(tenantId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const { periodStart, periodEnd } = getMonthPeriod(now.getFullYear(), now.getMonth() + 1);
  const startIso = `${periodStart}T00:00:00.000Z`;
  const endIso = `${periodEnd}T23:59:59.999Z`;

  const { count, error } = await supabaseAdmin
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .in("status", [...BILLABLE_ORDER_STATUSES]);

  if (error) throw error;
  return count ?? 0;
}

export async function assertTenantPlanFeature(tenantId: string, feature: PlanFeatureKey) {
  const snapshot = await loadTenantPlanSnapshot(tenantId);
  if (hasPlanFeature(snapshot.planId, feature)) return snapshot;

  throw new Error(
    `${getFeatureLabel(feature)} está disponível no plano ${getPlanUpgradeLabel(feature)}. ` +
      "Acesse Estabelecimento → Plano Norfood para fazer upgrade.",
  );
}

export async function assertCanCreateTenantOrder(tenantId: string) {
  const snapshot = await loadTenantPlanSnapshot(tenantId);
  if (snapshot.monthlyOrderLimit == null) return snapshot;

  if (snapshot.monthlyOrderCount >= snapshot.monthlyOrderLimit) {
    throw new Error(
      `Limite de ${snapshot.monthlyOrderLimit} pedidos/mês do plano Starter atingido (${snapshot.monthlyOrderCount} este mês). ` +
        "Faça upgrade para o plano Pro para pedidos ilimitados.",
    );
  }

  return snapshot;
}

/** Dono, admin e colaboradores do restaurante validam o plano da empresa. */
export async function assertPlanFeatureForStaffUser(userId: string, feature: PlanFeatureKey) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isTenantStaffRole } = await import("@/lib/tenant/tenant-permissions");
  type TenantRole = import("@/lib/tenant/types").TenantRole;

  const { data: memberships, error } = await supabaseAdmin
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const membership = (memberships ?? []).find((row) =>
    isTenantStaffRole(row.role as TenantRole),
  );
  if (!membership?.tenant_id) {
    throw new Error("Sem empresa vinculada para validar o plano.");
  }
  return assertTenantPlanFeature(membership.tenant_id, feature);
}

export async function assertPlanFeatureForTenantStaff(
  userId: string,
  tenantId: string,
  feature: PlanFeatureKey,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isTenantStaffRole } = await import("@/lib/tenant/tenant-permissions");
  type TenantRole = import("@/lib/tenant/types").TenantRole;

  const { data: membership, error } = await supabaseAdmin
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!membership || !isTenantStaffRole(membership.role as TenantRole)) {
    throw new Error("Sem acesso a este restaurante.");
  }
  return assertTenantPlanFeature(tenantId, feature);
}

export async function resolveTenantIdFromProductId(produtoId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("produtos")
    .select("tenant_id")
    .eq("id", produtoId)
    .maybeSingle();
  return data?.tenant_id ?? null;
}
