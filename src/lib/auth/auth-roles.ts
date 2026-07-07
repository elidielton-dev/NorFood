import { supabase } from "@/integrations/supabase/client";
import { getAuthenticatedUser } from "@/lib/auth/auth-session";
import type { Enums } from "@/integrations/supabase/types";
import { fetchUserTenantsServer } from "@/lib/api/tenant/tenant.functions";
import { checkCurrentUserPlatformAdmin } from "@/lib/platform-admin/client";
import { NORFOOD_DEMO_TENANT_SLUG } from "@/lib/tenant/constants";
import { isTenantStaffRole } from "@/lib/tenant/tenant-permissions";
import { isBrowserDemoEnabled } from "@/lib/shared/runtime";
import { sanitizeLoginRedirect } from "@/lib/auth/login-redirect";

export type AppRole = Enums<"app_role">;

const STAFF_ROLES: AppRole[] = ["garcom", "cozinha", "motoboy", "gerente", "admin"];

export function isStaffRole(roles: AppRole[]) {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

export function isMotoboyRole(roles: AppRole[]) {
  return roles.includes("motoboy");
}

export async function fetchCurrentUserRoles(): Promise<AppRole[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (error) {
    console.warn("[fetchCurrentUserRoles]", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.role);
}

function isManagementRole(roles: AppRole[]) {
  return roles.includes("gerente") || roles.includes("admin");
}

export async function resolveLoginDestination(redirectTo?: string): Promise<string> {
  const safe = sanitizeLoginRedirect(redirectTo);
  if (safe) return safe;
  return resolvePostLoginRoute();
}

export async function resolvePostLoginRoute(): Promise<string> {
  try {
    const { checkResellerAccessServer } = await import("@/lib/api/plataforma/platform-reseller.functions");
    const resellerAccess = await checkResellerAccessServer();
    if (resellerAccess.allowed) {
      return "/parceiro";
    }
  } catch {
    // ignore
  }

  if (await checkCurrentUserPlatformAdmin()) {
    return "/admin";
  }

  const roles = await fetchCurrentUserRoles();

  if (isMotoboyRole(roles) && !isManagementRole(roles)) {
    return `/entregador/${NORFOOD_DEMO_TENANT_SLUG}/dashboard`;
  }

  try {
    const memberships = await fetchUserTenantsServer();
    const staffTenants = memberships.filter((m) => isTenantStaffRole(m.role));
    if (staffTenants.length > 1) return "/selecionar-empresa";
    if (staffTenants.length === 1) {
      const tenant = staffTenants[0].tenant;
      if (tenant.status === "suspended") {
        return `/conta-suspensa/${tenant.slug}`;
      }
      return `/t/${tenant.slug}/dashboard`;
    }
  } catch {
    // banco ainda sem tenant_users
  }

  if (isStaffRole(roles) || isBrowserDemoEnabled()) {
    return `/t/${NORFOOD_DEMO_TENANT_SLUG}/dashboard`;
  }
  return "/";
}
