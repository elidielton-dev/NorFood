import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchCurrentUserRoles, isStaffRole } from "@/lib/auth-roles";
import { fetchUserTenantsServer } from "@/lib/api/tenant.functions";
import { TenantProvider } from "@/lib/tenant/tenant-context";
import { PainelShell } from "@/components/painel/painel-shell";
import { resolveTenantBySlug } from "@/lib/platform-admin/demo-tenants-store";
import { isTenantStaffRole } from "@/lib/tenant/tenant-permissions";
import type { TenantRole } from "@/lib/tenant/types";
import { isBrowserDemoEnabled, hasBrowserSupabaseConfig } from "@/lib/runtime";

export const Route = createFileRoute("/t/$tenantSlug")({
  beforeLoad: async ({ params, location }) => {
    const tenant = resolveTenantBySlug(params.tenantSlug);
    if (!tenant) {
      throw redirect({ to: "/" });
    }

    if (!hasBrowserSupabaseConfig() && isBrowserDemoEnabled()) {
      return { userRole: "admin" as TenantRole };
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }

    const memberships = await fetchUserTenantsServer();
    const membership = memberships.find((m) => m.tenant.slug === params.tenantSlug);

    if (membership && isTenantStaffRole(membership.role)) {
      return { userRole: membership.role as TenantRole };
    }

    if (isBrowserDemoEnabled()) {
      return { userRole: "admin" as TenantRole };
    }

    const legacyRoles = await fetchCurrentUserRoles();
    if (isStaffRole(legacyRoles)) {
      return { userRole: "admin" as TenantRole };
    }

    throw redirect({ to: "/" });
  },
  component: TenantPainelLayout,
});

function TenantPainelLayout() {
  const { tenantSlug } = Route.useParams();
  const { userRole } = Route.useRouteContext();

  return (
    <TenantProvider slug={tenantSlug}>
      <PainelShell tenantSlug={tenantSlug} userRole={userRole} />
    </TenantProvider>
  );
}
