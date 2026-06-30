import { createFileRoute, redirect, Outlet, useLocation } from "@tanstack/react-router";
import { getAuthenticatedSession } from "@/lib/auth-session";
import { fetchCurrentUserRoles, isStaffRole } from "@/lib/auth-roles";
import { fetchTenantBySlugServer, fetchUserTenantsServer } from "@/lib/api/tenant.functions";
import { TenantProvider } from "@/lib/tenant/tenant-context";
import { PainelShell } from "@/components/painel/painel-shell";
import { isTenantStaffRole } from "@/lib/tenant/tenant-permissions";
import type { TenantRole } from "@/lib/tenant/types";
import { isBrowserDemoEnabled, hasBrowserSupabaseConfig } from "@/lib/runtime";
import { currentPathForLoginRedirect } from "@/lib/login-redirect";
import { checkCurrentUserPlatformAdmin } from "@/lib/platform-admin/client";

export const Route = createFileRoute("/t/$tenantSlug")({
  beforeLoad: async ({ params, location }) => {
    const tenant = await fetchTenantBySlugServer({ data: params.tenantSlug });
    if (!tenant) {
      throw redirect({ to: "/" });
    }

    const routeTenant = tenant;
    const isPublicEntregadores = /\/entregadores\/?$/.test(location.pathname);
    if (isPublicEntregadores) {
      return { userRole: null, publicEntregadores: true as const, routeTenant };
    }

    if (!hasBrowserSupabaseConfig() && isBrowserDemoEnabled()) {
      return { userRole: "admin" as TenantRole, publicEntregadores: false as const, routeTenant };
    }

    const session = await getAuthenticatedSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: currentPathForLoginRedirect(location.pathname, location.searchStr) },
      });
    }

    let memberships;
    try {
      memberships = await fetchUserTenantsServer();
    } catch {
      throw redirect({
        to: "/login",
        search: { redirect: currentPathForLoginRedirect(location.pathname, location.searchStr) },
      });
    }

    const isPlatformAdmin = await checkCurrentUserPlatformAdmin();
    if (isPlatformAdmin) {
      return {
        userRole: "admin" as TenantRole,
        publicEntregadores: false as const,
        routeTenant,
      };
    }

    const membership = memberships.find((m) => m.tenant.slug === params.tenantSlug);

    if (membership && isTenantStaffRole(membership.role)) {
      return {
        userRole: membership.role as TenantRole,
        publicEntregadores: false as const,
        routeTenant,
      };
    }

    if (memberships.length > 0) {
      throw redirect({ to: "/selecionar-empresa" });
    }

    if (isBrowserDemoEnabled()) {
      return { userRole: "admin" as TenantRole, publicEntregadores: false as const, routeTenant };
    }

    const legacyRoles = await fetchCurrentUserRoles();
    if (isStaffRole(legacyRoles)) {
      return { userRole: "admin" as TenantRole, publicEntregadores: false as const, routeTenant };
    }

    throw redirect({ to: "/" });
  },
  component: TenantPainelLayout,
});

function TenantPainelLayout() {
  const { tenantSlug } = Route.useParams();
  const { userRole, publicEntregadores, routeTenant } = Route.useRouteContext();
  const location = useLocation();
  const isPublicEntregadores =
    publicEntregadores || /\/entregadores\/?$/.test(location.pathname);

  if (isPublicEntregadores) {
    return (
      <TenantProvider slug={tenantSlug} initialTenant={routeTenant}>
        <Outlet />
      </TenantProvider>
    );
  }

  return (
    <TenantProvider slug={tenantSlug} initialTenant={routeTenant}>
      <PainelShell tenantSlug={tenantSlug} userRole={userRole!} />
    </TenantProvider>
  );
}
