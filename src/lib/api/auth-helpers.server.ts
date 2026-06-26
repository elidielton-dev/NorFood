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

export async function assertStaffUserId(userId: string, message = "Acesso restrito ao painel.") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("is_staff", { _user_id: userId });
  if (error) throw error;
  if (!data) throw new Error(message);
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
  if (!roles.includes("admin") && !roles.includes("gerente")) {
    throw new Error(message);
  }
}
