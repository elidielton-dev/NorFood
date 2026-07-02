import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth.server";
import { isValidTenantSlug, slugifyTenantName } from "@/lib/platform-admin/slug";
import { upsertTenantBillingRecord } from "@/lib/api/platform-billing.functions";
import { TRIAL_DAYS, type BillingPlanId } from "@/lib/platform/billing-plans";
import { getMonthPeriod } from "@/lib/platform/billing-plans";
import { registerOwnerAsColaboradorAdmin } from "@/lib/tenant/tenant-owner-access.server";
import {
  assertResellerCanAccessTenant,
  assertResellerQuota,
  requireResellerStaff,
} from "@/lib/reseller/reseller-auth.server";
import type {
  ActivationTokenRow,
  ResellerRow,
  ResellerStatus,
  ResellerTenantRow,
} from "@/lib/reseller/types";
import type { BillingModel } from "@/lib/platform/billing-plans";

async function tokenCrypto() {
  const { createHash, randomBytes } = await import("node:crypto");
  return {
    generatePlain() {
      const raw = randomBytes(6).toString("hex").toUpperCase();
      return `NOR-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    },
    hash(token: string) {
      return createHash("sha256").update(token.trim().toUpperCase()).digest("hex");
    },
    prefix(token: string) {
      return token.trim().toUpperCase().slice(0, 12);
    },
  };
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function mapReseller(row: Record<string, unknown>, tenantCount?: number): ResellerRow {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    document_number: (row.document_number as string | null) ?? null,
    contact_email: String(row.contact_email),
    contact_phone: (row.contact_phone as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    status: row.status as ResellerStatus,
    max_tenants: Number(row.max_tenants),
    allowed_plans: (row.allowed_plans as BillingPlanId[]) ?? ["starter", "pro"],
    price_per_tenant: row.price_per_tenant != null ? Number(row.price_per_tenant) : null,
    flat_monthly_fee: row.flat_monthly_fee != null ? Number(row.flat_monthly_fee) : null,
    default_trial_days: Number(row.default_trial_days ?? TRIAL_DAYS),
    notes: (row.notes as string | null) ?? null,
    suspended_at: (row.suspended_at as string | null) ?? null,
    suspended_reason: (row.suspended_reason as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    tenant_count: tenantCount,
  };
}

async function loadOwnerForTenant(tenantId: string) {
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
  return {
    owner_email: userData.user?.email ?? null,
    owner_name:
      (userData.user?.user_metadata?.nome as string | undefined) ??
      (userData.user?.user_metadata?.name as string | undefined) ??
      null,
  };
}

export type CreateTenantForResellerInput = {
  restaurantName: string;
  slug: string;
  plan: BillingPlanId;
  billingModel?: BillingModel;
  ownerEmail: string;
  ownerName: string;
  ownerPassword?: string;
  documentType?: "cpf" | "cnpj";
  documentNumber?: string;
  ownerPhone?: string;
};

async function createTenantCore(
  input: CreateTenantForResellerInput & {
    resellerId: string | null;
    activationTokenId?: string | null;
    onboardedBy?: string | null;
    trialDays?: number;
    paymentSource: "platform" | "reseller";
  },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { assertCanCreateTenant } = await import("@/lib/platform/platform-limits");

  const slug = input.slug.trim().toLowerCase();
  if (!isValidTenantSlug(slug)) throw new Error("Slug invalido.");

  if (input.resellerId) {
    await assertResellerQuota(input.resellerId);
    const { data: reseller } = await supabaseAdmin
      .from("resellers")
      .select("allowed_plans")
      .eq("id", input.resellerId)
      .maybeSingle();
    if (!reseller?.allowed_plans?.includes(input.plan)) {
      throw new Error("Plano nao permitido para esta revendedora.");
    }
  }

  const { count } = await supabaseAdmin.from("tenants").select("id", { count: "exact", head: true });
  assertCanCreateTenant(count ?? 0);

  const { data: existingSlug } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingSlug) throw new Error("Este endereco da loja ja esta em uso.");

  const tenantId = crypto.randomUUID();
  const now = new Date().toISOString();
  const trialEndsAt = addDays(input.trialDays ?? TRIAL_DAYS);

  const { error: tenantError } = await supabaseAdmin.from("tenants").insert({
    id: tenantId,
    name: input.restaurantName.trim(),
    slug,
    subtitle: "Delivery e retirada",
    primary_color: "#FF9100",
    status: "trial",
    approved_at: now,
    reseller_id: input.resellerId,
    activation_token_id: input.activationTokenId ?? null,
    onboarded_by: input.onboardedBy ?? null,
    document_type: input.documentType ?? null,
    document_number: input.documentNumber ?? null,
  });
  if (tenantError) throw tenantError;

  await supabaseAdmin.from("tenant_settings").insert({
    tenant_id: tenantId,
    phone: input.ownerPhone ?? null,
  });

  let ownerUserId: string | null = null;
  const email = input.ownerEmail.trim().toLowerCase();

  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  const found = existingUsers.users.find((u) => u.email?.toLowerCase() === email);

  if (found) {
    ownerUserId = found.id;
  } else if (input.ownerPassword) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: input.ownerPassword,
      email_confirm: true,
      user_metadata: { nome: input.ownerName.trim() },
    });
    if (createError) throw createError;
    ownerUserId = created.user?.id ?? null;
  } else {
    throw new Error("Informe senha para criar conta do proprietario ou use e-mail ja cadastrado.");
  }

  if (!ownerUserId) throw new Error("Nao foi possivel vincular o proprietario.");

  await supabaseAdmin.from("profiles").upsert({
    id: ownerUserId,
    nome: input.ownerName.trim(),
    telefone: input.ownerPhone ?? null,
    updated_at: now,
  });

  await registerOwnerAsColaboradorAdmin(supabaseAdmin, tenantId, ownerUserId);

  await upsertTenantBillingRecord(tenantId, {
    billingModel: input.billingModel ?? "monthly",
    plan: input.plan,
    trialEndsAt,
    paymentSource: input.paymentSource,
  });

  return { tenantId, slug, name: input.restaurantName.trim(), ownerUserId };
}

// --- Platform Admin: Resellers CRUD ---

export const listResellersAdminServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .handler(async (): Promise<ResellerRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("resellers").select("*").order("created_at", {
      ascending: false,
    });
    if (error) throw error;

    const rows = await Promise.all(
      (data ?? []).map(async (row) => {
        const { count } = await supabaseAdmin
          .from("tenants")
          .select("id", { count: "exact", head: true })
          .eq("reseller_id", row.id)
          .not("status", "eq", "suspended");
        return mapReseller(row as Record<string, unknown>, count ?? 0);
      }),
    );
    return rows;
  });

export const getResellerAdminServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<ResellerRow | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("resellers").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { count } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("reseller_id", id);
    return mapReseller(data as Record<string, unknown>, count ?? 0);
  });

export type CreateResellerAdminPayload = {
  name: string;
  slug: string;
  contact_email: string;
  contact_phone?: string;
  document_number?: string;
  max_tenants?: number;
  allowed_plans?: BillingPlanId[];
  price_per_tenant?: number;
  flat_monthly_fee?: number;
  default_trial_days?: number;
  owner_email: string;
  owner_name: string;
  owner_password: string;
};

export const createResellerAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((payload: CreateResellerAdminPayload) => payload)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slug = data.slug.trim().toLowerCase();
    if (!isValidTenantSlug(slug)) throw new Error("Slug invalido.");

    const { data: existing } = await supabaseAdmin
      .from("resellers")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) throw new Error("Slug da revendedora ja existe.");

    const { data: reseller, error } = await supabaseAdmin
      .from("resellers")
      .insert({
        name: data.name.trim(),
        slug,
        contact_email: data.contact_email.trim().toLowerCase(),
        contact_phone: data.contact_phone ?? null,
        document_number: data.document_number ?? null,
        max_tenants: data.max_tenants ?? 10,
        allowed_plans: data.allowed_plans ?? ["starter", "pro"],
        price_per_tenant: data.price_per_tenant ?? null,
        flat_monthly_fee: data.flat_monthly_fee ?? null,
        default_trial_days: data.default_trial_days ?? TRIAL_DAYS,
        status: "active",
      })
      .select("*")
      .single();
    if (error) throw error;

    await supabaseAdmin.from("reseller_billing").insert({
      reseller_id: reseller.id,
      price_per_tenant: data.price_per_tenant ?? null,
      flat_monthly_fee: data.flat_monthly_fee ?? null,
    });

    const email = data.owner_email.trim().toLowerCase();
    let userId: string | null = null;

    for (let page = 1; page <= 10; page++) {
      const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (listError) throw listError;
      const found = list.users.find((u) => u.email?.toLowerCase() === email);
      if (found) {
        userId = found.id;
        break;
      }
      if (list.users.length < 200) break;
    }

    if (!userId) {
      const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.owner_password,
        email_confirm: true,
        user_metadata: { nome: data.owner_name.trim() },
      });
      if (userError) throw userError;
      userId = created.user!.id;
    } else if (data.owner_password.trim().length >= 6) {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.owner_password,
        user_metadata: { nome: data.owner_name.trim() },
      });
    }

    await supabaseAdmin.from("reseller_users").insert({
      reseller_id: reseller.id,
      user_id: userId,
      role: "owner",
      status: "active",
    });

    return mapReseller(reseller as Record<string, unknown>, 0);
  });

export const updateResellerStatusAdminServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((input: { resellerId: string; status: ResellerStatus; reason?: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.status === "suspended") {
      patch.suspended_at = new Date().toISOString();
      patch.suspended_reason = data.reason ?? null;
    } else {
      patch.suspended_at = null;
      patch.suspended_reason = null;
    }
    const { error } = await supabaseAdmin.from("resellers").update(patch).eq("id", data.resellerId);
    if (error) throw error;
    return { ok: true as const };
  });

// --- Reseller panel ---

export const getResellerDashboardServer = createServerFn({ method: "GET" })
  .middleware([requireResellerStaff])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const resellerId = context.resellerId as string;

    const [{ data: reseller }, { data: tenants }] = await Promise.all([
      supabaseAdmin.from("resellers").select("*").eq("id", resellerId).maybeSingle(),
      supabaseAdmin.from("tenants").select("id, status").eq("reseller_id", resellerId),
    ]);
    if (!reseller) throw new Error("Revendedora nao encontrada.");

    const list = tenants ?? [];
    return {
      reseller: mapReseller(reseller as Record<string, unknown>, list.length),
      stats: {
        total: list.length,
        trial: list.filter((t) => t.status === "trial").length,
        active: list.filter((t) => t.status === "active").length,
        suspended: list.filter((t) => t.status === "suspended").length,
      },
    };
  });

export const listResellerTenantsServer = createServerFn({ method: "GET" })
  .middleware([requireResellerStaff])
  .handler(async ({ context }): Promise<ResellerTenantRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const resellerId = context.resellerId as string;

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, status, created_at")
      .eq("reseller_id", resellerId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const rows = await Promise.all(
      (data ?? []).map(async (row) => {
        const owner = await loadOwnerForTenant(String(row.id));
        const { data: billing } = await supabaseAdmin
          .from("tenant_billing")
          .select("plan, trial_ends_at")
          .eq("tenant_id", row.id)
          .maybeSingle();
        return {
          id: String(row.id),
          name: String(row.name),
          slug: String(row.slug),
          status: String(row.status),
          plan: (billing?.plan as BillingPlanId | null) ?? null,
          trial_ends_at: (billing?.trial_ends_at as string | null) ?? null,
          created_at: String(row.created_at),
          owner_email: owner.owner_email,
          owner_name: owner.owner_name,
        };
      }),
    );
    return rows;
  });

export const createResellerTenantServer = createServerFn({ method: "POST" })
  .middleware([requireResellerStaff])
  .validator((payload: CreateTenantForResellerInput) => payload)
  .handler(async ({ data, context }) => {
    const resellerId = context.resellerId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reseller } = await supabaseAdmin
      .from("resellers")
      .select("default_trial_days")
      .eq("id", resellerId)
      .maybeSingle();

    const result = await createTenantCore({
      ...data,
      resellerId,
      onboardedBy: context.userId,
      trialDays: reseller?.default_trial_days ?? TRIAL_DAYS,
      paymentSource: "reseller",
    });

    const { notifyTenantApproved } = await import("@/lib/signup/tenant-approval-notify.server");
    void notifyTenantApproved({
      email: data.ownerEmail,
      ownerName: data.ownerName,
      restaurantName: data.restaurantName,
      slug: result.slug,
    }).catch(() => undefined);

    return result;
  });

export const createActivationTokenServer = createServerFn({ method: "POST" })
  .middleware([requireResellerStaff])
  .validator(
    (input: { plan: BillingPlanId; trialDays?: number; maxUses?: number; expiresInDays?: number }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const resellerId = context.resellerId as string;
    const crypto = await tokenCrypto();
    const plain = crypto.generatePlain();
    const tokenHash = crypto.hash(plain);
    const prefix = crypto.prefix(plain);
    const expiresAt = data.expiresInDays
      ? addDays(data.expiresInDays)
      : addDays(30);

    const { data: row, error } = await supabaseAdmin
      .from("activation_tokens")
      .insert({
        reseller_id: resellerId,
        token_hash: tokenHash,
        token_prefix: prefix,
        plan: data.plan,
        trial_days: data.trialDays ?? TRIAL_DAYS,
        max_uses: data.maxUses ?? 1,
        expires_at: expiresAt,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;

    return {
      token: plain,
      link: `/cadastro?token=${encodeURIComponent(plain)}`,
      row: row as ActivationTokenRow,
    };
  });

export const listActivationTokensServer = createServerFn({ method: "GET" })
  .middleware([requireResellerStaff])
  .handler(async ({ context }): Promise<ActivationTokenRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("activation_tokens")
      .select("*")
      .eq("reseller_id", context.resellerId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as ActivationTokenRow[];
  });

export const revokeActivationTokenServer = createServerFn({ method: "POST" })
  .middleware([requireResellerStaff])
  .validator((tokenId: string) => tokenId)
  .handler(async ({ data: tokenId, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("activation_tokens")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokenId)
      .eq("reseller_id", context.resellerId)
      .eq("status", "active");
    if (error) throw error;
    return { ok: true as const };
  });

export const resolveActivationTokenServer = createServerFn({ method: "GET" })
  .validator((token: string) => token)
  .handler(async ({ data: token }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const crypto = await tokenCrypto();
    const tokenHash = crypto.hash(token);
    const { data: row, error } = await supabaseAdmin
      .from("activation_tokens")
      .select("*, resellers(name, slug, status, allowed_plans)")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;
    if (row.status !== "active") return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    if (row.uses_count >= row.max_uses) return null;
    const reseller = row.resellers as { name: string; slug: string; status: string } | null;
    if (!reseller || reseller.status !== "active") return null;
    return {
      plan: row.plan as BillingPlanId,
      trialDays: row.trial_days as number,
      resellerName: reseller.name,
      resellerSlug: reseller.slug,
      tokenId: row.id as string,
      resellerId: row.reseller_id as string,
    };
  });

export const startImpersonationServer = createServerFn({ method: "POST" })
  .middleware([requireResellerStaff])
  .validator((tenantId: string) => tenantId)
  .handler(async ({ data: tenantId, context }) => {
    const resellerId = context.resellerId as string;
    await assertResellerCanAccessTenant(resellerId, tenantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("slug")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenant) throw new Error("Restaurante nao encontrado.");

    await supabaseAdmin.from("impersonation_logs").insert({
      actor_type: "reseller",
      actor_user_id: context.userId,
      reseller_id: resellerId,
      tenant_id: tenantId,
    });

    return { slug: tenant.slug as string, path: `/t/${tenant.slug}/dashboard` };
  });

export const startPlatformImpersonationServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((tenantId: string) => tenantId)
  .handler(async ({ data: tenantId, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("slug, reseller_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (!tenant) throw new Error("Restaurante nao encontrado.");

    await supabaseAdmin.from("impersonation_logs").insert({
      actor_type: "platform",
      actor_user_id: context.userId,
      reseller_id: tenant.reseller_id,
      tenant_id: tenantId,
    });

    return { slug: tenant.slug as string, path: `/t/${tenant.slug}/dashboard` };
  });

export const suggestResellerSlugServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .validator((name: string) => name)
  .handler(async ({ data: name }) => {
    const base = slugifyTenantName(name) || "parceiro";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let candidate = base;
    for (let i = 0; i < 20; i++) {
      const { data: row } = await supabaseAdmin
        .from("resellers")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!row) return candidate;
      candidate = `${base}-${i + 2}`;
    }
    return candidate;
  });

export const checkResellerAccessServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("reseller_users")
      .select("reseller_id, role, resellers(slug, name, status)")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!data) return { allowed: false as const };
    const reseller = data.resellers as { slug: string; name: string; status: string } | null;
    if (!reseller || reseller.status !== "active") return { allowed: false as const };
    return {
      allowed: true as const,
      resellerId: data.reseller_id as string,
      slug: reseller.slug,
      name: reseller.name,
      role: data.role as string,
    };
  });

// Used during signup with token
export async function consumeActivationTokenForSignup(
  tokenPlain: string,
  tenantId: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const crypto = await tokenCrypto();
  const tokenHash = crypto.hash(tokenPlain);
  const { data: row, error } = await supabaseAdmin
    .from("activation_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.status !== "active") throw new Error("Token invalido ou expirado.");
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    throw new Error("Token expirado.");
  }
  if (row.uses_count >= row.max_uses) throw new Error("Token ja utilizado.");

  const uses = row.uses_count + 1;
  const patch: Record<string, unknown> = {
    uses_count: uses,
    updated_at: new Date().toISOString(),
  };
  if (uses >= row.max_uses) {
    patch.status = "consumed";
    patch.consumed_at = new Date().toISOString();
  }

  await supabaseAdmin.from("activation_tokens").update(patch).eq("id", row.id);

  return {
    tokenId: row.id as string,
    resellerId: row.reseller_id as string,
    plan: row.plan as BillingPlanId,
    trialDays: row.trial_days as number,
  };
}

export { createTenantCore };

export const generateResellerInvoicesServer = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((input: { year: number; month: number }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { periodStart, periodEnd } = getMonthPeriod(data.year, data.month);

    const { data: resellers, error } = await supabaseAdmin.from("resellers").select("*");
    if (error) throw error;

    let created = 0;
    for (const reseller of resellers ?? []) {
      const { count } = await supabaseAdmin
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("reseller_id", reseller.id)
        .in("status", ["active", "trial"]);

      const { data: billing } = await supabaseAdmin
        .from("reseller_billing")
        .select("*")
        .eq("reseller_id", reseller.id)
        .maybeSingle();

      const pricePerTenant = Number(billing?.price_per_tenant ?? reseller.price_per_tenant ?? 0);
      const flatFee = Number(billing?.flat_monthly_fee ?? reseller.flat_monthly_fee ?? 0);
      const calculated =
        flatFee > 0 ? flatFee : pricePerTenant * (count ?? 0);

      const { error: upsertError } = await supabaseAdmin.from("reseller_invoices").upsert(
        {
          reseller_id: reseller.id,
          period_start: periodStart,
          period_end: periodEnd,
          active_tenant_count: count ?? 0,
          calculated_amount: calculated,
          final_amount: calculated,
          status: "draft",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "reseller_id,period_start,period_end" },
      );
      if (!upsertError) created += 1;
    }

    return { created };
  });

export const listResellerTenantsAdminServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .validator((resellerId: string) => resellerId)
  .handler(async ({ data: resellerId }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, status, created_at")
      .eq("reseller_id", resellerId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });
