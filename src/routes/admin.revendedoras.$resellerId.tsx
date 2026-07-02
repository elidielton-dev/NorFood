import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminPage } from "@/routes/admin";
import { fetchResellerAdmin } from "@/lib/reseller/client";
import { listResellerTenantsAdminServer } from "@/lib/api/platform-reseller.functions";

export const Route = createFileRoute("/admin/revendedoras/$resellerId")({
  component: AdminRevendedoraDetailPage,
});

function AdminRevendedoraDetailPage() {
  const { resellerId } = Route.useParams();
  const { data: reseller, isLoading } = useQuery({
    queryKey: ["admin-reseller", resellerId],
    queryFn: () => fetchResellerAdmin(resellerId),
  });
  const { data: tenants = [] } = useQuery({
    queryKey: ["admin-reseller-tenants", resellerId],
    queryFn: () => listResellerTenantsAdminServer({ data: resellerId }),
  });

  if (isLoading || !reseller) {
    return (
      <AdminPage title="Revendedora" subtitle="Carregando...">
        <p className="text-sm text-[#6B7280]">Carregando...</p>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title={reseller.name}
      subtitle={`${reseller.tenant_count ?? 0} / ${reseller.max_tenants} licencas`}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Slug" value={reseller.slug} />
        <Info label="Status" value={reseller.status} />
        <Info label="E-mail" value={reseller.contact_email} />
        <Info label="Trial padrao" value={`${reseller.default_trial_days} dias`} />
        <Info
          label="Preco/tenant"
          value={
            reseller.price_per_tenant != null
              ? `R$ ${Number(reseller.price_per_tenant).toFixed(2)}`
              : "—"
          }
        />
        <Info
          label="Plano fixo"
          value={
            reseller.flat_monthly_fee != null
              ? `R$ ${Number(reseller.flat_monthly_fee).toFixed(2)}`
              : "—"
          }
        />
      </div>

      <div className="mb-4 flex gap-3">
        <Link to="/admin/revendedoras" className="text-sm text-[#FF9100] hover:underline">
          Voltar
        </Link>
        <Link to="/parceiro" className="text-sm text-[#6B7280] hover:underline">
          Painel parceiro
        </Link>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Restaurantes</h2>
      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#F6F7F9] text-left text-xs uppercase text-[#6B7280]">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-[#E5E7EB]">
                <td className="px-4 py-3">{tenant.name}</td>
                <td className="px-4 py-3">{tenant.slug}</td>
                <td className="px-4 py-3 capitalize">{tenant.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
      <p className="text-xs uppercase text-[#6B7280]">{label}</p>
      <p className="mt-1 font-semibold capitalize text-[#111111]">{value}</p>
    </div>
  );
}
