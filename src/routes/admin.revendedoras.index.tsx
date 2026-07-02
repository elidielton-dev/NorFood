import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { AdminShell, AdminStatCard } from "@/components/admin/admin-shell";
import { fetchResellersAdmin, updateResellerStatusAdmin } from "@/lib/reseller/client";

export const Route = createFileRoute("/admin/revendedoras/")({
  component: AdminRevendedorasPage,
});

function AdminRevendedorasPage() {
  const qc = useQueryClient();
  const { data: resellers = [], isLoading } = useQuery({
    queryKey: ["admin-resellers"],
    queryFn: fetchResellersAdmin,
  });

  const statusMutation = useMutation({
    mutationFn: updateResellerStatusAdmin,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-resellers"] });
      toast.success("Status atualizado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const active = resellers.filter((r) => r.status === "active").length;

  return (
    <AdminShell
      title="Revendedoras"
      subtitle="Hiperadores e carteiras de restaurantes."
      actions={
        <Link
          to="/admin/revendedoras/nova"
          className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="size-4" />
          Nova revendedora
        </Link>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <AdminStatCard label="Total" value={resellers.length} icon={<Users className="size-4" />} />
        <AdminStatCard label="Ativas" value={active} icon={<Building2 className="size-4" />} />
        <AdminStatCard
          label="Restaurantes via parceiros"
          value={resellers.reduce((acc, r) => acc + (r.tenant_count ?? 0), 0)}
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando...</p>
      ) : resellers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-8 text-center text-sm text-[#6B7280]">
          Nenhuma revendedora cadastrada ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#F6F7F9] text-left text-xs uppercase text-[#6B7280]">
              <tr>
                <th className="px-4 py-3">Revendedora</th>
                <th className="px-4 py-3">Licencas</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {resellers.map((reseller) => (
                <tr key={reseller.id} className="border-t border-[#E5E7EB]">
                  <td className="px-4 py-3">
                    <Link
                      to="/admin/revendedoras/$resellerId"
                      params={{ resellerId: reseller.id }}
                      className="font-semibold text-[#111111] hover:text-[#FF9100]"
                    >
                      {reseller.name}
                    </Link>
                    <p className="text-xs text-[#6B7280]">{reseller.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    {reseller.tenant_count ?? 0} / {reseller.max_tenants}
                  </td>
                  <td className="px-4 py-3 capitalize">{reseller.status}</td>
                  <td className="px-4 py-3">{reseller.contact_email}</td>
                  <td className="px-4 py-3 text-right">
                    {reseller.status === "active" ? (
                      <button
                        type="button"
                        onClick={() =>
                          statusMutation.mutate({
                            resellerId: reseller.id,
                            status: "suspended",
                            reason: "Suspensao manual",
                          })
                        }
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Suspender
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          statusMutation.mutate({ resellerId: reseller.id, status: "active" })
                        }
                        className="text-xs text-emerald-600 hover:underline"
                      >
                        Reativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
