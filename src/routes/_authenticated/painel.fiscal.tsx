import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchFiscalSettingsServer } from "@/lib/api/fiscal/fiscal.functions";
import { FiscalAmbienteToggle } from "@/components/fiscal/fiscal-ambiente-toggle";

export const Route = createFileRoute("/_authenticated/painel/fiscal")({
  component: FiscalLayout,
});

function FiscalLayout() {
  const { data: fiscalSettings } = useQuery({
    queryKey: ["fiscal-settings"],
    queryFn: () => fetchFiscalSettingsServer(),
    retry: false,
  });

  const ambiente = fiscalSettings?.config.ambiente ?? "homologacao";

  return (
    <div className="space-y-4">
      <FiscalAmbienteToggle ambiente={ambiente} />
      <Outlet />
    </div>
  );
}
