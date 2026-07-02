import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ResellerAuthContext = {
  userId: string;
  resellerId: string;
  resellerRole: string;
};

async function resolveUserResellerMembership(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("reseller_users")
    .select("reseller_id, role, status, resellers!inner(status)")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const reseller = data.resellers as { status: string } | { status: string }[] | null;
  const resellerStatus = Array.isArray(reseller) ? reseller[0]?.status : reseller?.status;
  if (resellerStatus !== "active") return null;
  return { resellerId: data.reseller_id as string, role: data.role as string };
}

export const requireResellerStaff = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const membership = await resolveUserResellerMembership(context.userId);
    if (!membership) {
      throw new Error("Acesso restrito ao painel da revendedora.");
    }
    return next({
      context: {
        ...context,
        resellerId: membership.resellerId,
        resellerRole: membership.role,
      },
    });
  });

export async function assertResellerCanAccessTenant(resellerId: string, tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id, reseller_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.reseller_id !== resellerId) {
    throw new Error("Restaurante nao encontrado na carteira desta revendedora.");
  }
}

export async function assertResellerQuota(resellerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: reseller, error: resellerError }, { count, error: countError }] = await Promise.all([
    supabaseAdmin.from("resellers").select("max_tenants, status").eq("id", resellerId).maybeSingle(),
    supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("reseller_id", resellerId)
      .not("status", "eq", "suspended"),
  ]);
  if (resellerError) throw resellerError;
  if (countError) throw countError;
  if (!reseller) throw new Error("Revendedora nao encontrada.");
  if (reseller.status !== "active") throw new Error("Revendedora inativa ou suspensa.");
  if ((count ?? 0) >= reseller.max_tenants) {
    throw new Error("Limite de licencas da revendedora atingido.");
  }
}

export async function isPlatformAdminUserId(userId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = data.user?.email ?? "";
    const { isPlatformAdminEmail } = await import("@/lib/platform-admin/emails");
    return isPlatformAdminEmail(email);
  } catch {
    return false;
  }
}

export async function resolveResellerOrPlatformForTenant(userId: string, tenantId: string) {
  if (await isPlatformAdminUserId(userId)) {
    return { actorType: "platform" as const, resellerId: null as string | null };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("reseller_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.reseller_id) throw new Error("Restaurante sem revendedora vinculada.");
  const membership = await resolveUserResellerMembership(userId);
  if (!membership || membership.resellerId !== tenant.reseller_id) {
    throw new Error("Sem permissao para acessar este restaurante.");
  }
  return { actorType: "reseller" as const, resellerId: membership.resellerId };
}
