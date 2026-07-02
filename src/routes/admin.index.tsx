import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Plus,
  Server,
  Users,
  Wallet,
} from "lucide-react";
import { AdminCard, AdminPage, AdminStatCard } from "@/routes/admin";
import { getAdminDashboardServer } from "@/lib/api/platform-admin.functions";
import { formatPlanPrice } from "@/lib/platform/billing-plans";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => getAdminDashboardServer(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <AdminPage title="Dashboard" subtitle="Carregando visão geral da plataforma...">
        <div className="flex justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-[#FF9100] border-t-transparent" />
        </div>
      </AdminPage>
    );
  }

  const tenants = data?.tenants;
  const capacity = data?.capacity;
  const billing = data?.billing;

  return (
    <AdminPage
      title="Dashboard"
      subtitle="Command center da plataforma NorFood — tenants, parceiros, faturamento e saúde operacional."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/nova"
            className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            Nova empresa
          </Link>
          <Link
            to="/admin/revendedoras/nova"
            className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-medium"
          >
            <Users className="size-4" />
            Nova revendedora
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatCard
            label="Empresas"
            value={tenants?.total ?? 0}
            hint={`${tenants?.active ?? 0} ativas · ${tenants?.trial ?? 0} trial`}
            icon={<Building2 className="size-4 text-[#FF9100]" />}
          />
          <AdminStatCard
            label="Revendedoras"
            value={data?.resellers.active ?? 0}
            hint={`${data?.resellers.total ?? 0} cadastradas`}
            icon={<Users className="size-4 text-[#FF9100]" />}
          />
          <AdminStatCard
            label="MRR estimado"
            value={formatPlanPrice(billing?.estimatedMrr ?? 0)}
            hint={`${billing?.paidCount ?? 0} faturas pagas`}
            icon={<Wallet className="size-4 text-[#FF9100]" />}
          />
          <AdminStatCard
            label="Capacidade VPS"
            value={`${capacity?.currentTenants ?? 0}/${capacity?.maxTenants ?? "—"}`}
            hint={capacity?.label}
            icon={<Server className="size-4 text-[#FF9100]" />}
          />
        </div>

        {(data?.alerts.length ?? 0) > 0 ? (
          <AdminCard title="Alertas operacionais">
            <ul className="space-y-2">
              {data?.alerts.map((alert) => (
                <li key={alert.id}>
                  {alert.href ? (
                    <Link
                      to={alert.href}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border px-4 py-3 transition hover:bg-[#F6F7F9]",
                        alert.level === "critical" && "border-rose-200 bg-rose-50/50",
                        alert.level === "warning" && "border-amber-200 bg-amber-50/50",
                        alert.level === "info" && "border-[#E5E7EB] bg-white",
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          alert.level === "critical" && "text-rose-600",
                          alert.level === "warning" && "text-amber-600",
                          alert.level === "info" && "text-[#FF9100]",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#111111]">{alert.title}</p>
                        <p className="text-xs text-[#6B7280]">{alert.description}</p>
                      </div>
                      <ArrowUpRight className="size-4 shrink-0 text-[#9CA3AF]" />
                    </Link>
                  ) : (
                    <div className="rounded-xl border border-[#E5E7EB] px-4 py-3">{alert.title}</div>
                  )}
                </li>
              ))}
            </ul>
          </AdminCard>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <AdminCard title="Distribuição de empresas">
            <div className="space-y-3">
              <BarRow label="Ativas" count={tenants?.active ?? 0} total={tenants?.total ?? 0} tone="emerald" />
              <BarRow label="Trial" count={tenants?.trial ?? 0} total={tenants?.total ?? 0} tone="amber" />
              <BarRow label="Pendentes" count={tenants?.pending ?? 0} total={tenants?.total ?? 0} tone="sky" />
              <BarRow label="Suspensas" count={tenants?.suspended ?? 0} total={tenants?.total ?? 0} tone="rose" />
            </div>
            <Link
              to="/admin/empresas"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#FF9100] hover:underline"
            >
              Ver todas as empresas
              <ArrowUpRight className="size-3.5" />
            </Link>
          </AdminCard>

          <AdminCard title="Ecossistema de parceiros">
            <dl className="grid gap-4 sm:grid-cols-2">
              <MiniStat label="Revendedoras ativas" value={String(data?.resellers.active ?? 0)} />
              <MiniStat label="Total parceiros" value={String(data?.resellers.total ?? 0)} />
              <MiniStat
                label="Restaurantes via parceiro"
                value={String(data?.resellers.tenantsViaResellers ?? 0)}
              />
              <MiniStat label="Workers PM2" value={String(capacity?.pm2Instances ?? "—")} />
            </dl>
            <Link
              to="/admin/revendedoras"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#FF9100] hover:underline"
            >
              Gerenciar revendedoras
              <ArrowUpRight className="size-3.5" />
            </Link>
          </AdminCard>
        </div>

        <AdminCard title="Empresas recentes">
          {(data?.recentTenants.length ?? 0) === 0 ? (
            <p className="text-sm text-[#6B7280]">Nenhuma empresa cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs uppercase text-[#6B7280]">
                  <tr>
                    <th className="pb-2">Empresa</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Dono</th>
                    <th className="pb-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {data?.recentTenants.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 font-medium">{t.name}</td>
                      <td className="py-3 capitalize text-[#6B7280]">{t.status}</td>
                      <td className="py-3 text-[#6B7280]">{t.owner_email ?? "—"}</td>
                      <td className="py-3 text-right">
                        <Link
                          to="/admin/$tenantId"
                          params={{ tenantId: t.id }}
                          className="text-xs font-medium text-[#FF9100] hover:underline"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink to="/admin/faturamento" label="Faturamento" />
          <QuickLink to="/admin/metricas" label="Métricas" />
          <QuickLink to="/admin/sistema" label="Capacidade VPS" />
          <QuickLink to="/admin/configuracoes" label="Configurações" />
        </div>
      </div>
    </AdminPage>
  );
}

function BarRow({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: "emerald" | "amber" | "sky" | "rose";
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const colors = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    sky: "bg-sky-500",
    rose: "bg-rose-500",
  };
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-[#6B7280]">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#F3F4F6]">
        <div className={cn("h-full rounded-full", colors[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F6F7F9] p-3">
      <p className="text-[10px] uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="text-lg font-bold text-[#111111]">{value}</p>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-medium text-[#111111] hover:border-[#FF9100]/40 hover:bg-[#FF9100]/5"
    >
      {label}
    </Link>
  );
}
