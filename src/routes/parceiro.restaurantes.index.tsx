import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, Plus } from "lucide-react";
import { toast } from "sonner";
import { ParceiroDataTable, type ParceiroTableColumn } from "@/components/parceiro/parceiro-data-table";
import { ParceiroPage } from "@/routes/parceiro";
import { fetchResellerTenants, impersonateResellerTenant } from "@/lib/reseller/client";
import type { ResellerTenantRow } from "@/lib/reseller/types";
import { BILLING_PLANS } from "@/lib/platform/billing-plans";

export const Route = createFileRoute("/parceiro/restaurantes/")({
  component: ParceiroRestaurantesPage,
});

function ParceiroRestaurantesPage() {
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

  const columns: ParceiroTableColumn<ResellerTenantRow>[] = [
    {
      id: "name",
      header: "Restaurante",
      sortable: true,
      sortValue: (t) => t.name,
      cell: (t) => (
        <div>
          <p className="font-semibold text-primary">{t.name}</p>
          <p className="text-xs text-[#6B7280]">{t.slug}</p>
        </div>
      ),
    },
    {
      id: "owner",
      header: "Proprietario",
      sortable: true,
      sortValue: (t) => t.owner_name ?? "",
      cell: (t) => (
        <div>
          <p className="text-sm">{t.owner_name ?? "—"}</p>
          {t.owner_email ? <p className="text-xs text-[#6B7280]">{t.owner_email}</p> : null}
        </div>
      ),
    },
    {
      id: "plan",
      header: "Plano",
      sortable: true,
      sortValue: (t) => t.plan ?? "",
      cell: (t) =>
        t.plan ? (BILLING_PLANS[t.plan]?.name ?? t.plan) : "—",
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (t) => t.status,
      cell: (t) => <span className="capitalize">{t.status}</span>,
    },
    {
      id: "trial",
      header: "Trial ate",
      sortable: true,
      sortValue: (t) => t.trial_ends_at ?? "",
      cell: (t) =>
        t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString("pt-BR") : "—",
    },
    {
      id: "action",
      header: "",
      className: "text-right",
      cell: (t) => (
        <button
          type="button"
          onClick={() => impersonateMutation.mutate(t.id)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <Eye className="size-3.5" />
          Abrir painel
        </button>
      ),
    },
  ];

  return (
    <ParceiroPage
      title="Restaurantes"
      subtitle="Carteira de clientes da revendedora."
      actions={
        <Link
          to="/parceiro/restaurantes/nova"
          className="inline-flex items-center gap-2 rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
        >
          <Plus className="size-4" />
          Novo restaurante
        </Link>
      }
    >
      <ParceiroDataTable
        columns={columns}
        data={tenants}
        rowKey={(t) => t.id}
        isLoading={isLoading}
        searchPlaceholder="Pesquisa rapida..."
        searchMatch={(t, q) =>
          `${t.name} ${t.slug} ${t.owner_email ?? ""} ${t.owner_name ?? ""}`.toLowerCase().includes(q)
        }
        filters={[
          {
            id: "status",
            label: "Status",
            options: [
              { value: "active", label: "Ativo" },
              { value: "trial", label: "Trial" },
              { value: "suspended", label: "Suspenso" },
              { value: "pending", label: "Pendente" },
            ],
            match: (t, v) => t.status === v,
          },
        ]}
        emptyMessage="Nenhum restaurante cadastrado ainda."
      />
    </ParceiroPage>
  );
}
