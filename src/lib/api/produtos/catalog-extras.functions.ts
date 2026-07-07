import { createServerFn } from "@tanstack/react-start";
import { resolveTenantIdBySlug } from "@/lib/api/financeiro/platform-billing.functions";

export type CatalogVariation = {
  id: string;
  produto_id: string;
  nome: string;
  preco: number;
  estoque: number;
};

export type CatalogAddon = {
  id: string;
  grupo_id: string;
  nome: string;
  preco: number;
  estoque: number;
  obrigatorio: boolean;
  min: number;
  max: number;
};

export type CatalogAddonGroup = {
  id: string;
  nome: string;
  descricao: string;
};

export type CatalogExtras = {
  grupos: CatalogAddonGroup[];
  adicionais: CatalogAddon[];
  variacoesByProduto: Record<string, CatalogVariation[]>;
  promocoesByProduto: Record<
    string,
    { tipo: string; valor: number; titulo: string; precoPromocional: number | null }
  >;
};

export const fetchCatalogExtrasServer = createServerFn({ method: "GET" })
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ data: tenantSlug }): Promise<CatalogExtras> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantId = await resolveTenantIdBySlug(tenantSlug);
    if (!tenantId) {
      return { grupos: [], adicionais: [], variacoesByProduto: {}, promocoesByProduto: {} };
    }

    const [gruposResult, adicionaisResult, variacoesResult, promocoesResult, produtosResult] =
      await Promise.all([
        supabaseAdmin
          .from("grupos_adicionais")
          .select("id,nome,descricao")
          .eq("tenant_id", tenantId)
          .order("created_at"),
        supabaseAdmin
          .from("produto_adicionais")
          .select("id,grupo_id,nome,preco,estoque,obrigatorio,minimo,maximo")
          .eq("tenant_id", tenantId)
          .order("created_at"),
        supabaseAdmin
          .from("produto_variacoes")
          .select("id,produto_id,nome,preco,estoque,status")
          .eq("tenant_id", tenantId)
          .eq("status", "ativo"),
        supabaseAdmin
          .from("produto_promocoes")
          .select("produto_id,tipo,valor,titulo,ativa")
          .eq("tenant_id", tenantId)
          .eq("ativa", true),
        supabaseAdmin
          .from("produtos")
          .select("id,preco_promocional")
          .eq("tenant_id", tenantId)
          .not("preco_promocional", "is", null),
      ]);

    if (gruposResult.error) throw gruposResult.error;
    if (adicionaisResult.error) throw adicionaisResult.error;
    if (variacoesResult.error) throw variacoesResult.error;
    if (promocoesResult.error) throw promocoesResult.error;
    if (produtosResult.error) throw produtosResult.error;

    const variacoesByProduto: Record<string, CatalogVariation[]> = {};
    for (const row of variacoesResult.data ?? []) {
      const list = variacoesByProduto[row.produto_id] ?? [];
      list.push({
        id: row.id,
        produto_id: row.produto_id,
        nome: row.nome,
        preco: Number(row.preco),
        estoque: row.estoque,
      });
      variacoesByProduto[row.produto_id] = list;
    }

    const promocoesByProduto: CatalogExtras["promocoesByProduto"] = {};
    for (const row of promocoesResult.data ?? []) {
      promocoesByProduto[row.produto_id] = {
        tipo: row.tipo,
        valor: Number(row.valor),
        titulo: row.titulo,
        precoPromocional: null,
      };
    }
    for (const row of produtosResult.data ?? []) {
      promocoesByProduto[row.id] = {
        ...(promocoesByProduto[row.id] ?? { tipo: "valor", valor: 0, titulo: "Promoção" }),
        precoPromocional: row.preco_promocional != null ? Number(row.preco_promocional) : null,
      };
    }

    return {
      grupos: (gruposResult.data ?? []).map((g) => ({
        id: g.id,
        nome: g.nome,
        descricao: g.descricao ?? "",
      })),
      adicionais: (adicionaisResult.data ?? []).map((a) => ({
        id: a.id,
        grupo_id: a.grupo_id,
        nome: a.nome,
        preco: Number(a.preco),
        estoque: a.estoque,
        obrigatorio: a.obrigatorio,
        min: a.minimo,
        max: a.maximo,
      })),
      variacoesByProduto,
      promocoesByProduto,
    };
  });
