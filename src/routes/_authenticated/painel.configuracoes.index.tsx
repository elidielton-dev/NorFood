import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { getDefaultConfigNavPath } from "@/lib/painel-configuracoes-nav";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { useTenantSlug } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/")({
  beforeLoad: () => {
    throw redirect({ to: `/painel/${getDefaultConfigNavPath()}` });
  },
  component: ConfiguracoesIndexRedirect,
});

function ConfiguracoesIndexRedirect() {
  const slug = useTenantSlug();
  return <Navigate to={tenantPath(slug, getDefaultConfigNavPath())} replace />;
}
