import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";
import { AdminCard, AdminPage, AdminStatCard } from "@/routes/admin";
import { fetchPlatformCapacity } from "@/lib/platform-admin/client";
import { getAdminDashboardServer } from "@/lib/api/plataforma/platform-admin.functions";
import { useAdminTenantsSource } from "@/lib/platform-admin/client";

export const Route = createFileRoute("/admin/sistema")({
  component: AdminSistemaPage,
});

function AdminSistemaPage() {
  const demo = useAdminTenantsSource();
  const { data: capacity } = useQuery({
    queryKey: ["platform-capacity", demo],
    queryFn: fetchPlatformCapacity,
  });
  const { data: dashboard } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => getAdminDashboardServer(),
  });

  const usedPct = capacity ? Math.round((capacity.currentTenants / capacity.maxTenants) * 100) : 0;

  return (
    <AdminPage title="Capacidade VPS" subtitle="Limites de tenants, workers e saúde da infraestrutura NorFood.">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminStatCard label="Perfil" value={capacity?.label ?? "—"} icon={<Server className="size-4 text-[#FF9100]" />} />
          <AdminStatCard label="Empresas" value={`${capacity?.currentTenants ?? 0}/${capacity?.maxTenants ?? "—"}`} />
          <AdminStatCard label="Vagas restantes" value={capacity?.remaining ?? "—"} />
          <AdminStatCard label="Workers PM2" value={capacity?.pm2Instances ?? "—"} />
        </div>

        <AdminCard title="Uso de capacidade">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-[#6B7280]">Ocupação</span>
            <span className="font-semibold">{usedPct}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#F3F4F6]">
            <div
              className={`h-full rounded-full ${usedPct >= 100 ? "bg-rose-500" : usedPct >= 85 ? "bg-amber-500" : "bg-[#FF9100]"}`}
              style={{ width: `${Math.min(usedPct, 100)}%` }}
            />
          </div>
          {capacity?.atLimit ? (
            <p className="mt-3 text-sm text-rose-600">Limite atingido — não é possível criar novas empresas até liberar vagas.</p>
          ) : null}
          {capacity?.evolutionOnSameHost ? (
            <p className="mt-2 text-sm text-amber-700">Evolution API na mesma VPS — limite reduzido automaticamente.</p>
          ) : null}
        </AdminCard>

        <AdminCard title="Resumo operacional">
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <div><dt className="text-[#9CA3AF]">Tenants ativos + trial</dt><dd className="font-semibold">{(dashboard?.tenants.active ?? 0) + (dashboard?.tenants.trial ?? 0)}</dd></div>
            <div><dt className="text-[#9CA3AF]">Via revendedoras</dt><dd className="font-semibold">{dashboard?.resellers.tenantsViaResellers ?? 0}</dd></div>
          </dl>
          <Link to="/admin/empresas" className="mt-4 inline-block text-sm font-medium text-[#FF9100] hover:underline">
            Gerenciar empresas
          </Link>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
