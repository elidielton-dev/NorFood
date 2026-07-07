import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth/auth-helpers.server";

export type MesaAdminRow = {
  id: string;
  numero: number;
  capacidade: number;
  status: string;
  qrcode_token: string;
};

export const fetchMesasAdminServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }): Promise<MesaAdminRow[]> => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("mesas")
      .select("id,numero,capacidade,status,qrcode_token")
      .eq("tenant_id", tenantId)
      .order("numero");
    if (error) throw error;
    return (data ?? []) as MesaAdminRow[];
  });

export const saveMesaAdminServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      tenantSlug: string;
      id?: string;
      numero: number;
      capacidade: number;
      qrcode_token?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("slug")
      .eq("id", tenantId)
      .maybeSingle();
    const slug = tenant?.slug ?? data.tenantSlug;

    const payload = {
      tenant_id: tenantId,
      numero: data.numero,
      capacidade: data.capacidade,
      qrcode_token: data.qrcode_token?.trim() || `${slug}-mesa-${data.numero}`,
      status: "livre" as const,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("mesas").update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true as const };
    }

    const { error } = await supabaseAdmin.from("mesas").insert(payload);
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteMesaAdminServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; mesaId: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pedido } = await supabaseAdmin
      .from("pedidos")
      .select("id")
      .eq("mesa_id", data.mesaId)
      .not("status", "in", "(entregue,cancelado)")
      .limit(1)
      .maybeSingle();
    if (pedido) throw new Error("Mesa com pedido em andamento. Finalize ou cancele antes de remover.");

    const { error } = await supabaseAdmin
      .from("mesas")
      .delete()
      .eq("id", data.mesaId)
      .eq("tenant_id", tenantId);
    if (error) throw error;
    return { ok: true as const };
  });

export const seedMesasAdminServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; count?: number }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const count = Math.min(Math.max(data.count ?? 12, 1), 48);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("slug")
      .eq("id", tenantId)
      .maybeSingle();
    const slug = tenant?.slug ?? data.tenantSlug;

    const { data: existing } = await supabaseAdmin
      .from("mesas")
      .select("numero")
      .eq("tenant_id", tenantId);
    const used = new Set((existing ?? []).map((m) => m.numero));

    const toInsert = [];
    for (let n = 1; n <= count; n++) {
      if (used.has(n)) continue;
      toInsert.push({
        tenant_id: tenantId,
        numero: n,
        capacidade: n <= 8 ? 4 : 6,
        status: "livre" as const,
        qrcode_token: `${slug}-mesa-${n}`,
      });
    }

    if (toInsert.length === 0) return { created: 0 };

    const { error } = await supabaseAdmin.from("mesas").insert(toInsert);
    if (error) throw error;
    return { created: toInsert.length };
  });
