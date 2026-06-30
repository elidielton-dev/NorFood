import type { SupabaseClient } from "@supabase/supabase-js";

/** Papéis legados que liberam o painel completo (is_staff + APIs server-side). */
const OWNER_LEGACY_ROLES = ["admin", "gerente"] as const;

/**
 * Vincula o proprietário à empresa e garante papéis de administrador no painel.
 */
export async function registerOwnerAsColaboradorAdmin(
  supabaseAdmin: SupabaseClient,
  tenantId: string,
  userId: string,
) {
  const now = new Date().toISOString();

  const { error: linkError } = await supabaseAdmin.from("tenant_users").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      role: "owner",
      status: "active",
      updated_at: now,
    },
    { onConflict: "tenant_id,user_id,role" },
  );
  if (linkError) throw linkError;

  for (const role of OWNER_LEGACY_ROLES) {
    const { error: roleError } = await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role },
      { onConflict: "user_id,role" },
    );
    if (roleError) throw roleError;
  }
}

/** Garante que proprietários existentes tenham acesso administrativo completo. */
export async function ensureOwnerFullSystemAccess(
  supabaseAdmin: SupabaseClient,
  userId: string,
) {
  for (const role of OWNER_LEGACY_ROLES) {
    const { error } = await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role },
      { onConflict: "user_id,role" },
    );
    if (error) throw error;
  }
}
