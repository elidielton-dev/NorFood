import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";

export type OperationalConfig = {
  pedido_minimo: number;
  loja_aberta: boolean;
  valor_padrao_entrega: number;
  pontos_por_real: number;
};

export type BairroEntrega = {
  id: string;
  nome: string;
  taxa: number;
  latitude: number | null;
  longitude: number | null;
  ativo: boolean;
};

export const fetchOperationalStatusServer = createServerFn({ method: "GET" }).handler(
  async (): Promise<OperationalConfig> => {
    const { getOperationalConfig } = await import("@/lib/api/order-validation.server");
    return getOperationalConfig();
  },
);

export const fetchOperationalAdminServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [configResult, bairrosResult] = await Promise.all([
      supabaseAdmin.from("config_operacional").select("*").eq("id", "default").single(),
      supabaseAdmin.from("bairros_entrega").select("*").order("nome"),
    ]);

    if (configResult.error) throw configResult.error;
    if (bairrosResult.error) throw bairrosResult.error;

    return {
      config: {
        pedido_minimo: Number(configResult.data.pedido_minimo),
        loja_aberta: configResult.data.loja_aberta,
        valor_padrao_entrega: Number(configResult.data.valor_padrao_entrega),
        pontos_por_real: Number(configResult.data.pontos_por_real),
      },
      bairros: (bairrosResult.data ?? []).map((row) => ({
        id: row.id,
        nome: row.nome,
        taxa: Number(row.taxa),
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        ativo: row.ativo,
      })),
    };
  });

export const saveOperationalConfigServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: OperationalConfig) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("config_operacional")
      .update({
        pedido_minimo: data.pedido_minimo,
        loja_aberta: data.loja_aberta,
        valor_padrao_entrega: data.valor_padrao_entrega,
        pontos_por_real: data.pontos_por_real,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
    if (error) throw error;
    return { ok: true as const };
  });

export const saveBairroEntregaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      id?: string;
      nome: string;
      taxa: number;
      latitude?: number | null;
      longitude?: number | null;
      ativo: boolean;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      nome: data.nome.trim(),
      taxa: data.taxa,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      ativo: data.ativo,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("bairros_entrega")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true as const };
    }

    const { error } = await supabaseAdmin.from("bairros_entrega").insert(payload);
    if (error) throw error;
    return { ok: true as const };
  });

export const deleteBairroEntregaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("bairros_entrega").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const fetchBairrosPublicServer = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("bairros_entrega")
    .select("nome, taxa")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return (data ?? []).map((row) => ({ nome: row.nome, taxa: Number(row.taxa) }));
});
