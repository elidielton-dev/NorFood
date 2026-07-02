import { createFileRoute } from "@tanstack/react-router";
import { AdminCard, AdminPage } from "@/routes/admin";
import { BILLING_PLAN_LIST, REVENUE_SHARE_CONFIG, TRIAL_DAYS, formatPlanPrice } from "@/lib/platform/billing-plans";

export const Route = createFileRoute("/admin/planos")({
  component: AdminPlanosPage,
});

function AdminPlanosPage() {
  return (
    <AdminPage title="Planos e preços" subtitle="Catálogo comercial NorFood — mensalidade fixa e revenue share.">
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {BILLING_PLAN_LIST.map((plan) => (
          <AdminCard key={plan.id} className={plan.highlighted ? "border-[#FF9100]/40 ring-1 ring-[#FF9100]/20" : undefined}>
            <p className="text-xs font-bold uppercase tracking-wide text-[#FF9100]">{plan.name}</p>
            <p className="mt-2 text-3xl font-bold">{formatPlanPrice(plan.price)}</p>
            <p className="text-sm text-[#6B7280]">por mês</p>
            <p className="mt-3 text-sm text-[#6B7280]">{plan.description}</p>
            <ul className="mt-4 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="text-sm text-[#111111]">• {f}</li>
              ))}
            </ul>
          </AdminCard>
        ))}
      </div>

      <AdminCard title="Trial padrão">
        <p className="text-sm text-[#6B7280]">
          Período de teste: <strong className="text-[#111111]">{TRIAL_DAYS} dias</strong> para novos restaurantes.
        </p>
      </AdminCard>

      <AdminCard title="Revenue share" className="mt-6">
        <p className="text-sm text-[#6B7280]">{REVENUE_SHARE_CONFIG.description}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          <div><dt className="text-[#9CA3AF]">Percentual</dt><dd className="font-semibold">{REVENUE_SHARE_CONFIG.percent}%</dd></div>
          <div><dt className="text-[#9CA3AF]">Mínimo</dt><dd className="font-semibold">{formatPlanPrice(REVENUE_SHARE_CONFIG.minMonthly)}</dd></div>
          <div><dt className="text-[#9CA3AF]">Teto</dt><dd className="font-semibold">{formatPlanPrice(REVENUE_SHARE_CONFIG.capMonthly)}</dd></div>
        </dl>
      </AdminCard>
    </AdminPage>
  );
}
