import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchUserRoles } from "@/lib/api/auth/auth-helpers.server";
import {
  formatPhone,
  isStrongPassword,
  isValidEmail,
  normalizePhoneDigits,
  STAFF_ROLE_VALUES,
  type StaffRole,
} from "@/lib/colaboradores/colaboradores";

export type ColaboradorRow = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  roles: string[];
};

export type SaveColaboradorPayload = {
  id?: string | null;
  nome: string;
  email: string;
  telefone: string;
  password?: string;
  roles: StaffRole[];
  tenantId?: string | null;
};

const STAFF_TENANT_ROLES = [
  "owner",
  "admin",
  "gerente",
  "atendente",
  "cozinha",
  "entregador",
  "financeiro",
] as const;

function mapTenantRoleToStaffRole(role: string): StaffRole | null {
  if (role === "entregador") return "motoboy";
  if (STAFF_ROLE_VALUES.includes(role as StaffRole)) return role as StaffRole;
  if (role === "atendente") return "garcom";
  if (role === "cozinha") return "cozinha";
  if (role === "admin" || role === "owner" || role === "gerente") return "admin";
  return null;
}

function displayRolesForMember(tenantRole: string, staffRoles: string[]) {
  if (tenantRole === "owner") return ["owner"];
  if (staffRoles.length > 0) return staffRoles;
  const fallback = mapTenantRoleToStaffRole(tenantRole);
  return fallback ? [fallback] : [];
}

async function loadColaboradorRow(
  userId: string,
  tenantId?: string,
): Promise<ColaboradorRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }, authResult] =
    await Promise.all([
      supabaseAdmin.from("profiles").select("id, nome, telefone").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin.auth.admin.getUserById(userId),
    ]);

  if (profileError) throw profileError;
  if (rolesError) throw rolesError;
  if (authResult.error) throw authResult.error;
  if (!profile) return null;

  let staffRoles = (roles ?? [])
    .map((row) => row.role)
    .filter((role) => STAFF_ROLE_VALUES.includes(role as StaffRole));

  if (tenantId) {
    const { data: membership } = await supabaseAdmin
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("status", "active")
      .in("role", [...STAFF_TENANT_ROLES])
      .maybeSingle();

    if (membership?.role === "owner") {
      return {
        id: profile.id,
        nome: profile.nome,
        email: authResult.data.user?.email ?? null,
        telefone: profile.telefone,
        roles: ["owner"],
      };
    }

    if (staffRoles.length === 0) {
      const fallback = mapTenantRoleToStaffRole(membership?.role ?? "");
      if (fallback) staffRoles = [fallback];
    }
  }

  if (staffRoles.length === 0) return null;

  return {
    id: profile.id,
    nome: profile.nome,
    email: authResult.data.user?.email ?? null,
    telefone: profile.telefone,
    roles: staffRoles,
  };
}

async function assertPhoneAvailable(phoneDigits: string, ignoreUserId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profiles, error } = await supabaseAdmin.from("profiles").select("id, telefone");
  if (error) throw error;

  const conflict = (profiles ?? []).find(
    (profile) =>
      profile.id !== ignoreUserId && normalizePhoneDigits(profile.telefone ?? "") === phoneDigits,
  );
  if (conflict) throw new Error("Ja existe um colaborador com esse telefone.");
}

async function syncStaffRoles(userId: string, roles: StaffRole[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { error: deleteError } = await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .in("role", [...STAFF_ROLE_VALUES, "cliente"]);
  if (deleteError) throw deleteError;

  const { error: insertError } = await supabaseAdmin.from("user_roles").insert(
    roles.map((role) => ({
      user_id: userId,
      role,
    })),
  );
  if (insertError) throw insertError;
}

async function assertCanManageColaboradores(userId: string, tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "gerente"])
    .maybeSingle();
  if (error) throw error;
  if (data) return;

  const roles = await fetchUserRoles(userId);
  if (roles.includes("admin") || roles.includes("gerente")) return;

  throw new Error("Voce nao tem permissao para gerenciar colaboradores nesta empresa.");
}

function mapStaffRolesToTenantRoles(roles: StaffRole[]) {
  const mapped = new Set<(typeof STAFF_TENANT_ROLES)[number]>();
  for (const role of roles) {
    if (role === "admin") mapped.add("admin");
    else if (role === "gerente") mapped.add("gerente");
    else if (role === "garcom") mapped.add("atendente");
    else if (role === "cozinha") mapped.add("cozinha");
    else if (role === "motoboy") mapped.add("entregador");
  }
  return [...mapped];
}

const MANAGED_TENANT_ROLES = [
  "admin",
  "gerente",
  "atendente",
  "cozinha",
  "entregador",
] as const;

async function syncColaboradorTenantAccess(
  userId: string,
  tenantId: string,
  roles: StaffRole[],
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const desiredRoles = mapStaffRolesToTenantRoles(roles);
  if (!desiredRoles.length) {
    throw new Error("Selecione pelo menos um papel com acesso ao restaurante.");
  }

  const rolesToRemove = MANAGED_TENANT_ROLES.filter((role) => !desiredRoles.includes(role));
  if (rolesToRemove.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from("tenant_users")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .in("role", [...rolesToRemove]);
    if (deleteError) throw deleteError;
  }

  const now = new Date().toISOString();
  for (const role of desiredRoles) {
    const { error } = await supabaseAdmin.from("tenant_users").upsert(
      {
        tenant_id: tenantId,
        user_id: userId,
        role,
        status: "active",
        updated_at: now,
      },
      { onConflict: "tenant_id,user_id,role" },
    );
    if (error) throw error;
  }

  if (roles.includes("motoboy")) {
    const { data: existingProfile, error: profileSelectError } = await supabaseAdmin
      .from("entregador_perfis" as never)
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileSelectError) throw profileSelectError;

    const riderPatch: Record<string, unknown> = {
      user_id: userId,
      tenant_id: tenantId,
    };
    if (!existingProfile) {
      riderPatch.avatar_url = null;
    }

    const { error: riderProfileError } = await supabaseAdmin
      .from("entregador_perfis" as never)
      .upsert(riderPatch, { onConflict: "user_id" });
    if (riderProfileError) throw riderProfileError;
  } else {
    const { error: riderDeleteError } = await supabaseAdmin
      .from("entregador_perfis" as never)
      .delete()
      .eq("user_id", userId);
    if (riderDeleteError) throw riderDeleteError;
  }
}

function validatePayload(payload: SaveColaboradorPayload, isCreate: boolean) {
  if (!payload.nome.trim()) throw new Error("Informe o nome do colaborador.");
  if (!isValidEmail(payload.email)) throw new Error("Informe um e-mail valido.");
  if (normalizePhoneDigits(payload.telefone).length < 10) {
    throw new Error("Informe um telefone com DDD valido.");
  }
  if (!payload.roles.length) throw new Error("Selecione pelo menos um papel.");
  if (payload.roles.some((role) => !STAFF_ROLE_VALUES.includes(role))) {
    throw new Error("Papel invalido selecionado.");
  }

  if (isCreate) {
    if (!payload.password?.trim()) throw new Error("Informe uma senha inicial.");
    if (!isStrongPassword(payload.password)) {
      throw new Error("A senha precisa ter pelo menos 6 caracteres, com letras e numeros.");
    }
  } else if (payload.password?.trim() && !isStrongPassword(payload.password)) {
    throw new Error("A nova senha precisa ter pelo menos 6 caracteres, com letras e numeros.");
  }
}

async function assertColaboradorInTenant(userId: string, tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", [...STAFF_TENANT_ROLES])
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Colaborador nao pertence a este restaurante.");
}

export const fetchColaboradoresServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<ColaboradorRow[]> => {
    const { resolveStaffTenantId } = await import("@/lib/api/auth/auth-helpers.server");
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from("tenant_users")
      .select("user_id, role")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("role", [...STAFF_TENANT_ROLES]);

    if (membershipsError) throw membershipsError;

    const userIds = [...new Set((memberships ?? []).map((row) => row.user_id))];
    if (userIds.length === 0) return [];

    const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, nome, telefone").in("id", userIds),
        supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds)
          .in("role", STAFF_ROLE_VALUES),
      ]);

    if (profilesError) throw profilesError;
    if (rolesError) throw rolesError;

    const rolesByUser = new Map<string, string[]>();
    for (const row of roles ?? []) {
      const current = rolesByUser.get(row.user_id) ?? [];
      current.push(row.role);
      rolesByUser.set(row.user_id, current);
    }

    const tenantRoleByUser = new Map<string, string>();
    for (const membership of memberships ?? []) {
      const existing = tenantRoleByUser.get(membership.user_id);
      if (!existing || membership.role === "owner") {
        tenantRoleByUser.set(membership.user_id, membership.role);
      }
    }

    const rows = await Promise.all(
      (profiles ?? []).map(async (profile) => {
        const authResult = await supabaseAdmin.auth.admin.getUserById(profile.id);
        if (authResult.error) throw authResult.error;

        const staffRoles = rolesByUser.get(profile.id) ?? [];
        const tenantRole = tenantRoleByUser.get(profile.id) ?? "";
        const displayRoles = displayRolesForMember(tenantRole, staffRoles);

        return {
          id: profile.id,
          nome: profile.nome,
          email: authResult.data.user?.email ?? null,
          telefone: profile.telefone,
          roles: displayRoles,
        };
      }),
    );

    return rows
      .filter((row) => row.roles.length > 0)
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  });

export const fetchColaboradorServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; tenantSlug: string }) => input)
  .handler(async ({ context, data }): Promise<ColaboradorRow> => {
    const { resolveStaffTenantId } = await import("@/lib/api/auth/auth-helpers.server");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    await assertColaboradorInTenant(data.id, tenantId);
    const colaborador = await loadColaboradorRow(data.id, tenantId);
    if (!colaborador) throw new Error("Colaborador nao encontrado.");
    return colaborador;
  });

export const saveColaboradorServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SaveColaboradorPayload) => input)
  .handler(async ({ context, data }): Promise<ColaboradorRow> => {
    const isCreate = !data.id;
    validatePayload(data, isCreate);

    const nome = data.nome.trim();
    const email = data.email.trim().toLowerCase();
    const telefone = formatPhone(data.telefone);
    const phoneDigits = normalizePhoneDigits(telefone);
    const tenantId = data.tenantId?.trim() || null;

    if (!tenantId) {
      throw new Error("Informe a empresa para cadastrar o colaborador.");
    }
    await assertCanManageColaboradores(context.userId, tenantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (isCreate) {
      await assertPhoneAvailable(phoneDigits);

      const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password!.trim(),
        email_confirm: true,
        user_metadata: {
          nome,
          telefone,
        },
      });
      if (createError) throw createError;

      const userId = createdUser.user?.id;
      if (!userId) throw new Error("Nao foi possivel criar o colaborador.");

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        nome,
        telefone,
        updated_at: new Date().toISOString(),
      });
      if (profileError) throw profileError;

      await syncStaffRoles(userId, data.roles);
      await syncColaboradorTenantAccess(userId, tenantId, data.roles);

      const colaborador = await loadColaboradorRow(userId, tenantId);
      if (!colaborador) throw new Error("Colaborador criado, mas nao foi possivel recarregar.");
      return colaborador;
    }

    const userId = data.id!;
    const existing = await loadColaboradorRow(userId, tenantId);
    if (!existing) throw new Error("Colaborador nao encontrado.");

    await assertPhoneAvailable(phoneDigits, userId);

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        nome,
        telefone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (profileError) throw profileError;

    if (data.password?.trim()) {
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password.trim(),
      });
      if (passwordError) throw passwordError;
    }

    await syncStaffRoles(userId, data.roles);
    await syncColaboradorTenantAccess(userId, tenantId, data.roles);

    const colaborador = await loadColaboradorRow(userId, tenantId);
    if (!colaborador) throw new Error("Colaborador atualizado, mas nao foi possivel recarregar.");
    return colaborador;
  });
