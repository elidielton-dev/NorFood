import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/admin-shell";
import { fetchAdminTenant, saveAdminTenant, useAdminTenantsSource } from "@/lib/platform-admin/client";
import { lojaPath, tenantPath } from "@/lib/tenant/painel-routes";
import type { TenantStatus } from "@/lib/tenant/types";

export const Route = createFileRoute("/admin/$tenantId")({
  component: AdminEditarEmpresaPage,
});

function AdminEditarEmpresaPage() {
  const { tenantId } = Route.useParams();
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

  if (isLoading) {
    return (
      <AdminShell title="Carregando...">
        <div className="flex justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-[#FF7A00] border-t-transparent" />
        </div>
      </AdminShell>
    );
  }

  if (!tenant) {
    return (
      <AdminShell title="Empresa não encontrada">
        <Link to="/admin" className="text-sm text-[#FF7A00] hover:underline">
          ← Voltar para empresas
        </Link>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={tenant.name}
      subtitle={`ID: ${tenant.id}`}
      actions={
        <div className="flex flex-wrap gap-2">
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
          <Link to="/admin" className="block text-center text-sm text-[#6B7280] hover:text-[#111111]">
            ← Todas as empresas
          </Link>
        </aside>
      </div>
    </AdminShell>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none focus:border-[#FF7A00] focus:ring-2 focus:ring-[#FF7A00]/15";
