import type { Enums } from "@/integrations/supabase/types";

export type AppRole = Enums<"app_role">;

const STAFF_ROLES: AppRole[] = ["garcom", "cozinha", "motoboy", "gerente", "admin"];

export function isStaffRole(roles: AppRole[]) {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

export function isMotoboyRole(roles: AppRole[]) {
  return roles.includes("motoboy");
}

export async function fetchUserRoles(userId: string): Promise<AppRole[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.role);
}

export async function isPlatformAdminUserId(userId: string): Promise<boolean> {
  const { getUserEmail, isPlatformAdminEmailOnServer } = await import(
    "@/lib/platform-admin/auth.server"
  );
  const email = await getUserEmail(userId);
  return isPlatformAdminEmailOnServer(email);
}

async function hasTenantStaffMembership(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isTenantStaffRole } = await import("@/lib/tenant/tenant-permissions");
  type TenantRole = import("@/lib/tenant/types").TenantRole;

  const { data: memberships, error } = await supabaseAdmin
    .from("tenant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;

  return (memberships ?? []).some((row) => isTenantStaffRole(row.role as TenantRole));
}

export async function assertStaffUserId(userId: string, message = "Acesso restrito ao painel.") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
  if (error) throw error;
  if (data) return;
  if (await isPlatformAdminUserId(userId)) return;
  if (await hasTenantStaffMembership(userId)) return;
  throw new Error(message);
}

export async function assertMotoboyOrStaffUserId(
  userId: string,
  message = "Acesso restrito a entregadores.",
) {
  const roles = await fetchUserRoles(userId);
  if (!isStaffRole(roles) && !isMotoboyRole(roles)) {
    throw new Error(message);
  }
}

export async function assertManagerUserId(
  userId: string,
  message = "Apenas administradores e gerentes podem gerenciar colaboradores.",
) {
  const roles = await fetchUserRoles(userId);
  if (roles.includes("admin") || roles.includes("gerente")) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isTenantManagementRole } = await import("@/lib/tenant/tenant-permissions");
  type TenantRole = import("@/lib/tenant/types").TenantRole;

  const { data: memberships, error } = await supabaseAdmin
    .from("tenant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw error;

  if ((memberships ?? []).some((row) => isTenantManagementRole(row.role as TenantRole))) {
    return;
  }

  throw new Error(message);
}

/** Resolve o tenant do painel a partir do slug da URL (ou primeira empresa do usuário). */
export async function resolveStaffTenantId(
  userId: string,
  tenantSlug?: string | null,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isTenantStaffRole } = await import("@/lib/tenant/tenant-permissions");
  type TenantRole = import("@/lib/tenant/types").TenantRole;

  async function assertCanAccessTenant(tenantId: string) {
    const { data: membership, error } = await supabaseAdmin
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;

    if (membership && isTenantStaffRole(membership.role as TenantRole)) {
      return;
    }

    const { data: isStaff, error: staffError } = await supabaseAdmin.rpc("is_staff", {
      _user_id: userId,
    });
    if (staffError) throw staffError;
    if (isStaff) return;

    throw new Error("Sem permissão para acessar este restaurante.");
  }

  if (tenantSlug?.trim()) {
    const slug = tenantSlug.trim();
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant?.id) throw new Error("Restaurante não encontrado.");
    if (await isPlatformAdminUserId(userId)) return tenant.id;
    await assertCanAccessTenant(tenant.id);
    return tenant.id;
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;

  if (membership?.tenant_id && isTenantStaffRole(membership.role as TenantRole)) {
    return membership.tenant_id;
  }

  throw new Error("Informe o restaurante para esta operação.");
}
