import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";
import {
  getOperationalConfig,
  validateAndPriceOrderItems,
  type OrderItemInput,
} from "@/lib/api/order-validation.server";

type FormaPagamento = Enums<"forma_pagamento">;
type PedidoRow = Tables<"pedidos">;

type CreateBalcaoOrderInput = {
  forma_pagamento: string;
  troco_para?: number | null;
  observacoes?: string | null;
  itens: OrderItemInput[];
};

export const createBalcaoOrderServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateBalcaoOrderInput) => input)
  .handler(async ({ context, data }): Promise<PedidoRow> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao PDV balcão.");

    const config = await getOperationalConfig();
    if (!config.loja_aberta) {
      throw new Error("A loja esta fechada no momento.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { itens, subtotal } = await validateAndPriceOrderItems(data.itens, {
      checkStock: true,
    });

    if (subtotal < Number(config.pedido_minimo)) {
      throw new Error(
        `Pedido minimo de R$ ${Number(config.pedido_minimo).toFixed(2).replace(".", ",")}.`,
      );
    }

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos")
      .insert({
        canal: "balcao",
        status: "aberto",
        subtotal,
        desconto: 0,
        taxa_entrega: 0,
        total: subtotal,
        forma_pagamento: data.forma_pagamento as FormaPagamento,
        troco_para: data.troco_para ?? null,
        observacoes: data.observacoes ?? "Pedido criado no balcão",
      })
      .select("*")
      .single();
    if (pedidoError) throw pedidoError;

    const { error: itemError } = await supabaseAdmin.from("pedido_itens").insert(
      itens.map((item) => ({
        pedido_id: pedido.id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        observacao: item.observacao ?? null,
      })),
    );
    if (itemError) throw itemError;

    const { error: financeError } = await supabaseAdmin.from("lancamentos_financeiros").insert({
      tipo: "entrada",
      descricao: `Balcão Pedido #${pedido.numero}`,
      categoria: "Vendas balcão",
      valor: subtotal,
      forma: data.forma_pagamento as FormaPagamento,
      pedido_id: pedido.id,
    });
    if (financeError) throw financeError;

    return pedido;
  });
