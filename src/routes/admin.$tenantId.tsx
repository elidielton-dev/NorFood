import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPage } from "@/routes/admin";
import {
  deleteAdminTenant,
  fetchAdminTenant,
  saveAdminTenant,
  deactivateAdminTenant,
  reactivateAdminTenant,
  useAdminTenantsSource,
} from "@/lib/platform-admin/client";
import { impersonatePlatformTenant } from "@/lib/reseller/client";
import { NORFOOD_DEMO_TENANT_ID } from "@/lib/tenant/constants";
import { lojaPath, tenantPath } from "@/lib/tenant/painel-routes";
import type { TenantStatus } from "@/lib/tenant/types";

export const Route = createFileRoute("/admin/$tenantId")({
  component: AdminEditarEmpresaPage,
});

function AdminEditarEmpresaPage() {
  const { tenantId } = Route.useParams();
  const navigate = useNavigate();
  const demo = useAdminTenantsSource();
  const queryClient = useQueryClient();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["admin-tenant", tenantId, demo],
    queryFn: () => fetchAdminTenant(tenantId),
  });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#FF9100");
  const [status, setStatus] = useState<TenantStatus>("active");
  const [customDomain, setCustomDomain] = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");
  const [showDeactivateForm, setShowDeactivateForm] = useState(false);
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState("");
  const [showDeleteForm, setShowDeleteForm] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name);
    setSlug(tenant.slug);
    setSubtitle(tenant.subtitle ?? "");
    setPrimaryColor(tenant.primary_color);
    setStatus(tenant.status);
    setCustomDomain(tenant.custom_domain ?? "");
  }, [tenant]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveAdminTenant(tenantId, {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        subtitle: subtitle.trim() || undefined,
        primary_color: primaryColor,
        status,
        custom_domain: customDomain.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
      toast.success("Empresa atualizada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: () => deactivateAdminTenant(tenantId, deactivateReason.trim() || undefined),
    onSuccess: (updated) => {
      setStatus(updated.status);
      setShowDeactivateForm(false);
      setDeactivateReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
      toast.success("Empresa desativada. Painel e loja bloqueados.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: (nextStatus: "trial" | "active") => reactivateAdminTenant(tenantId, nextStatus),
    onSuccess: (updated) => {
      setStatus(updated.status);
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tenant", tenantId] });
      toast.success("Empresa reativada.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminTenant(tenantId, deleteConfirmSlug.trim().toLowerCase()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tenants"] });
      toast.success("Conta excluída permanentemente.");
      navigate({ to: "/admin" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const impersonateMutation = useMutation({
    mutationFn: () => impersonatePlatformTenant(tenantId),
    onSuccess: (result) => {
      window.location.href = result.path;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isNorfoodDemo = tenantId === NORFOOD_DEMO_TENANT_ID;

  if (isLoading) {
    return (
      <AdminPage title="Carregando...">
        <div className="flex justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-[#FF7A00] border-t-transparent" />
        </div>
      </AdminPage>
    );
  }

  if (!tenant) {
    return (
      <AdminPage title="Empresa não encontrada">
        <Link to="/admin" className="text-sm text-[#FF7A00] hover:underline">
          ← Voltar para empresas
        </Link>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title={tenant.name}
      subtitle={`ID: ${tenant.id}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={impersonateMutation.isPending}
            onClick={() => impersonateMutation.mutate()}
            className="rounded-xl border border-[#FF9100] bg-[#FF9100]/10 px-3 py-2 text-xs font-semibold text-[#C45A00] hover:bg-[#FF9100]/20 disabled:opacity-60"
          >
            {impersonateMutation.isPending ? "Abrindo..." : "Entrar como admin"}
          </button>
          <a
            href={tenantPath(tenant.slug, "dashboard")}
            className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#F6F7F9]"
          >
            Abrir painel
          </a>
          <a
            href={lojaPath(tenant.slug)}
            className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#F6F7F9]"
          >
            Abrir loja
          </a>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <form
          className="space-y-4 rounded-xl border border-[#E5E7EB] bg-white p-6 lg:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <h2 className="text-sm font-semibold text-[#111111]">Configurações</h2>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">Slug</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">Subtítulo</span>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">Domínio personalizado</span>
            <input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="pedidos.restaurante.com.br"
              className={inputClass}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">Cor principal</span>
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-xl border border-[#E5E7EB]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#6B7280]">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TenantStatus)}
                className={inputClass}
              >
                <option value="active">Ativa</option>
                <option value="trial">Trial</option>
                <option value="pending">Pendente</option>
                <option value="suspended">Suspensa</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#111111] px-5 text-sm font-semibold text-white hover:bg-[#333] disabled:opacity-60"
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar alterações"}
          </button>
        </form>

        <aside className="space-y-4">
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
            <h3 className="text-sm font-semibold text-[#111111]">Dono</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[#6B7280]">Nome</dt>
                <dd className="text-[#111111]">{tenant.owner_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#6B7280]">E-mail</dt>
                <dd className="text-[#111111]">{tenant.owner_email ?? "—"}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-[#E5E7EB] bg-white p-5">
            <h3 className="text-sm font-semibold text-[#111111]">Links rápidos</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <span className="text-[#6B7280]">Painel: </span>
                <code className="text-xs">{tenantPath(tenant.slug, "dashboard")}</code>
              </li>
              <li>
                <span className="text-[#6B7280]">Loja: </span>
                <code className="text-xs">{lojaPath(tenant.slug)}</code>
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-5">
            <h3 className="text-sm font-semibold text-rose-900">Conta da empresa</h3>
            {isNorfoodDemo ? (
              <p className="mt-2 text-sm text-rose-800">
                A conta Norfood (demonstração) não pode ser desativada.
              </p>
            ) : status === "suspended" ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-rose-800">
                  Esta empresa está <strong>desativada</strong>. Painel e loja estão bloqueados.
                </p>
                {tenant.rejection_reason ? (
                  <p className="rounded-lg bg-white/80 px-3 py-2 text-sm text-[#5C4A3A]">
                    {tenant.rejection_reason}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={reactivateMutation.isPending}
                    onClick={() => reactivateMutation.mutate("trial")}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Reativar em trial
                  </button>
                  <button
                    type="button"
                    disabled={reactivateMutation.isPending}
                    onClick={() => reactivateMutation.mutate("active")}
                    className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                  >
                    Reativar como ativa
                  </button>
                </div>
              </div>
            ) : showDeactivateForm ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-rose-800">
                  Ao desativar, o restaurante perde acesso ao painel e a loja fica indisponível.
                </p>
                <label className="block text-sm font-medium text-[#111111]">
                  Motivo (opcional — exibido ao cliente)
                  <textarea
                    value={deactivateReason}
                    onChange={(e) => setDeactivateReason(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                    placeholder="Ex.: solicitação do cliente, inadimplência, fraude..."
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={deactivateMutation.isPending}
                    onClick={() => deactivateMutation.mutate()}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    Confirmar desativação
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeactivateForm(false);
                      setDeactivateReason("");
                    }}
                    className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111111]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeactivateForm(true)}
                className="mt-3 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100"
              >
                Desativar conta
              </button>
            )}
          </div>
          <div className="rounded-xl border border-red-300 bg-red-50/50 p-5">
            <h3 className="text-sm font-semibold text-red-900">Excluir conta</h3>
            {isNorfoodDemo ? (
              <p className="mt-2 text-sm text-red-800">
                A conta Norfood (demonstração) não pode ser excluída.
              </p>
            ) : showDeleteForm ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-red-800">
                  Esta ação é <strong>irreversível</strong>. Todos os dados da empresa serão
                  removidos permanentemente.
                </p>
                <label className="block text-sm font-medium text-[#111111]">
                  Digite <code className="rounded bg-white px-1">{tenant.slug}</code> para confirmar
                  <input
                    type="text"
                    value={deleteConfirmSlug}
                    onChange={(e) => setDeleteConfirmSlug(e.target.value)}
                    className="mt-2 h-10 w-full rounded-lg border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-400"
                    placeholder={tenant.slug}
                    autoComplete="off"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={deleteMutation.isPending || deleteConfirmSlug.trim().toLowerCase() !== tenant.slug}
                    onClick={() => deleteMutation.mutate()}
                    className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                  >
                    Excluir permanentemente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteForm(false);
                      setDeleteConfirmSlug("");
                    }}
                    className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111111]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteForm(true)}
                className="mt-3 rounded-lg border border-red-400 bg-white px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100"
              >
                Excluir conta permanentemente
              </button>
            )}
          </div>
          <Link to="/admin" className="block text-center text-sm text-[#6B7280] hover:text-[#111111]">
            ← Todas as empresas
          </Link>
        </aside>
      </div>
    </AdminPage>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none focus:border-[#FF7A00] focus:ring-2 focus:ring-[#FF7A00]/15";
