import type { BillingModel, BillingPlanId } from "@/lib/platform/billing-plans";
import {
  BILLING_PLAN_LIST,
  BILLING_PLANS,
  REVENUE_SHARE_CONFIG,
  TRIAL_DAYS,
  formatPlanPrice,
} from "@/lib/platform/billing-plans";
import { cn } from "@/lib/shared/utils";
import { Check, Percent, Receipt } from "lucide-react";

type PlanPickerProps = {
  billingModel: BillingModel;
  onBillingModelChange: (model: BillingModel) => void;
  selectedPlan: BillingPlanId;
  onPlanChange: (plan: BillingPlanId) => void;
  compact?: boolean;
};

export function PlanPicker({
  billingModel,
  onBillingModelChange,
  selectedPlan,
  onPlanChange,
  compact = false,
}: PlanPickerProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onBillingModelChange("monthly")}
          className={cn(
            "rounded-xl border p-4 text-left transition",
            billingModel === "monthly"
              ? "border-[#FF9100] bg-[#FFF7ED] ring-2 ring-[#FF9100]/20"
              : "border-[#E5E7EB] bg-white hover:border-[#FF9100]/50",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <Receipt className="size-4 text-[#FF9100]" />
            <span className="font-semibold text-[#111111]">Mensalidade fixa</span>
          </div>
          <p className="text-xs text-[#6B7280]">
            Previsível. Ideal se você já vende volume pelo app.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onBillingModelChange("revenue_share")}
          className={cn(
            "rounded-xl border p-4 text-left transition",
            billingModel === "revenue_share"
              ? "border-[#FF9100] bg-[#FFF7ED] ring-2 ring-[#FF9100]/20"
              : "border-[#E5E7EB] bg-white hover:border-[#FF9100]/50",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <Percent className="size-4 text-[#FF9100]" />
            <span className="font-semibold text-[#111111]">2% sobre vendas</span>
          </div>
          <p className="text-xs text-[#6B7280]">
            {REVENUE_SHARE_CONFIG.description}. Mín. {formatPlanPrice(REVENUE_SHARE_CONFIG.minMonthly)}.
          </p>
        </button>
      </div>

      {billingModel === "monthly" ? (
        <div className={cn("grid gap-3", compact ? "sm:grid-cols-1" : "sm:grid-cols-3")}>
          {BILLING_PLAN_LIST.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => onPlanChange(plan.id)}
              className={cn(
                "relative rounded-xl border p-4 text-left transition",
                selectedPlan === plan.id
                  ? "border-[#FF9100] bg-[#FFF7ED] ring-2 ring-[#FF9100]/20"
                  : "border-[#E5E7EB] bg-white hover:border-[#FF9100]/50",
                plan.highlighted && "sm:scale-[1.02]",
              )}
            >
              {plan.highlighted ? (
                <span className="absolute -top-2.5 right-3 rounded-full bg-[#111111] px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                  Popular
                </span>
              ) : null}
              <p className="text-sm font-semibold text-[#111111]">{plan.name}</p>
              <p className="mt-1 text-2xl font-bold text-[#FF9100]">
                {formatPlanPrice(plan.price)}
                <span className="text-xs font-normal text-[#6B7280]">/mês</span>
              </p>
              <p className="mt-2 text-xs text-[#6B7280]">{plan.description}</p>
              {!compact ? (
                <ul className="mt-3 space-y-1">
                  {plan.features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-[#5C4A3A]">
                      <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                      {f}
                    </li>
                  ))}
                </ul>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-4 text-sm text-[#5C4A3A]">
          <p>
            <strong className="text-[#111111]">{REVENUE_SHARE_CONFIG.percent}%</strong> sobre pedidos
            feitos pelo Norfood. Teto de {formatPlanPrice(REVENUE_SHARE_CONFIG.capMonthly)}/mês.
          </p>
          <p className="mt-2 text-xs text-[#6B7280]">
            Ex.: R$ 10.000 em vendas = {formatPlanPrice(10000 * (REVENUE_SHARE_CONFIG.percent / 100))}/mês
          </p>
        </div>
      )}

      <p className="text-center text-xs text-[#6B7280]">
        {TRIAL_DAYS} dias grátis em qualquer opção. Sem cartão agora.
      </p>
    </div>
  );
}

export function PlanSummary({
  billingModel,
  plan,
}: {
  billingModel: BillingModel;
  plan: BillingPlanId;
}) {
  if (billingModel === "revenue_share") {
    return (
      <span>
        2% sobre vendas (mín. {formatPlanPrice(REVENUE_SHARE_CONFIG.minMonthly)})
      </span>
    );
  }
  const p = BILLING_PLANS[plan];
  return (
    <span>
      {p.name} — {formatPlanPrice(p.price)}/mês
    </span>
  );
}
