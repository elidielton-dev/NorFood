import { createServerFn } from "@tanstack/react-start";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth.server";
import {
  getUserEmail,
  isPlatformAdminEmailOnServer,
  isServerDemoAdminMode,
} from "@/lib/platform-admin/auth.server";
import { isValidTenantSlug, slugifyTenantName } from "@/lib/platform-admin/slug";
import { assertCanCreateTenant } from "@/lib/platform/platform-limits";
import { listFallbackTenants } from "@/lib/tenant/tenants-fallback";
import { upsertTenantBillingRecord } from "@/lib/api/platform-billing.functions";
import type { BillingModel, BillingPlanId } from "@/lib/platform/billing-plans";
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
  created_at: string | null;
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

  if (!data?.user_id) return { owner_email: null, owner_name: null };

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
  const email = userData.user?.email ?? null;
  const name =
    (userData.user?.user_metadata?.name as string | undefined) ??
    userData.user?.user_metadata?.full_name ??
    null;
  return { owner_email: email, owner_name: name };
}

function mapTenantRow(
  row: Record<string, unknown>,
  owner?: { owner_email: string | null; owner_name: string | null },
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
    created_at: (row.created_at as string | null) ?? null,
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

  const { error: linkError } = await supabaseAdmin.from("tenant_users").upsert(
    {
      tenant_id: tenantId,
      user_id: userId!,
      role: "owner",
      status: "active",
    },
    { onConflict: "tenant_id,user_id,role" },
  );
  if (linkError) throw linkError;
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
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return;

  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("no auth");

  const token = authHeader.replace("Bearer ", "");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.auth.getClaims(token);
  if (!data?.claims?.sub) throw new Error("invalid");

  const email =
    (data.claims.email as string | undefined)?.toLowerCase() ??
    (await getUserEmail(data.claims.sub));
  if (!isPlatformAdminEmailOnServer(email)) throw new Error("not admin");
}
