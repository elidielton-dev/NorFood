import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Enums } from "@/integrations/supabase/types";
import { geocodeAddress } from "@/lib/geocoding";
import {
  getOperationalConfig,
  incrementCouponUsage,
  resolveDeliveryFeeFromDb,
  validateAndPriceOrderItems,
  validateCoupon,
} from "@/lib/api/order-validation.server";

type CreateDeliveryOrderPayload = {
  tenantSlug?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  forma_pagamento: string;
  payment_mode: "online" | "delivery";
  troco_para?: number | null;
  endereco: string;
  bairro: string;
  cidade: string;
  estado?: string;
  cep?: string;
  reference?: string;
  taxa_entrega?: number;
  cupom_codigo?: string | null;
  observacoes?: string;
  latitude_cliente?: number | null;
  longitude_cliente?: number | null;
  itens: Array<{
    produto_id: string;
    quantidade: number;
    preco_unitario?: number;
    variacao_id?: string | null;
    adicionais?: Array<{ id: string; quantidade: number }>;
  }>;
};

type FormaPagamento = Enums<"forma_pagamento">;

export const createDeliveryOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateDeliveryOrderPayload) => input)
  .handler(async ({ data, context }) => {
    if (!data.tenantSlug?.trim()) {
      throw new Error("Restaurante nao informado para o pedido.");
    }

    const { assertTenantOperationalBySlug } = await import("@/lib/tenant/tenant-access.server");
    await assertTenantOperationalBySlug(data.tenantSlug);
    const { resolveTenantIdBySlug } = await import("@/lib/api/platform-billing.functions");
    const { assertCanCreateTenantOrder } = await import("@/lib/tenant/tenant-plan.server");
    const tenantId = await resolveTenantIdBySlug(data.tenantSlug);
    if (!tenantId) {
      throw new Error("Restaurante nao encontrado.");
    }
    await assertCanCreateTenantOrder(tenantId);

    const config = await getOperationalConfig(tenantId);
    if (!config.loja_aberta) {
      throw new Error("A loja esta fechada no momento. Tente novamente mais tarde.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      createMercadoPagoCheckout,
      createMercadoPagoPixPayment,
      ensureOperationalOrderRecords,
      isMercadoPagoMethod,
      appendMercadoPagoMetadata,
    } = await import("@/lib/api/mercado-pago.server");

    const { itens, subtotal } = await validateAndPriceOrderItems(data.itens, {
      checkStock: true,
    });

    const taxaEntrega = await resolveDeliveryFeeFromDb(data.bairro, tenantId);

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

    const total = subtotal - desconto + taxaEntrega;
    const onlinePayment =
      data.payment_mode === "online" && isMercadoPagoMethod(data.forma_pagamento);

    const geocodedPoint =
      data.latitude_cliente != null && data.longitude_cliente != null
        ? {
            latitude: data.latitude_cliente,
            longitude: data.longitude_cliente,
          }
        : await geocodeAddress({
            endereco: data.endereco,
            bairro: data.bairro,
            cidade: data.cidade,
            estado: data.estado,
            cep: data.cep,
          });

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos")
      .insert({
        canal: "delivery",
        tenant_id: tenantId,
        cliente_id: context.userId,
        status: "aberto",
        subtotal,
        desconto,
        taxa_entrega: taxaEntrega,
        total,
        forma_pagamento: data.forma_pagamento as FormaPagamento,
        troco_para: data.troco_para ?? null,
        cupom_id: cupomId,
        endereco: data.endereco,
        latitude_cliente: geocodedPoint?.latitude ?? null,
        longitude_cliente: geocodedPoint?.longitude ?? null,
        observacoes: data.observacoes ?? null,
        origem_venda: "site",
        modo_entrega: "delivery",
      } as never)
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

    if (cupomId) await incrementCouponUsage(cupomId);

    if (!onlinePayment) {
      await ensureOperationalOrderRecords({
        id: pedido.id,
        numero: pedido.numero,
        endereco: data.endereco,
        taxa_entrega: taxaEntrega,
        total,
        forma_pagamento: pedido.forma_pagamento,
        bairro: data.bairro,
        tenant_id: tenantId,
        createFinanceEntry: false,
      });

      return pedido;
    }

    const productNames = new Map(itens.map((item) => [item.produto_id, item.nome]));

    if (data.forma_pagamento === "pix") {
      const pixPayment = await createMercadoPagoPixPayment({
        customer: {
          id: context.userId,
          name: data.customerName,
          email: data.customerEmail,
        },
        order: {
          id: pedido.id,
          numero: pedido.numero,
          total,
        },
        description: `Pedido #${pedido.numero} Abelha & Mel`,
      });

      const { data: updatedOrder, error: paymentUpdateError } = await supabaseAdmin
        .from("pedidos")
        .update({
          observacoes: appendMercadoPagoMetadata(pedido.observacoes, {
            provider: "mercado_pago",
            status: pixPayment.paymentStatus,
            reference: pedido.id,
            paymentId: pixPayment.paymentId,
            pixQrCode: pixPayment.qrCode,
            pixQrCodeBase64: pixPayment.qrCodeBase64,
            expiresAt: pixPayment.expiresAt,
            providerExpiresAt: pixPayment.providerExpiresAt ?? undefined,
            ticketUrl: pixPayment.ticketUrl ?? undefined,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedido.id)
        .select("*")
        .single();
      if (paymentUpdateError) throw paymentUpdateError;

      return {
        ...updatedOrder,
        payment_pix_qr_code: pixPayment.qrCode,
        payment_pix_qr_code_base64: pixPayment.qrCodeBase64,
        payment_ticket_url: pixPayment.ticketUrl,
        payment_redirect_required: false,
      };
    }

    const mercadoPagoCheckout = await createMercadoPagoCheckout({
      customer: {
        id: context.userId,
        name: data.customerName,
        email: data.customerEmail,
      },
      order: {
        id: pedido.id,
        numero: pedido.numero,
        total,
        taxaEntrega,
      },
      items: itens.map((item, index) => ({
        id: item.produto_id,
        title: productNames.get(item.produto_id) ?? `Abelha & Mel Item ${index + 1}`,
        quantity: item.quantidade,
        unit_price: Number(item.preco_unitario),
        currency_id: "BRL",
      })),
      preferredPaymentMethod:
        data.forma_pagamento === "credito" || data.forma_pagamento === "debito"
          ? data.forma_pagamento
          : null,
    });

    const { data: updatedOrder, error: paymentUpdateError } = await supabaseAdmin
      .from("pedidos")
      .update({
        observacoes: appendMercadoPagoMetadata(pedido.observacoes, {
          provider: "mercado_pago",
          status: "pending",
          reference: mercadoPagoCheckout.preferenceId,
          checkoutUrl: mercadoPagoCheckout.checkoutUrl,
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedido.id)
      .select("*")
      .single();
    if (paymentUpdateError) throw paymentUpdateError;

    return {
      ...updatedOrder,
      payment_checkout_url: mercadoPagoCheckout.checkoutUrl,
      payment_redirect_required: true,
    };
  });
