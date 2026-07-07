import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ExternalLink, Plus, Power, PowerOff, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPage, AdminStatCard } from "@/routes/admin";
import {
  deactivateAdminTenant,
  fetchAdminTenants,
  fetchPlatformCapacity,
  reactivateAdminTenant,
  useAdminTenantsSource,
} from "@/lib/platform-admin/client";
import { NORFOOD_DEMO_TENANT_ID } from "@/lib/tenant/constants";
import { lojaPath, tenantPath } from "@/lib/tenant/painel-routes";
import type { TenantStatus } from "@/lib/tenant/types";
import { isBrowserDemoEnabled } from "@/lib/shared/runtime";

export const Route = createFileRoute("/admin/empresas")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  component: AdminEmpresasPage,
});

const STATUS_LABEL: Record<TenantStatus, string> = {
  active: "Ativa",
  trial: "Trial",
  pending: "Pendente",
  suspended: "Suspensa",
};

const STATUS_TONE: Record<TenantStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700",
  trial: "bg-amber-500/15 text-amber-700",
  pending: "bg-sky-500/15 text-sky-700",
  suspended: "bg-rose-500/15 text-rose-700",
};

function AdminEmpresasPage() {
  const { q: initialQ } = Route.useSearch();
  const demo = useAdminTenantsSource();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(initialQ);

  useEffect(() => {
    if (initialQ) setSearch(initialQ);
  }, [initialQ]);

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["admin-tenants", demo],
    queryFn: fetchAdminTenants,
  });

  const statusMutation = useMutation({
    mutationFn: async (input: { tenantId: string; action: "deactivate" | "reactivate" }) => {
      if (input.action === "deactivate") return deactivateAdminTenant(input.tenantId);
      return reactivateAdminTenant(input.tenantId, "trial");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tenant", variables.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      toast.success(
        variables.action === "deactivate" ? "Empresa desativada." : "Empresa reativada em trial.",
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleToggleStatus(tenantId: string, currentStatus: TenantStatus, tenantName: string) {
    if (tenantId === NORFOOD_DEMO_TENANT_ID) {
      toast.error("A conta Norfood (demonstração) não pode ser desativada.");
      return;
    }
    if (currentStatus === "suspended") {
      if (!window.confirm(`Reativar "${tenantName}"?`)) return;
      statusMutation.mutate({ tenantId, action: "reactivate" });
      return;
    }
    if (!window.confirm(`Desativar "${tenantName}"?`)) return;
    statusMutation.mutate({ tenantId, action: "deactivate" });
  }

  const { data: capacity } = useQuery({
    queryKey: ["platform-capacity", demo],
    queryFn: fetchPlatformCapacity,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.owner_email?.toLowerCase().includes(q) ?? false),
    );
  }, [tenants, search]);

  const stats = useMemo(
    () => ({
      total: tenants.length,
      active: tenants.filter((t) => t.status === "active").length,
      trial: tenants.filter((t) => t.status === "trial").length,
      pending: tenants.filter((t) => t.status === "pending").length,
      suspended: tenants.filter((t) => t.status === "suspended").length,
    }),
    [tenants],
  );

  return (
    <AdminPage
      title="Empresas"
      subtitle="Gerencie restaurantes cadastrados na plataforma Norfood."
      actions={
        capacity?.atLimit ? (
          <span className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-800">
            Limite atingido ({capacity.currentTenants}/{capacity.maxTenants})
          </span>
        ) : (
          <Link
            to="/admin/nova"
            className="inline-flex items-center gap-2 rounded-xl bg-[#FF9100] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="size-4" />
            Nova empresa
          </Link>
        )
      }
    >
      {demo && isBrowserDemoEnabled() ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Modo demo:</strong> empresas ficam no localStorage.
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <AdminStatCard label="Total" value={stats.total} icon={<Building2 className="size-4 text-[#6B7280]" />} />
        <AdminStatCard label="Ativas" value={stats.active} />
        <AdminStatCard label="Em trial" value={stats.trial} />
        <AdminStatCard label="Pendentes" value={stats.pending} />
        <AdminStatCard label="Suspensas" value={stats.suspended} />
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, slug ou e-mail..."
          className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#FF9100] focus:ring-2 focus:ring-[#FF9100]/15"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-[#FF9100] border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-white px-6 py-16 text-center">
          <p className="text-lg font-semibold">Nenhuma empresa encontrada</p>
          <Link to="/admin/nova" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#111111] px-4 py-2 text-sm font-semibold text-white">
            <Plus className="size-4" />
            Nova empresa
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F6F7F9] text-left text-xs uppercase tracking-wide text-[#6B7280]">
                <tr>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Dono</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tenant) => (
                  <tr key={tenant.id} className="border-b border-[#E5E7EB] last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                          style={{ backgroundColor: tenant.primary_color }}
                        >
                          {tenant.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold">{tenant.name}</p>
                          {tenant.subtitle ? <p className="text-xs text-[#6B7280]">{tenant.subtitle}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[#6B7280]">{tenant.slug}</td>
                    <td className="px-4 py-3 text-[#6B7280]">{tenant.owner_email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${STATUS_TONE[tenant.status]}`}>
                        {STATUS_LABEL[tenant.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {tenant.id !== NORFOOD_DEMO_TENANT_ID ? (
                          tenant.status === "suspended" ? (
                            <button type="button" disabled={statusMutation.isPending} onClick={() => handleToggleStatus(tenant.id, tenant.status, tenant.name)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                              <Power className="size-3" /> Reativar
                            </button>
                          ) : (
                            <button type="button" disabled={statusMutation.isPending} onClick={() => handleToggleStatus(tenant.id, tenant.status, tenant.name)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-800">
                              <PowerOff className="size-3" /> Desativar
                            </button>
                          )
                        ) : null}
                        <Link to="/admin/$tenantId" params={{ tenantId: tenant.id }} className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-[#F6F7F9]">Editar</Link>
                        <a href={tenantPath(tenant.slug, "dashboard")} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-[#F6F7F9]">Painel <ExternalLink className="size-3" /></a>
                        <a href={lojaPath(tenant.slug)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-[#F6F7F9]">Loja <ExternalLink className="size-3" /></a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
