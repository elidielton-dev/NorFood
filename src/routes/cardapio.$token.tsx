import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppAbelhaMel } from "@/components/app-abelha-mel";
import { resolveMesaByToken } from "@/lib/api/mesa-order.functions";
import { fetchTenantBySlugServer } from "@/lib/api/tenant.functions";
import { TenantProvider } from "@/lib/tenant/tenant-context";

/**
 * Cardapio QR Code: cliente escaneia o QR da mesa e pede direto da mesa.
 */
export const Route = createFileRoute("/cardapio/$token")({
  ssr: false,
  beforeLoad: async ({ params }) => {
    const mesa = await resolveMesaByToken({ data: { qrcodeToken: params.token } });
    if (!mesa.tenant_slug) throw redirect({ to: "/" });

    const tenant = await fetchTenantBySlugServer({ data: mesa.tenant_slug });
    if (!tenant) throw redirect({ to: "/" });

    return { routeTenant: tenant, mesaContext: mesa };
  },
  head: () => ({
    meta: [
      { title: "Cardápio QR — NorFood" },
      { name: "description", content: "Faca seu pedido direto da mesa." },
    ],
  }),
  component: CardapioMesaPage,
});

function CardapioMesaPage() {
  const { token } = Route.useParams();
  const { routeTenant } = Route.useRouteContext();

  return (
    <TenantProvider slug={routeTenant.slug} initialTenant={routeTenant}>
      <AppAbelhaMel mesaToken={token} menuSourceLabel="mesa" />
    </TenantProvider>
  );
}
