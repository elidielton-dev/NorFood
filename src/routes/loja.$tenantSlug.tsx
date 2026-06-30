import { createFileRoute, redirect } from "@tanstack/react-router";
import { fetchTenantBySlugServer } from "@/lib/api/tenant.functions";
import { TenantProvider } from "@/lib/tenant/tenant-context";
import { TenantOperationalGate } from "@/components/tenant/tenant-operational-gate";
import { AppAbelhaMel } from "@/components/app-abelha-mel";

export const Route = createFileRoute("/loja/$tenantSlug")({
  beforeLoad: async ({ params }) => {
    const tenant = await fetchTenantBySlugServer({ data: params.tenantSlug });
    if (!tenant) throw redirect({ to: "/" });
    return { routeTenant: tenant };
  },
  head: ({ params }) => ({
    meta: [
      { title: `Cardápio — ${params.tenantSlug}` },
      { name: "description", content: "Peça delivery e acompanhe seu pedido em tempo real." },
      { name: "theme-color", content: "#FF9100" },
    ],
  }),
  component: LojaPage,
});

function LojaPage() {
  const { tenantSlug } = Route.useParams();
  const { routeTenant } = Route.useRouteContext();

  return (
    <TenantProvider slug={tenantSlug} initialTenant={routeTenant}>
      <TenantOperationalGate mode="loja">
        <AppAbelhaMel />
      </TenantOperationalGate>
    </TenantProvider>
  );
}
