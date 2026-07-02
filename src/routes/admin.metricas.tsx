import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AdminCard, AdminPage, AdminStatCard } from "@/routes/admin";
import { getAdminDashboardServer } from "@/lib/api/platform-admin.functions";
import { fetchAdminTenants } from "@/lib/platform-admin/client";
import { BILLING_PLAN_LIST, formatPlanPrice } from "@/lib/platform/billing-plans";

export const Route = createFileRoute("/admin/metricas")({
  component: AdminMetricasPage,
});

function AdminMetricasPage() {
  const { data: dashboard } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => getAdminDashboardServer(),
  });
  const { data: tenants = [] } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: fetchAdminTenants,
  });

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tenants) {
      if (!t.created_at) continue;
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  }, [tenants]);

  const maxMonth = Math.max(1, ...byMonth.map(([, c]) => c));

  return (
    <AdminPage title="Métricas" subtitle="Crescimento da base, planos e saúde comercial da plataforma.">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminStatCard label="Taxa de ativação" value={`${dashboard?.tenants.active ?? 0}/${dashboard?.tenants.total ?? 0}`} />
          <AdminStatCard label="Conversão trial" value={`${dashboard?.tenants.trial ?? 0} em trial`} />
          <AdminStatCard label="Parceiros ativos" value={dashboard?.resellers.active ?? 0} />
          <AdminStatCard label="MRR estimado" value={formatPlanPrice(dashboard?.billing.estimatedMrr ?? 0)} />
        </div>

        <AdminCard title="Novos cadastros por mês">
          {byMonth.length === 0 ? (
            <p className="text-sm text-[#6B7280]">Sem histórico de datas de criação.</p>
          ) : (
            <div className="space-y-3">
              {byMonth.map(([month, count]) => (
                <div key={month}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{month}</span>
                    <span className="text-[#6B7280]">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#F3F4F6]">
                    <div className="h-full rounded-full bg-[#FF9100]" style={{ width: `${(count / maxMonth) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        <AdminCard title="Planos comerciais NorFood">
          <div className="grid gap-4 lg:grid-cols-3">
            {BILLING_PLAN_LIST.map((plan) => (
              <article key={plan.id} className="rounded-xl border border-[#E5E7EB] p-4">
                <p className="text-xs font-semibold uppercase text-[#FF9100]">{plan.name}</p>
                <p className="mt-1 text-2xl font-bold">{formatPlanPrice(plan.price)}<span className="text-sm font-normal text-[#6B7280]">/mês</span></p>
                <p className="mt-2 text-sm text-[#6B7280]">{plan.description}</p>
              </article>
            ))}
          </div>
          <Link to="/admin/planos" className="mt-4 inline-block text-sm font-medium text-[#FF9100] hover:underline">
            Ver detalhes dos planos
          </Link>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
