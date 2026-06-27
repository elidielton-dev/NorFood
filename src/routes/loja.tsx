import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_TENANT_SLUG } from "@/lib/tenant/constants";

export const Route = createFileRoute("/loja")({
  beforeLoad: () => {
    throw redirect({
      to: "/loja/$tenantSlug",
      params: { tenantSlug: DEFAULT_TENANT_SLUG },
    });
  },
});
