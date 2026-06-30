import { createFileRoute, Navigate } from "@tanstack/react-router";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { useTenantOptional } from "@/lib/tenant/tenant-context";

function CategoriasRedirect() {
  const slug = useTenantOptional()?.tenant.slug;
  const to = slug ? tenantPath(slug, "produtos") : "/painel/produtos";
  return <Navigate to={to} search={{ tab: "categorias" }} replace />;
}

export const Route = createFileRoute("/_authenticated/painel/produtos/categorias")({
  component: CategoriasRedirect,
});
