import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { ParceiroShell } from "@/routes/parceiro";
import { fetchResellerTenants, impersonateResellerTenant } from "@/lib/reseller/client";
import { tenantPath } from "@/lib/tenant/painel-routes";

export const Route = createFileRoute("/parceiro/restaurantes")({
  component: ParceiroRestaurantesPage,
});

function ParceiroRestaurantesPage() {
  const qc = useQueryClient();
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["reseller-tenants"],
    queryFn: fetchResellerTenants,
  });

  const impersonateMutation = useMutation({
    mutationFn: impersonateResellerTenant,
    onSuccess: (result) => {
      window.location.href = result.path;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <ParceiroShell title="Restaurantes" subtitle="Carteira de clientes da revendedora.">
      <div className="mb-4 flex justify-end">
        <Link
          to="/parceiro/restaurantes/nova"
          className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="size-4" />
          Novo
        </Link>
      </div>
      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando...</p>
      ) : tenants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white p-8 text-center text-sm text-[#6B7280]">
          Nenhum restaurante cadastrado ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#F6F7F9] text-left text-xs uppercase tracking-wide text-[#6B7280]">
              <tr>
                <th className="px-4 py-3">Restaurante</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Proprietario</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-t border-[#E5E7EB]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#111111]">{tenant.name}</p>
                    <p className="text-xs text-[#6B7280]">{tenant.slug}</p>
                  </td>
                  <td className="px-4 py-3 capitalize">{tenant.plan ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{tenant.status}</td>
                  <td className="px-4 py-3">
                    <p>{tenant.owner_name ?? "—"}</p>
                    <p className="text-xs text-[#6B7280]">{tenant.owner_email ?? ""}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => impersonateMutation.mutate(tenant.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#FF9100] hover:bg-[#FF9100]/10"
                    >
                      <ExternalLink className="size-3.5" />
                      Abrir painel
                    </button>
                    <a
                      href={tenantPath(tenant.slug, "dashboard")}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#6B7280] hover:bg-[#F6F7F9]"
                    >
                      Loja
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ParceiroShell>
  );
}
