export type BillingModel = "monthly" | "revenue_share";

export type BillingPlanId = "starter" | "pro" | "business";

export type BillingPlanDefinition = {
  id: BillingPlanId;
  name: string;
  price: number;
  description: string;
  features: string[];
  highlighted?: boolean;
};

export const TRIAL_DAYS = 14;

export const REVENUE_SHARE_CONFIG = {
  percent: 2,
  minMonthly: 49,
  capMonthly: 497,
  description: "2% sobre pedidos feitos pelo Norfood (mín. R$ 49, máx. R$ 497/mês)",
} as const;

export const BILLING_PLANS: Record<BillingPlanId, BillingPlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    price: 79.9,
    description: "Ideal para começar com delivery digital.",
    features: [
      "Loja online + painel",
      "Pedidos delivery e balcão",
      "Até 300 pedidos/mês",
      "Suporte por e-mail",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 149.9,
    description: "Operação completa com entregador e KDS.",
    highlighted: true,
    features: [
      "Tudo do Starter",
      "App entregador + GPS",
      "KDS cozinha",
      "Relatórios avançados",
      "Pedidos ilimitados",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    price: 219.9,
    description: "WhatsApp, fiscal e suporte prioritário.",
    features: [
      "Tudo do Pro",
      "WhatsApp atendimento",
      "Módulo fiscal NFC-e",
      "Suporte prioritário",
      "Onboarding assistido",
    ],
  },
};

export const BILLING_PLAN_LIST = Object.values(BILLING_PLANS);

export function formatPlanPrice(price: number) {
  return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function getPlanPrice(planId: BillingPlanId) {
  return BILLING_PLANS[planId].price;
}

export function getPlanLabel(planId: BillingPlanId | null | undefined) {
  if (!planId) return "—";
  return BILLING_PLANS[planId]?.name ?? planId;
}

export function getBillingModelLabel(model: BillingModel) {
  return model === "monthly" ? "Mensalidade" : "2% sobre vendas";
}

export type BillingCalculationInput = {
  billingModel: BillingModel;
  plan?: BillingPlanId | null;
  monthlyPrice?: number | null;
  revenueSharePercent?: number;
  revenueShareMin?: number;
  revenueShareCap?: number;
  grossSales?: number;
  inTrial?: boolean;
};

export function calculateBillingAmount(input: BillingCalculationInput) {
  if (input.inTrial) {
    return { calculated: 0, final: 0, breakdown: "Período trial — isento" };
  }

  if (input.billingModel === "monthly") {
    const amount = Number(input.monthlyPrice ?? 0);
    return {
      calculated: amount,
      final: amount,
      breakdown: `Mensalidade ${formatPlanPrice(amount)}`,
    };
  }

  const percent = input.revenueSharePercent ?? REVENUE_SHARE_CONFIG.percent;
  const min = input.revenueShareMin ?? REVENUE_SHARE_CONFIG.minMonthly;
  const cap = input.revenueShareCap ?? REVENUE_SHARE_CONFIG.capMonthly;
  const gross = Number(input.grossSales ?? 0);
  const calculated = Math.round(gross * (percent / 100) * 100) / 100;
  const withMin = Math.max(calculated, min);
  const final = Math.min(withMin, cap);

  let breakdown = `${percent}% de ${formatPlanPrice(gross)} = ${formatPlanPrice(calculated)}`;
  if (final !== calculated) {
    if (withMin === min && calculated < min) breakdown += ` (mín. ${formatPlanPrice(min)})`;
    if (final === cap && withMin > cap) breakdown += ` (teto ${formatPlanPrice(cap)})`;
  }

  return { calculated, final, breakdown };
}

export function addTrialDays(from = new Date()) {
  const ends = new Date(from);
  ends.setDate(ends.getDate() + TRIAL_DAYS);
  return ends.toISOString();
}

export function isInTrial(trialEndsAt: string | null | undefined) {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() > Date.now();
}

/** Primeiro e último dia do mês (YYYY-MM-DD) em fuso local */
export function getMonthPeriod(year: number, month: number) {
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart, periodEnd };
}

/** Status de pedidos que contam para faturamento (% sobre vendas) */
export const BILLABLE_ORDER_STATUSES = [
  "aberto",
  "preparando",
  "pronto",
  "saiu_entrega",
  "entregue",
  "finalizado",
] as const;
