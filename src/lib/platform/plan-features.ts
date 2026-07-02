import type { BillingModel, BillingPlanId } from "@/lib/platform/billing-plans";
import { BILLING_PLANS, getPlanLabel } from "@/lib/platform/billing-plans";

export type PlanFeatureKey =
  | "kds"
  | "delivery_app"
  | "relatorios_avancados"
  | "whatsapp"
  | "fiscal"
  | "unlimited_orders";

export const STARTER_MONTHLY_ORDER_LIMIT = 300;

const PRO_FEATURES: PlanFeatureKey[] = [
  "kds",
  "delivery_app",
  "relatorios_avancados",
  "unlimited_orders",
];

const BUSINESS_FEATURES: PlanFeatureKey[] = [...PRO_FEATURES, "whatsapp", "fiscal"];

const PLAN_FEATURES: Record<BillingPlanId, PlanFeatureKey[]> = {
  starter: [],
  pro: PRO_FEATURES,
  business: BUSINESS_FEATURES,
};

/** Plano efetivo para % sobre vendas (sem tier fixo). */
export const REVENUE_SHARE_EFFECTIVE_PLAN: BillingPlanId = "pro";

const FEATURE_MIN_PLAN: Record<PlanFeatureKey, BillingPlanId> = {
  kds: "pro",
  delivery_app: "pro",
  relatorios_avancados: "pro",
  unlimited_orders: "pro",
  whatsapp: "business",
  fiscal: "business",
};

/** Plano efetivo do restaurante (trial libera todos os recursos por 14 dias). */
export const TRIAL_EFFECTIVE_PLAN: BillingPlanId = "business";

export function getEffectivePlanId(
  billingModel: BillingModel | null | undefined,
  plan: BillingPlanId | null | undefined,
  options?: { inTrial?: boolean },
): BillingPlanId {
  if (options?.inTrial) return TRIAL_EFFECTIVE_PLAN;
  if (billingModel === "revenue_share") return REVENUE_SHARE_EFFECTIVE_PLAN;
  return plan ?? "starter";
}

export function getFeaturesForPlan(planId: BillingPlanId): PlanFeatureKey[] {
  return [...PLAN_FEATURES[planId]];
}

export function hasPlanFeature(planId: BillingPlanId, feature: PlanFeatureKey): boolean {
  return PLAN_FEATURES[planId].includes(feature);
}

export function getRequiredPlanForFeature(feature: PlanFeatureKey): BillingPlanId {
  return FEATURE_MIN_PLAN[feature];
}

export function getPlanUpgradeLabel(feature: PlanFeatureKey): string {
  return getPlanLabel(FEATURE_MIN_PLAN[feature]);
}

export function getFeatureLabel(feature: PlanFeatureKey): string {
  const labels: Record<PlanFeatureKey, string> = {
    kds: "KDS / Gestor delivery",
    delivery_app: "App entregador",
    relatorios_avancados: "Relatórios avançados",
    whatsapp: "WhatsApp atendimento",
    fiscal: "Módulo fiscal NFC-e",
    unlimited_orders: "Pedidos ilimitados",
  };
  return labels[feature];
}

/**
 * Segmento da rota do painel (/t/:slug/...) → feature exigida.
 * `null` = disponível em todos os planos (respeitando papel do usuário).
 */
export function planFeatureForRoute(path: string): PlanFeatureKey | null {
  const clean = path.replace(/^\/+|\/+$/g, "");
  const segment = clean.split("/")[0] ?? "";
  const full = clean;

  if (!segment || segment === "dashboard") return null;
  if (full === "estabelecimento/plano" || full.startsWith("estabelecimento/plano/")) return null;
  if (full === "configuracoes/plano" || full.startsWith("configuracoes/plano/")) return null;

  if (segment === "kds" || segment === "cozinha" || segment === "pedidos") return "kds";
  if (segment === "delivery" || segment === "entregador") return "delivery_app";
  if (segment === "atendimento") return "whatsapp";
  if (segment === "fiscal") return "fiscal";

  if (full.startsWith("relatorios/")) {
    if (full === "relatorios/vendas" || full === "relatorios") return null;
    return "relatorios_avancados";
  }

  return null;
}

export function canAccessRouteForPlan(path: string, planId: BillingPlanId): boolean {
  const feature = planFeatureForRoute(path);
  if (!feature) return true;
  return hasPlanFeature(planId, feature);
}

export function listPlanMarketingFeatures(planId: BillingPlanId): string[] {
  return BILLING_PLANS[planId]?.features ?? [];
}
