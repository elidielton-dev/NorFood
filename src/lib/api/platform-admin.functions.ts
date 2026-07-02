import { createServerFn } from "@tanstack/react-start";
import { requirePlatformAdmin, isServerDemoAdminMode } from "@/lib/platform-admin/auth.server";
import { isValidTenantSlug, slugifyTenantName } from "@/lib/platform-admin/slug";
import { assertCanCreateTenant } from "@/lib/platform/platform-limits";
import { listFallbackTenants } from "@/lib/tenant/tenants-fallback";
import { upsertTenantBillingRecord } from "@/lib/api/platform-billing.functions";
import type { BillingModel, BillingPlanId } from "@/lib/platform/billing-plans";
import { NORFOOD_DEMO_TENANT_ID } from "@/lib/tenant/constants";
import type { TenantStatus } from "@/lib/tenant/types";

export type AdminTenantRow = {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  custom_domain: string | null;
  status: TenantStatus;
  timezone: string;
  currency: string;
  owner_email: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  document_type: string | null;
  document_number: string | null;
  city: string | null;
  state: string | null;
  created_at: string | null;
  rejection_reason: string | null;
};

export type CreateTenantAdminPayload = {
  name: string;
  slug: string;
  subtitle?: string;
  primary_color?: string;
  status?: TenantStatus;
  owner_email?: string;
  owner_name?: string;
  owner_password?: string;
  billing_model?: BillingModel;
  billing_plan?: BillingPlanId;
};

export type UpdateTenantAdminPayload = {
  id: string;
  name?: string;
  slug?: string;
  subtitle?: string;
  primary_color?: string;
  status?: TenantStatus;
  custom_domain?: string | null;
};

function isDemoBackend() {
  return (
    process.env.VITE_DEMO_MODE === "true" ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function loadOwnerInfo(tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!data?.user_id) {
    return { owner_email: null, owner_name: null, owner_phone: null };
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
  const email = userData.user?.email ?? null;
  const name =
    (userData.user?.user_metadata?.nome as string | undefined) ??
    (userData.user?.user_metadata?.name as string | undefined) ??
    userData.user?.user_metadata?.full_name ??
    null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("telefone")
    .eq("id", data.user_id)
    .maybeSingle();

  return {
    owner_email: email,
    owner_name: name,
    owner_phone: profile?.telefone ?? (userData.user?.user_metadata?.telefone as string | undefined) ?? null,
  };
}

function mapTenantRow(
  row: Record<string, unknown>,
  owner?: { owner_email: string | null; owner_name: string | null; owner_phone?: string | null },
): AdminTenantRow {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    subtitle: (row.subtitle as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    primary_color: String(row.primary_color ?? "#FF7A00"),
    secondary_color: String(row.secondary_color ?? "#111111"),
    accent_color: String(row.accent_color ?? "#FF5A00"),
    custom_domain: (row.custom_domain as string | null) ?? null,
    status: (row.status as TenantStatus) ?? "active",
    timezone: String(row.timezone ?? "America/Sao_Paulo"),
    currency: String(row.currency ?? "BRL"),
    owner_email: owner?.owner_email ?? null,
    owner_name: owner?.owner_name ?? null,
    owner_phone: owner?.owner_phone ?? null,
    document_type: (row.document_type as string | null) ?? null,
    document_number: (row.document_number as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    rejection_reason: (row.rejection_reason as string | null) ?? null,
  };
}

export const listTenantsAdminServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .handler(async (): Promise<AdminTenantRow[]> => {
    if (isDemoBackend()) {
      return listFallbackTenants().map((t) => ({
        ...t,
        owner_email: t.slug === "norfood" ? "admin@norfood.local" : null,
        owner_name: t.slug === "norfood" ? "Admin Demo" : null,
        owner_phone: null,
        document_type: null,
        document_number: null,
        city: null,
        state: null,
        created_at: null,
      }));
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = await Promise.all(
      (data ?? []).map(async (row) => {
        const owner = await loadOwnerInfo(String(row.id));
        return mapTenantRow(row as Record<string, unknown>, owner);
      }),
    );

    return rows;
  });

export const getTenantAdminServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<AdminTenantRow | null> => {
    if (isDemoBackend()) {
      const tenant = listFallbackTenants().find((t) => t.id === id);
      if (!tenant) return null;
      return {
        ...tenant,
        owner_email: tenant.slug === "norfood" ? "admin@norfood.local" : null,
        owner_name: tenant.slug === "norfood" ? "Admin Demo" : null,
        owner_phone: null,
        document_type: null,
        document_number: null,
        city: null,
        state: null,
        created_at: null,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("tenants").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const owner = await loadOwnerInfo(id);
    return mapTenantRow(data as Record<string, unknown>, owner);
  });

export const suggestTenantSlugServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .validator((name: string) => name)
  .handler(async ({ data: name }): Promise<string> => {
    const base = slugifyTenantName(name) || "empresa";
    if (isDemoBackend()) {
      const exists = listFallbackTenants().some((t) => t.slug === base);
      return exists ? `${base}-${Date.now().toString(36).slice(-4)}` : base;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let candidate = base;
    let suffix = 0;
    while (suffix < 20) {
      const { data } = await supabaseAdmin
        .from("tenants")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!data) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return `${base}-${Date.now().toString(36).slice(-4)}`;
  });

async function ensureTenantOwner(
  tenantId: string,
  input: { email?: string; name?: string; password?: string },
) {
  if (!input.email) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = input.email.trim().toLowerCase();
  const password = input.password?.trim() || "Norfood123!";

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: input.name ?? email.split("@")[0] },
  });

  let userId = created.user?.id;
  if (createError) {
    if (createError.message?.includes("already") || createError.code === "email_exists") {
      const { data: listed } = await supabaseAdmin.auth.admin.listUsers();
      userId = listed.users.find((u) => u.email?.toLowerCase() === email)?.id;
      if (!userId) throw createError;
    } else {
      throw createError;
    }
  }

  await supabaseAdmin.from("profiles").upsert({
    id: userId!,
    nome: input.name ?? email.split("@")[0],
    updated_at: new Date().toISOString(),
  });

  const { registerOwnerAsColaboradorAdmin } = await import("@/lib/tenant/tenant-owner-access.server");
  await registerOwnerAsColaboradorAdmin(supabaseAdmin, tenantId, userId!);
}

export const createTenantAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((payload: CreateTenantAdminPayload) => payload)
  .handler(async ({ data }): Promise<AdminTenantRow> => {
    const slug = data.slug.trim().toLowerCase();
    if (!isValidTenantSlug(slug)) {
      throw new Error("Slug inválido. Use apenas letras minúsculas, números e hífens.");
    }

    if (isDemoBackend()) {
      throw new Error(
        "Modo demo local: empresas criadas aqui são salvas no navegador. Use o fluxo do cliente.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count: tenantCount, error: countError } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true });
    if (countError) throw countError;
    assertCanCreateTenant(tenantCount ?? 0);

    const tenantId = crypto.randomUUID();

    const { error: tenantError } = await supabaseAdmin.from("tenants").insert({
      id: tenantId,
      name: data.name.trim(),
      slug,
      subtitle: data.subtitle?.trim() || null,
      primary_color: data.primary_color ?? "#FF7A00",
      secondary_color: "#111111",
      accent_color: "#FF5A00",
      status: data.status ?? "trial",
      timezone: "America/Sao_Paulo",
      currency: "BRL",
    });
    if (tenantError) throw tenantError;

    const { error: settingsError } = await supabaseAdmin
      .from("tenant_settings")
      .insert({ tenant_id: tenantId });
    if (settingsError) throw settingsError;

    await ensureTenantOwner(tenantId, {
      email: data.owner_email,
      name: data.owner_name,
      password: data.owner_password,
    });

    await upsertTenantBillingRecord(tenantId, {
      billingModel: data.billing_model ?? "monthly",
      plan: data.billing_plan ?? "pro",
    });

    const created = await getTenantAdminServer({ data: tenantId });
    if (!created) throw new Error("Empresa criada mas não encontrada.");
    return created;
  });

export const updateTenantAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((payload: UpdateTenantAdminPayload) => payload)
  .handler(async ({ data }): Promise<AdminTenantRow> => {
    if (isDemoBackend()) {
      throw new Error("Modo demo: edite pelo armazenamento local no navegador.");
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.slug !== undefined) {
      const slug = data.slug.trim().toLowerCase();
      if (!isValidTenantSlug(slug)) throw new Error("Slug inválido.");
      patch.slug = slug;
    }
    if (data.subtitle !== undefined) patch.subtitle = data.subtitle?.trim() || null;
    if (data.primary_color !== undefined) patch.primary_color = data.primary_color;
    if (data.status !== undefined) patch.status = data.status;
    if (data.custom_domain !== undefined) patch.custom_domain = data.custom_domain?.trim() || null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("tenants").update(patch).eq("id", data.id);
    if (error) throw error;

    const updated = await getTenantAdminServer({ data: data.id });
    if (!updated) throw new Error("Empresa não encontrada.");
    return updated;
  });

export const deactivateTenantAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((payload: { tenantId: string; reason?: string }) => payload)
  .handler(async ({ data, context }): Promise<AdminTenantRow> => {
    if (isDemoBackend()) {
      throw new Error("Desativação disponível apenas com Supabase configurado.");
    }
    if (data.tenantId === NORFOOD_DEMO_TENANT_ID) {
      throw new Error("A conta Norfood (demonstração) não pode ser desativada.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyTenantSuspended } = await import("@/lib/signup/tenant-approval-notify.server");

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, status")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!tenant) throw new Error("Empresa não encontrada.");
    if (tenant.status === "suspended") {
      throw new Error("Esta empresa já está desativada.");
    }

    const now = new Date().toISOString();
    const reason =
      data.reason?.trim() ||
      "Conta desativada pelo administrador da plataforma. Entre em contato com suporte@norfood.com.br.";

    const { error: updateError } = await supabaseAdmin
      .from("tenants")
      .update({
        status: "suspended",
        rejection_reason: reason,
        updated_at: now,
      })
      .eq("id", data.tenantId);
    if (updateError) throw updateError;

    const owner = await loadOwnerInfo(data.tenantId);
    if (owner.owner_email) {
      const notifyResult = await notifyTenantSuspended({
        email: owner.owner_email,
        ownerName: owner.owner_name ?? owner.owner_email.split("@")[0],
        restaurantName: tenant.name,
        slug: tenant.slug,
        reason,
        phone: owner.owner_phone,
        kind: "admin",
      });
      if (!notifyResult.email.ok) {
        console.error("[admin] e-mail de suspensão não enviado:", tenant.slug, notifyResult.email);
      }
    } else {
      console.warn("[admin] desativação sem e-mail do owner:", tenant.slug, data.tenantId);
    }

    console.info("[admin] tenant deactivated:", tenant.name, "by", context.userId);
    const updated = await getTenantAdminServer({ data: data.tenantId });
    if (!updated) throw new Error("Empresa não encontrada após desativação.");
    return updated;
  });

export const reactivateTenantAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((payload: { tenantId: string; status?: Extract<TenantStatus, "trial" | "active"> }) => payload)
  .handler(async ({ data, context }): Promise<AdminTenantRow> => {
    if (isDemoBackend()) {
      throw new Error("Reativação disponível apenas com Supabase configurado.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyTenantReactivated } = await import("@/lib/signup/tenant-approval-notify.server");

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, status")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!tenant) throw new Error("Empresa não encontrada.");
    if (tenant.status !== "suspended") {
      throw new Error("Só é possível reativar empresas desativadas.");
    }

    const nextStatus = data.status ?? "trial";
    const now = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("tenants")
      .update({
        status: nextStatus,
        rejection_reason: null,
        rejected_at: null,
        updated_at: now,
      })
      .eq("id", data.tenantId);
    if (updateError) throw updateError;

    const owner = await loadOwnerInfo(data.tenantId);
    if (owner.owner_email) {
      void notifyTenantReactivated({
        email: owner.owner_email,
        ownerName: owner.owner_name ?? owner.owner_email.split("@")[0],
        restaurantName: tenant.name,
        slug: tenant.slug,
        phone: owner.owner_phone,
      }).catch((err) => console.error("[admin] notify reactivated failed:", err));
    }

    console.info("[admin] tenant reactivated:", tenant.name, "as", nextStatus, "by", context.userId);
    const updated = await getTenantAdminServer({ data: data.tenantId });
    if (!updated) throw new Error("Empresa não encontrada após reativação.");
    return updated;
  });

export const approveTenantAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((tenantId: string) => tenantId)
  .handler(async ({ data: tenantId, context }): Promise<AdminTenantRow> => {
    if (isDemoBackend()) {
      throw new Error("Aprovação disponível apenas com Supabase configurado.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyTenantApproved } = await import("@/lib/signup/tenant-approval-notify.server");

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, status")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!tenant) throw new Error("Empresa não encontrada.");
    if (tenant.status !== "pending") {
      throw new Error("Esta empresa não está aguardando aprovação.");
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("tenants")
      .update({
        status: "trial",
        approved_at: now,
        approved_by: context.userId,
        rejected_at: null,
        rejection_reason: null,
        updated_at: now,
      })
      .eq("id", tenantId);
    if (updateError) throw updateError;

    const owner = await loadOwnerInfo(tenantId);
    if (owner.owner_email) {
      const { data: ownerLink } = await supabaseAdmin
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("role", "owner")
        .eq("status", "active")
        .maybeSingle();
      if (ownerLink?.user_id) {
        const { registerOwnerAsColaboradorAdmin } = await import(
          "@/lib/tenant/tenant-owner-access.server"
        );
        await registerOwnerAsColaboradorAdmin(supabaseAdmin, tenantId, ownerLink.user_id);
      }

      const notifyResult = await notifyTenantApproved({
        email: owner.owner_email,
        ownerName: owner.owner_name ?? owner.owner_email.split("@")[0],
        restaurantName: tenant.name,
        slug: tenant.slug,
        phone: owner.owner_phone,
      });
      if (!notifyResult.email.ok) {
        console.error("[admin] e-mail de aprovação não enviado:", tenant.slug, notifyResult.email);
      }
    } else {
      console.warn("[admin] aprovação sem e-mail do owner:", tenant.slug, tenantId);
    }

    const updated = await getTenantAdminServer({ data: tenantId });
    if (!updated) throw new Error("Empresa não encontrada após aprovação.");
    return updated;
  });

export const resendTenantApprovalEmailAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((tenantId: string) => tenantId)
  .handler(async ({ data: tenantId }) => {
    if (isDemoBackend()) {
      throw new Error("Reenvio disponível apenas com Supabase configurado.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyTenantApproved } = await import("@/lib/signup/tenant-approval-notify.server");

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, status")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!tenant) throw new Error("Empresa não encontrada.");
    if (!["trial", "active"].includes(tenant.status)) {
      throw new Error("Só é possível reenviar e-mail para restaurantes já aprovados.");
    }

    const owner = await loadOwnerInfo(tenantId);
    if (!owner.owner_email) throw new Error("E-mail do responsável não encontrado.");

    const result = await notifyTenantApproved({
      email: owner.owner_email,
      ownerName: owner.owner_name ?? owner.owner_email.split("@")[0],
      restaurantName: tenant.name,
      slug: tenant.slug,
      phone: owner.owner_phone,
    });

    if (!result.email.ok) {
      throw new Error("Não foi possível enviar o e-mail de aprovação. Verifique Resend/domínio.");
    }

    return { ok: true as const, emailId: result.email.id };
  });

export const rejectTenantAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((payload: { tenantId: string; reason?: string }) => payload)
  .handler(async ({ data, context }): Promise<AdminTenantRow> => {
    if (isDemoBackend()) {
      throw new Error("Rejeição disponível apenas com Supabase configurado.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyTenantSuspended } = await import("@/lib/signup/tenant-approval-notify.server");

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, status")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!tenant) throw new Error("Empresa não encontrada.");
    if (tenant.status !== "pending") {
      throw new Error("Esta empresa não está aguardando aprovação.");
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("tenants")
      .update({
        status: "suspended",
        rejected_at: now,
        rejection_reason: data.reason?.trim() || null,
        approved_at: null,
        approved_by: context.userId,
        updated_at: now,
      })
      .eq("id", data.tenantId);
    if (updateError) throw updateError;

    const owner = await loadOwnerInfo(data.tenantId);
    const rejectReason =
      data.reason?.trim() || "Cadastro não aprovado pela equipe Norfood neste momento.";
    if (owner.owner_email) {
      void notifyTenantSuspended({
        email: owner.owner_email,
        ownerName: owner.owner_name ?? owner.owner_email.split("@")[0],
        restaurantName: tenant.name,
        slug: tenant.slug,
        reason: rejectReason,
        phone: owner.owner_phone,
        kind: "admin",
      }).catch((err) => console.error("[admin] notify suspended (reject) failed:", err));
    }

    const updated = await getTenantAdminServer({ data: data.tenantId });
    if (!updated) throw new Error("Empresa não encontrada após rejeição.");
    return updated;
  });

export const deleteTenantAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((payload: { tenantId: string; confirmSlug: string }) => payload)
  .handler(async ({ data, context }): Promise<{ ok: true; slug: string }> => {
    if (isDemoBackend()) {
      throw new Error("Exclusão disponível apenas com Supabase configurado.");
    }
    if (data.tenantId === NORFOOD_DEMO_TENANT_ID) {
      throw new Error("A conta Norfood (demonstração) não pode ser excluída.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { purgeTenantData } = await import("@/lib/tenant/tenant-delete.server");

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!tenant) throw new Error("Empresa não encontrada.");

    const confirmSlug = data.confirmSlug.trim().toLowerCase();
    if (confirmSlug !== tenant.slug) {
      throw new Error("Confirmação incorreta. Digite o slug da empresa exatamente como exibido.");
    }

    await purgeTenantData(supabaseAdmin, data.tenantId);

    console.info("[admin] tenant deleted:", tenant.name, tenant.slug, "by", context.userId);
    return { ok: true as const, slug: tenant.slug };
  });

export const checkPlatformAdminAccessServer = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ allowed: boolean; demo: boolean }> => {
    if (isDemoBackend()) return { allowed: true, demo: true };
    try {
      await resolveAuthContextForCheck();
      return { allowed: true, demo: false };
    } catch {
      return { allowed: false, demo: false };
    }
  });

async function resolveAuthContextForCheck() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { resolvePlatformAdminFromBearerToken } = await import("@/lib/platform-admin/auth.server");
  const request = getRequest();
  const session = await resolvePlatformAdminFromBearerToken(request?.headers?.get("authorization") ?? null);
  if (!session.userId || !session.allowed) throw new Error("not admin");
}

export type AdminDashboardAlert = {
  id: string;
  level: "info" | "warning" | "critical";
  title: string;
  description: string;
  href?: string;
};

export type AdminDashboardData = {
  tenants: {
    total: number;
    active: number;
    trial: number;
    pending: number;
    suspended: number;
  };
  resellers: {
    total: number;
    active: number;
    tenantsViaResellers: number;
  };
  capacity: {
    currentTenants: number;
    maxTenants: number;
    remaining: number;
    atLimit: boolean;
    label: string;
    pm2Instances: number;
  };
  billing: {
    estimatedMrr: number;
    pendingCount: number;
    paidCount: number;
  };
  recentTenants: AdminTenantRow[];
  alerts: AdminDashboardAlert[];
};

export const getAdminDashboardServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .handler(async (): Promise<AdminDashboardData> => {
    const tenants = await listTenantsAdminServer();
    const stats = {
      total: tenants.length,
      active: tenants.filter((t) => t.status === "active").length,
      trial: tenants.filter((t) => t.status === "trial").length,
      pending: tenants.filter((t) => t.status === "pending").length,
      suspended: tenants.filter((t) => t.status === "suspended").length,
    };

    let resellers = { total: 0, active: 0, tenantsViaResellers: 0 };
    if (!isDemoBackend()) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: resellerRows } = await supabaseAdmin.from("resellers").select("id, status");
      const list = resellerRows ?? [];
      resellers.total = list.length;
      resellers.active = list.filter((r) => r.status === "active").length;
      const { count } = await supabaseAdmin
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .not("reseller_id", "is", null);
      resellers.tenantsViaResellers = count ?? 0;
    }

    const { getEffectiveMaxTenants, getPlatformCapacityConfig } = await import(
      "@/lib/platform/platform-limits"
    );
    const config = getPlatformCapacityConfig();
    const maxTenants = getEffectiveMaxTenants();
    const currentTenants = stats.total;

    let billing = { estimatedMrr: 0, pendingCount: 0, paidCount: 0 };
    if (!isDemoBackend()) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: billingRows } = await supabaseAdmin
        .from("tenant_billing")
        .select("monthly_price, plan")
        .in(
          "tenant_id",
          tenants.filter((t) => t.status === "active" || t.status === "trial").map((t) => t.id),
        );
      billing.estimatedMrr = (billingRows ?? []).reduce(
        (sum, row) => sum + Number(row.monthly_price ?? 0),
        0,
      );

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const { data: invoices } = await supabaseAdmin
        .from("tenant_billing_invoices")
        .select("status")
        .gte("period_start", periodStart);
      billing.pendingCount = (invoices ?? []).filter((i) =>
        ["draft", "pending", "open"].includes(String(i.status)),
      ).length;
      billing.paidCount = (invoices ?? []).filter((i) => String(i.status) === "paid").length;
    } else {
      billing.estimatedMrr = stats.active * 149.9;
    }

    const alerts: AdminDashboardAlert[] = [];
    if (stats.pending > 0) {
      alerts.push({
        id: "pending-tenants",
        level: "warning",
        title: `${stats.pending} empresa(s) aguardando aprovação`,
        description: "Revise cadastros pendentes para liberar acesso.",
        href: "/admin/aprovacoes",
      });
    }
    if (currentTenants >= maxTenants) {
      alerts.push({
        id: "capacity-full",
        level: "critical",
        title: "Capacidade VPS no limite",
        description: `${currentTenants}/${maxTenants} empresas — considere upgrade ou limpeza.`,
        href: "/admin/sistema",
      });
    } else if (currentTenants >= maxTenants * 0.85) {
      alerts.push({
        id: "capacity-high",
        level: "warning",
        title: "Capacidade VPS alta",
        description: `${currentTenants}/${maxTenants} empresas utilizadas.`,
        href: "/admin/sistema",
      });
    }
    if (billing.pendingCount > 0) {
      alerts.push({
        id: "pending-invoices",
        level: "info",
        title: `${billing.pendingCount} fatura(s) pendentes`,
        description: "Cobranças do mês aguardando pagamento.",
        href: "/admin/faturamento",
      });
    }

    const recentTenants = [...tenants]
      .sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
      })
      .slice(0, 8);

    return {
      tenants: stats,
      resellers,
      capacity: {
        currentTenants,
        maxTenants,
        remaining: Math.max(0, maxTenants - currentTenants),
        atLimit: currentTenants >= maxTenants,
        label: config.label,
        pm2Instances: config.pm2Instances,
      },
      billing,
      recentTenants,
      alerts,
    };
  });
