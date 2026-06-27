import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveTenantBySlug } from "@/lib/platform-admin/demo-tenants-store";
import { TenantProvider } from "@/lib/tenant/tenant-context";
import { AppAbelhaMel } from "@/components/app-abelha-mel";

export const Route = createFileRoute("/loja/$tenantSlug")({
  beforeLoad: ({ params }) => {
    const tenant = resolveTenantBySlug(params.tenantSlug);
    if (!tenant) throw redirect({ to: "/" });
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
  return (
    <TenantProvider slug={tenantSlug}>
      <AppAbelhaMel />
    </TenantProvider>
  );
}
