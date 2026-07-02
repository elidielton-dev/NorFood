import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { AdminCard, AdminPage } from "@/routes/admin";
import { approveAdminTenant, fetchAdminTenants, rejectAdminTenant } from "@/lib/platform-admin/client";

export const Route = createFileRoute("/admin/aprovacoes")({
  component: AdminAprovacoesPage,
});

function AdminAprovacoesPage() {
  const qc = useQueryClient();
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: fetchAdminTenants,
  });

  const pending = tenants.filter((t) => t.status === "pending");

  const approveMutation = useMutation({
    mutationFn: approveAdminTenant,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      void qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      toast.success("Empresa aprovada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (tenantId: string) => rejectAdminTenant(tenantId, "Cadastro não aprovado."),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      void qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      toast.success("Cadastro rejeitado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <AdminPage title="Aprovações" subtitle="Cadastros pendentes de liberação na plataforma.">
      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando...</p>
      ) : pending.length === 0 ? (
        <AdminCard>
          <p className="py-8 text-center text-sm text-[#6B7280]">Nenhuma empresa aguardando aprovação.</p>
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {pending.map((tenant) => (
            <article key={tenant.id} className="flex flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-[#111111]">{tenant.name}</p>
                <p className="text-sm text-[#6B7280]">{tenant.slug} · {tenant.owner_email ?? "sem e-mail"}</p>
                {tenant.city ? <p className="text-xs text-[#9CA3AF]">{tenant.city}{tenant.state ? `, ${tenant.state}` : ""}</p> : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => approveMutation.mutate(tenant.id)}
                  disabled={approveMutation.isPending}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                >
                  <Check className="size-4" /> Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Rejeitar "${tenant.name}"?`)) rejectMutation.mutate(tenant.id);
                  }}
                  disabled={rejectMutation.isPending}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700"
                >
                  <X className="size-4" /> Rejeitar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
