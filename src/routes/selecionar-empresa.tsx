import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchUserTenantsServer } from "@/lib/api/tenant/tenant.functions";
import { tenantPath, lojaPath } from "@/lib/tenant/painel-routes";
import { isTenantStaffRole } from "@/lib/tenant/tenant-permissions";
import { listAllDemoTenants } from "@/lib/platform-admin/demo-tenants-store";
import { listFallbackTenants } from "@/lib/tenant/tenants-fallback";
import { isBrowserDemoEnabled } from "@/lib/shared/runtime";
import { NorfoodLogo } from "@/components/brand/norfood-logo";

export const Route = createFileRoute("/selecionar-empresa")({
  component: SelecionarEmpresaPage,
});

function SelecionarEmpresaPage() {
  const { data: memberships = [], isLoading } = useQuery({
    queryKey: ["user-tenants"],
    queryFn: () => fetchUserTenantsServer(),
  });

  const list =
    memberships.length > 0
      ? memberships.filter((m) => isTenantStaffRole(m.role)).map((m) => m.tenant)
      : isBrowserDemoEnabled()
        ? listAllDemoTenants()
        : listFallbackTenants();

  return (
    <div className="min-h-screen bg-[#F6F7F9] px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex justify-center">
          <NorfoodLogo size="lg" />
        </div>
        <h1 className="text-2xl font-semibold text-[#111111]">Selecionar empresa</h1>
        <p className="mt-1 text-sm text-[#6B7280]">Escolha qual restaurante deseja acessar</p>

        {isLoading ? (
          <div className="mt-8 flex justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-[#FF7A00] border-t-transparent" />
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {list.map((tenant) => (
              <div
                key={tenant.slug}
                className="flex items-center gap-4 rounded-xl border border-[#E5E7EB] bg-white p-4"
              >
                {tenant.logo_url ? (
                  <img
                    src={tenant.logo_url}
                    alt=""
                    className="size-12 shrink-0 object-contain"
                  />
                ) : (
                  <div
                    className="grid size-12 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
                    style={{ backgroundColor: tenant.primary_color }}
                  >
                    {tenant.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#111111]">{tenant.name}</p>
                  <p className="text-sm text-[#6B7280]">{tenant.subtitle}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <Link
                    to={tenantPath(tenant.slug, "dashboard")}
                    className="rounded-lg bg-[#111111] px-3 py-1.5 text-center text-xs font-medium text-white"
                  >
                    Painel
                  </Link>
                  <Link
                    to={lojaPath(tenant.slug)}
                    className="rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-center text-xs font-medium"
                  >
                    Loja
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-sm text-[#6B7280]">
          <Link to="/">← Voltar ao início</Link>
        </p>
      </div>
    </div>
  );
}
