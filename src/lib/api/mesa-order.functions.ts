import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Enums } from "@/integrations/supabase/types";
import {
  getOperationalConfig,
  incrementCouponUsage,
  validateAndPriceOrderItems,
  validateCoupon,
} from "@/lib/api/order-validation.server";

type FormaPagamento = Enums<"forma_pagamento">;

type CreateMesaQrOrderPayload = {
  qrcodeToken: string;
  cupom_codigo?: string | null;
  observacoes?: string | null;
  itens: Array<{
    produto_id: string;
    quantidade: number;
    preco_unitario?: number;
    variacao_id?: string | null;
    adicionais?: Array<{ id: string; quantidade: number }>;
  }>;
};

export const createMesaQrOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateMesaQrOrderPayload) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mesa, error: mesaError } = await supabaseAdmin
      .from("mesas")
      .select("id, numero, status, tenant_id")
      .eq("qrcode_token", data.qrcodeToken)
      .maybeSingle();
    if (mesaError) throw mesaError;
    if (!mesa) throw new Error("QR Code da mesa invalido ou expirado.");
    if (mesa.status === "reservada") {
      throw new Error("Esta mesa esta reservada. Solicite ajuda da equipe.");
    }

    const tenantId = (mesa as { tenant_id?: string | null }).tenant_id ?? undefined;
    const config = await getOperationalConfig(tenantId);

    if (!config.loja_aberta) {
      throw new Error("A loja esta fechada no momento. Tente novamente mais tarde.");
    }

    if (mesa.tenant_id) {
      const { assertCanCreateTenantOrder } = await import("@/lib/tenant/tenant-plan.server");
      await assertCanCreateTenantOrder(mesa.tenant_id);
    }

    const { data: existingOrder, error: existingOrderError } = await supabaseAdmin
      .from("pedidos")
      .select("id, numero, status")
      .eq("mesa_id", mesa.id)
      .not("status", "in", "(entregue,cancelado)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingOrderError) throw existingOrderError;

    const { itens, subtotal } = await validateAndPriceOrderItems(data.itens, {
      checkStock: true,
    });

    if (subtotal < Number(config.pedido_minimo)) {
      throw new Error(
        `Pedido minimo de R$ ${Number(config.pedido_minimo).toFixed(2).replace(".", ",")}.`,
      );
    }

    let desconto = 0;
    let cupomId: string | null = null;
    if (data.cupom_codigo) {
      const coupon = await validateCoupon(data.cupom_codigo, subtotal, tenantId);
      if (coupon) {
        desconto = coupon.desconto;
        cupomId = coupon.cupom_id;
      }
    }

    const total = subtotal - desconto;

    if (existingOrder) {
      const { error: itemError } = await supabaseAdmin.from("pedido_itens").insert(
        itens.map((item) => ({
          pedido_id: existingOrder.id,
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          observacao: item.observacao ?? null,
        })),
      );
      if (itemError) throw itemError;

      const { data: currentOrder, error: currentOrderError } = await supabaseAdmin
        .from("pedidos")
        .select("subtotal")
        .eq("id", existingOrder.id)
        .single();
      if (currentOrderError) throw currentOrderError;

      const novoSubtotal = Number(currentOrder.subtotal) + subtotal;
      const novoTotal = novoSubtotal - desconto;

      const { data: updatedOrder, error: updateError } = await supabaseAdmin
        .from("pedidos")
        .update({
          subtotal: novoSubtotal,
          desconto,
          total: novoTotal,
          cupom_id: cupomId,
          observacoes: data.observacoes ?? `Mesa ${mesa.numero} via QR`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingOrder.id)
        .select("*")
        .single();
      if (updateError) throw updateError;

      if (cupomId) await incrementCouponUsage(cupomId);

      return {
        ...updatedOrder,
        mesa_numero: mesa.numero,
        appended: true,
      };
    }

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos")
      .insert({
        canal: "qrcode",
        mesa_id: mesa.id,
        cliente_id: context.userId,
        status: "aberto",
        subtotal,
        desconto,
        taxa_entrega: 0,
        total,
        forma_pagamento: null,
        cupom_id: cupomId,
        observacoes: data.observacoes ?? `Mesa ${mesa.numero} via QR`,
      })
      .select("*")
      .single();
    if (pedidoError) throw pedidoError;

    const { error: itensError } = await supabaseAdmin.from("pedido_itens").insert(
      itens.map((item) => ({
        pedido_id: pedido.id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        observacao: item.observacao ?? null,
      })),
    );
    if (itensError) throw itensError;

    await supabaseAdmin.from("mesas").update({ status: "ocupada" }).eq("id", mesa.id);

    if (cupomId) await incrementCouponUsage(cupomId);

    return {
      ...pedido,
      mesa_numero: mesa.numero,
      appended: false,
    };
  });

export const resolveMesaByToken = createServerFn({ method: "POST" })
  .validator((input: { qrcodeToken: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mesa, error } = await supabaseAdmin
      .from("mesas")
      .select("id, numero, status, capacidade")
      .eq("qrcode_token", data.qrcodeToken)
      .maybeSingle();
    if (error) throw error;
    if (!mesa) throw new Error("Mesa nao encontrada.");
    return mesa;
  });
