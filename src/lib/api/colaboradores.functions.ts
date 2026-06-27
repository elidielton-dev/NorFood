import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertManagerUserId, assertStaffUserId } from "@/lib/api/auth-helpers.server";
import {
  formatPhone,
  isStrongPassword,
  isValidEmail,
  normalizePhoneDigits,
  STAFF_ROLE_VALUES,
  type StaffRole,
} from "@/lib/colaboradores";

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

async function loadColaboradorRow(userId: string): Promise<ColaboradorRow | null> {
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

  const staffRoles = (roles ?? [])
    .map((row) => row.role)
    .filter((role) => STAFF_ROLE_VALUES.includes(role as StaffRole));

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

async function assertManagerTenantAccess(managerId: string, tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenant_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", managerId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "gerente"])
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Voce nao tem permissao para gerenciar colaboradores nesta empresa.");
}

async function syncMotoboyTenantAccess(userId: string, tenantId: string, isMotoboy: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (!isMotoboy) {
    await supabaseAdmin
      .from("tenant_users")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("role", "entregador");
    return;
  }

  const { error: tenantUserError } = await supabaseAdmin.from("tenant_users").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      role: "entregador",
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,user_id,role" },
  );
  if (tenantUserError) throw tenantUserError;

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

export const fetchColaboradoresServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ColaboradorRow[]> => {
    await assertStaffUserId(context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", STAFF_ROLE_VALUES);

    if (rolesError) throw rolesError;

    const userIds = [...new Set((roles ?? []).map((row) => row.user_id))];
    if (userIds.length === 0) return [];

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, telefone")
      .in("id", userIds);

    if (profilesError) throw profilesError;

    const rolesByUser = new Map<string, string[]>();
    for (const row of roles ?? []) {
      const current = rolesByUser.get(row.user_id) ?? [];
      current.push(row.role);
      rolesByUser.set(row.user_id, current);
    }

    const rows = await Promise.all(
      (profiles ?? []).map(async (profile) => {
        const authResult = await supabaseAdmin.auth.admin.getUserById(profile.id);
        if (authResult.error) throw authResult.error;

        return {
          id: profile.id,
          nome: profile.nome,
          email: authResult.data.user?.email ?? null,
          telefone: profile.telefone,
          roles: rolesByUser.get(profile.id) ?? [],
        };
      }),
    );

    return rows.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  });

export const fetchColaboradorServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }): Promise<ColaboradorRow> => {
    await assertStaffUserId(context.userId);
    const colaborador = await loadColaboradorRow(data.id);
    if (!colaborador) throw new Error("Colaborador nao encontrado.");
    return colaborador;
  });

export const saveColaboradorServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SaveColaboradorPayload) => input)
  .handler(async ({ context, data }): Promise<ColaboradorRow> => {
    await assertManagerUserId(context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isCreate = !data.id;
    validatePayload(data, isCreate);

    const nome = data.nome.trim();
    const email = data.email.trim().toLowerCase();
    const telefone = formatPhone(data.telefone);
    const phoneDigits = normalizePhoneDigits(telefone);
    const isMotoboy = data.roles.includes("motoboy");
    const tenantId = data.tenantId?.trim() || null;

    if (isMotoboy) {
      if (!tenantId) {
        throw new Error("Informe a empresa para cadastrar um entregador.");
      }
      await assertManagerTenantAccess(context.userId, tenantId);
    }

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
        ...(isMotoboy ? { avatar_url: null } : {}),
        updated_at: new Date().toISOString(),
      });
      if (profileError) throw profileError;

      await syncStaffRoles(userId, data.roles);
      if (isMotoboy && tenantId) {
        await syncMotoboyTenantAccess(userId, tenantId, true);
      }

      const colaborador = await loadColaboradorRow(userId);
      if (!colaborador) throw new Error("Colaborador criado, mas nao foi possivel recarregar.");
      return colaborador;
    }

    const userId = data.id!;
    const existing = await loadColaboradorRow(userId);
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
    if (tenantId) {
      await syncMotoboyTenantAccess(userId, tenantId, isMotoboy);
    } else if (isMotoboy) {
      throw new Error("Informe a empresa para cadastrar um entregador.");
    }

    const colaborador = await loadColaboradorRow(userId);
    if (!colaborador) throw new Error("Colaborador atualizado, mas nao foi possivel recarregar.");
    return colaborador;
  });
