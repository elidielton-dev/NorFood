import { QueroDeliveryClient } from "@/lib/integrations/quero-delivery/quero-delivery.client";
import { getTenantQueroIntegration } from "@/lib/integrations/quero-delivery/quero-delivery.sync.server";

function normalizeProducts(
  payload: { products?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>,
) {
  if (Array.isArray(payload)) return payload;
  return payload.products ?? [];
}

export async function syncQueroCatalogForTenant(tenantId: string) {
  const integration = await getTenantQueroIntegration(tenantId);
  if (!integration?.quero_delivery_enabled) {
    return { pushed: 0, skipped: true };
  }
  if (!integration.quero_delivery_place_id || !integration.quero_delivery_api_token) {
    throw new Error("Credenciais Quero Delivery incompletas.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: produtos, error } = await supabaseAdmin
    .from("produtos")
    .select("id, nome, descricao, preco, codigo_barras, disponivel_canais, ativo")
    .eq("tenant_id", tenantId)
    .eq("ativo", true);
  if (error) throw error;

  const eligible = (produtos ?? []).filter((produto) => {
    const canais = Array.isArray(produto.disponivel_canais) ? produto.disponivel_canais : [];
    return canais.includes("quero_delivery");
  });

  const client = new QueroDeliveryClient({
    placeId: integration.quero_delivery_place_id,
    apiToken: integration.quero_delivery_api_token,
  });

  const remote = normalizeProducts(await client.listProducts(200, 0));
  const remoteByCode = new Map(
    remote.map((item) => [String(item.codigoInterno ?? item.id ?? ""), item]),
  );

  let pushed = 0;
  for (const produto of eligible) {
    const code = produto.codigo_barras ?? produto.id;
    if (remoteByCode.has(code)) continue;

    const response = await fetch(
      `${process.env.QUERO_DELIVERY_API_URL ?? "https://api.quero.io"}/products`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.quero_delivery_api_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          placeId: integration.quero_delivery_place_id,
          nome: produto.nome,
          descricao: produto.descricao ?? "",
          preco: Number(produto.preco),
          codigoInterno: code,
          status: "ATIVO",
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Falha ao enviar produto ${produto.nome}: ${text}`);
    }
    pushed += 1;
  }

  return { pushed, skipped: false };
}
