import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { DEFAULT_TENANT_SLUG } from "@/lib/tenant/constants";

export const Route = createFileRoute("/loja")({
  beforeLoad: ({ location }) => {
    const path = location.pathname.replace(/\/$/, "");
    if (path !== "/loja") return;
    throw redirect({
      to: "/loja/$tenantSlug",
      params: { tenantSlug: DEFAULT_TENANT_SLUG },
    });
  },
  component: () => <Outlet />,
});
