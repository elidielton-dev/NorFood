import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Clock3, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell, AdminStatCard } from "@/components/admin/admin-shell";
import {
  approveAdminTenant,
  fetchAdminTenants,
  rejectAdminTenant,
  useAdminTenantsSource,
} from "@/lib/platform-admin/client";
import { lojaPath, tenantPath } from "@/lib/tenant/painel-routes";
import { formatDocument } from "@/lib/shared/document-validation";

export const Route = createFileRoute("/admin/aprovacoes")({
  component: AdminAprovacoesPage,
});

function AdminAprovacoesPage() {
  const demo = useAdminTenantsSource();
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["admin-tenants", demo],
    queryFn: fetchAdminTenants,
  });

  const pending = tenants.filter((t) => t.status === "pending");

  const approveMutation = useMutation({
    mutationFn: approveAdminTenant,
    onSuccess: (tenant) => {
      toast.success(`${tenant.name} aprovado! Cliente notificado por e-mail e WhatsApp.`);
      void queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao aprovar");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ tenantId, reason }: { tenantId: string; reason?: string }) =>
      rejectAdminTenant(tenantId, reason),
    onSuccess: () => {
      toast.success("Cadastro rejeitado. Cliente notificado.");
      setRejectingId(null);
      setRejectReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao rejeitar");
    },
  });

  return (
    <AdminShell
      title="Aprovações pendentes"
      subtitle="Novos restaurantes aguardando liberação manual."
      actions={
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111111] hover:bg-[#F6F7F9]"
        >
          <Building2 className="size-4" />
          Todas as empresas
        </Link>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <AdminStatCard
          label="Aguardando análise"
          value={pending.length}
          icon={<Clock3 className="size-4 text-amber-600" />}
        />
        <AdminStatCard label="Total de empresas" value={tenants.length} />
      </div>

      {demo ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Aprovações reais funcionam com Supabase configurado (modo demo usa dados locais).
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-[#FF7A00] border-t-transparent" />
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-white px-6 py-16 text-center">
          <p className="text-lg font-semibold text-[#111111]">Nenhum cadastro pendente</p>
          <p className="mt-2 text-sm text-[#6B7280]">
            Quando um restaurante se cadastrar, ele aparecerá aqui para você aprovar.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((tenant) => (
            <div
              key={tenant.id}
              className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      Novo cadastro
                    </span>
                    {tenant.created_at ? (
                      <span className="text-xs text-[#6B7280]">
                        {new Date(tenant.created_at).toLocaleString("pt-BR")}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-[#111111]">{tenant.name}</h2>
                  <p className="mt-1 font-mono text-xs text-[#6B7280]">{tenant.slug}</p>
                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-[#6B7280]">Dono</dt>
                      <dd className="text-[#111111]">
                        {tenant.owner_name ?? "—"}
                        {tenant.owner_email ? (
                          <span className="block text-[#6B7280]">{tenant.owner_email}</span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-[#6B7280]">Telefone</dt>
                      <dd className="text-[#111111]">{tenant.owner_phone ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-[#6B7280]">Documento</dt>
                      <dd className="text-[#111111]">
                        {tenant.document_type && tenant.document_number
                          ? `${tenant.document_type.toUpperCase()} ${formatDocument(tenant.document_type as "cnpj" | "cpf", tenant.document_number)}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-[#6B7280]">Cidade</dt>
                      <dd className="text-[#111111]">
                        {[tenant.city, tenant.state].filter(Boolean).join(" / ") || "—"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                  <button
                    type="button"
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate(tenant.id)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Check className="size-4" />
                    Aprovar e liberar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingId(tenant.id);
                      setRejectReason("");
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-medium text-rose-700 hover:bg-rose-50"
                  >
                    <X className="size-4" />
                    Rejeitar
                  </button>
                  <a
                    href={lojaPath(tenant.slug)}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E5E7EB] px-4 text-sm font-medium text-[#111111] hover:bg-[#F6F7F9]"
                  >
                    Ver loja
                  </a>
                  <a
                    href={tenantPath(tenant.slug, "dashboard")}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E5E7EB] px-4 text-sm font-medium text-[#111111] hover:bg-[#F6F7F9]"
                  >
                    Ver painel
                  </a>
                </div>
              </div>

              {rejectingId === tenant.id ? (
                <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                  <label className="block text-sm font-medium text-[#111111]">
                    Motivo (opcional)
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-rose-300"
                      placeholder="Ex.: documento inconsistente, dados incompletos..."
                    />
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        rejectMutation.mutate({ tenantId: tenant.id, reason: rejectReason })
                      }
                      disabled={rejectMutation.isPending}
                      className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      Confirmar rejeição
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectingId(null)}
                      className="rounded-lg border border-[#E5E7EB] px-4 py-2 text-sm font-medium"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
