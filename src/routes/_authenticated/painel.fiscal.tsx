import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchFiscalSettingsServer } from "@/lib/api/fiscal/fiscal.functions";
import { FiscalAmbienteToggle } from "@/components/fiscal/fiscal-ambiente-toggle";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { tenantQueryKey } from "@/lib/tenant/query-keys";

export const Route = createFileRoute("/_authenticated/painel/fiscal")({
  component: FiscalLayout,
});

function FiscalLayout() {
  const tenantSlug = useTenantSlug();
  const { data: fiscalSettings } = useQuery({
    queryKey: tenantQueryKey("fiscal-settings", tenantSlug),
    queryFn: () => fetchFiscalSettingsServer({ data: tenantSlug! }),
    enabled: Boolean(tenantSlug),
    retry: false,
  });

  const ambiente = fiscalSettings?.config.ambiente ?? "homologacao";

  return (
    <div className="space-y-4">
      {tenantSlug ? <FiscalAmbienteToggle ambiente={ambiente} tenantSlug={tenantSlug} /> : null}
      <Outlet />
    </div>
  );
}
