import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";
import { validateAndPriceOrderItems } from "@/lib/api/order-validation.server";

type FormaPagamento = Enums<"forma_pagamento">;
type MesaStatus = Enums<"mesa_status">;
type MesaRow = Tables<"mesas">;
type PedidoRow = Tables<"pedidos">;

type OpenMesaInput = {
  mesaId: string;
  forma_pagamento: string;
  observacoes?: string | null;
  itens: Array<{
    produto_id: string;
    quantidade: number;
    preco_unitario: number;
  }>;
};

type FinalizeMesaInput = {
  mesaId: string;
  pedidoId: string;
};

type UpdateMesaStatusInput = {
  mesaId: string;
  status: MesaStatus;
};

export const updateMesaStatusServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: UpdateMesaStatusInput) => input)
  .handler(async ({ context, data }): Promise<MesaRow> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel de mesas.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mesa, error } = await supabaseAdmin
      .from("mesas")
      .update({ status: data.status })
      .eq("id", data.mesaId)
      .select("*")
      .single();
    if (error) throw error;

    return mesa;
  });

export const openMesaOrderServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: OpenMesaInput) => input)
  .handler(async ({ context, data }): Promise<PedidoRow> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel de mesas.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { itens, subtotal } = await validateAndPriceOrderItems(data.itens, {
      checkStock: true,
    });

    const { data: mesa, error: mesaError } = await supabaseAdmin
      .from("mesas")
      .select("id,numero,status")
      .eq("id", data.mesaId)
      .single();
    if (mesaError) throw mesaError;

    if (mesa.status === "reservada") {
      throw new Error("Esta mesa esta reservada.");
    }

    const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
      .from("pedidos")
      .select("id,numero,status")
      .eq("mesa_id", data.mesaId)
      .not("status", "in", "(entregue,cancelado)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingOrderError) throw existingOrderError;

    if (existingOrder) {
      throw new Error(`A mesa ja possui o pedido #${existingOrder.numero} em andamento.`);
    }

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos")
      .insert({
        canal: "mesa",
        mesa_id: data.mesaId,
        status: "aberto",
        subtotal,
        desconto: 0,
        taxa_entrega: 0,
        total: subtotal,
        forma_pagamento: data.forma_pagamento as FormaPagamento,
        observacoes: data.observacoes ?? `Mesa ${mesa.numero}`,
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

    const { error: mesaUpdateError } = await supabaseAdmin
      .from("mesas")
      .update({ status: "ocupada" })
      .eq("id", data.mesaId);
    if (mesaUpdateError) throw mesaUpdateError;

    const { error: financeError } = await supabaseAdmin.from("lancamentos_financeiros").insert({
      tipo: "entrada",
      descricao: `Mesa #${mesa.numero} Pedido #${pedido.numero}`,
      categoria: "Vendas mesa",
      valor: subtotal,
      forma: data.forma_pagamento as FormaPagamento,
      pedido_id: pedido.id,
    });
    if (financeError) throw financeError;

    return pedido;
  });

export const finalizeMesaOrderServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: FinalizeMesaInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel de mesas.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: orderError } = await supabaseAdmin
      .from("pedidos")
      .update({ status: "entregue" })
      .eq("id", data.pedidoId);
    if (orderError) throw orderError;

    const { error: mesaError } = await supabaseAdmin
      .from("mesas")
      .update({ status: "livre" })
      .eq("id", data.mesaId);
    if (mesaError) throw mesaError;

    const { tryAutoEmitNfceForPedido } = await import("@/lib/api/fiscal.server");
    void tryAutoEmitNfceForPedido(data.pedidoId, "mesas");

    return { ok: true };
  });
