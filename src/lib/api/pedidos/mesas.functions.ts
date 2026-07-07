import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth/auth-helpers.server";
import {
  validateAndPriceOrderItems,
  type OrderItemInput,
} from "@/lib/api/pedidos/order-validation.server";

type FormaPagamento = Enums<"forma_pagamento">;
type MesaStatus = Enums<"mesa_status">;
type MesaRow = Tables<"mesas">;
type PedidoRow = Tables<"pedidos">;

type OpenMesaInput = {
  mesaId: string;
  tenantSlug: string;
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
  tenantSlug: string;
};

type UpdateMesaStatusInput = {
  mesaId: string;
  status: MesaStatus;
  tenantSlug: string;
};

type AddMesaItemsInput = {
  mesaId: string;
  pedidoId: string;
  tenantSlug: string;
  itens: OrderItemInput[];
};

type MergeMesasInput = {
  tenantSlug: string;
  mesaPrincipalId: string;
  mesaIds: string[];
};

async function assertMesaBelongsToTenant(mesaId: string, tenantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("mesas")
    .select("id, tenant_id")
    .eq("id", mesaId)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data as { tenant_id?: string | null }).tenant_id !== tenantId) {
    throw new Error("Mesa não encontrada neste restaurante.");
  }
}

async function findActivePedidoForMesa(mesaId: string, tenantId: string): Promise<PedidoRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: direct, error: directError } = await supabaseAdmin
    .from("pedidos")
    .select("*")
    .eq("mesa_id", mesaId)
    .eq("tenant_id", tenantId)
    .not("status", "in", "(entregue,cancelado)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (directError) throw directError;
  if (direct) return direct;

  const { data: vinculo, error: vinculoError } = await supabaseAdmin
    .from("mesa_vinculos")
    .select("pedido_id")
    .eq("mesa_id", mesaId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (vinculoError) throw vinculoError;
  if (!vinculo) return null;

  const { data: pedido, error: pedidoError } = await supabaseAdmin
    .from("pedidos")
    .select("*")
    .eq("id", vinculo.pedido_id)
    .eq("tenant_id", tenantId)
    .not("status", "in", "(entregue,cancelado)")
    .maybeSingle();
  if (pedidoError) throw pedidoError;
  return pedido;
}

async function assertPedidoBelongsToMesa(
  pedidoId: string,
  mesaId: string,
  tenantId: string,
): Promise<PedidoRow> {
  const pedido = await findActivePedidoForMesa(mesaId, tenantId);
  if (!pedido || pedido.id !== pedidoId) {
    throw new Error("Pedido não encontrado para esta mesa.");
  }
  return pedido;
}

export const updateMesaStatusServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: UpdateMesaStatusInput) => input)
  .handler(async ({ context, data }): Promise<MesaRow> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel de mesas.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    await assertMesaBelongsToTenant(data.mesaId, tenantId);

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
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    await assertMesaBelongsToTenant(data.mesaId, tenantId);

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

    const existingOrder = await findActivePedidoForMesa(data.mesaId, tenantId);

    if (existingOrder) {
      throw new Error(`A mesa ja possui o pedido #${existingOrder.numero} em andamento.`);
    }

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos")
      .insert({
        canal: "mesa",
        mesa_id: data.mesaId,
        tenant_id: tenantId,
        status: "em_preparo",
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
      tenant_id: tenantId,
    });
    if (financeError) throw financeError;

    return pedido;
  });

export const addMesaOrderItemsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: AddMesaItemsInput) => input)
  .handler(async ({ context, data }): Promise<PedidoRow> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel de mesas.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    await assertMesaBelongsToTenant(data.mesaId, tenantId);

    const pedido = await assertPedidoBelongsToMesa(data.pedidoId, data.mesaId, tenantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { itens, subtotal: novoSubtotal } = await validateAndPriceOrderItems(data.itens, {
      checkStock: true,
    });

    if (!itens.length) {
      throw new Error("Adicione pelo menos um item.");
    }

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

    const subtotalAtual = Number(pedido.subtotal ?? 0);
    const totalAtual = Number(pedido.total ?? 0);
    const subtotal = subtotalAtual + novoSubtotal;
    const total = totalAtual + novoSubtotal;

    const { data: mesa, error: mesaError } = await supabaseAdmin
      .from("mesas")
      .select("numero")
      .eq("id", data.mesaId)
      .single();
    if (mesaError) throw mesaError;

    const { data: atualizado, error: updateError } = await supabaseAdmin
      .from("pedidos")
      .update({ subtotal, total })
      .eq("id", pedido.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const { error: financeError } = await supabaseAdmin.from("lancamentos_financeiros").insert({
      tipo: "entrada",
      descricao: `Mesa #${mesa.numero} Pedido #${pedido.numero} (itens adicionais)`,
      categoria: "Vendas mesa",
      valor: novoSubtotal,
      forma: pedido.forma_pagamento,
      pedido_id: pedido.id,
      tenant_id: tenantId,
    });
    if (financeError) throw financeError;

    return atualizado;
  });

export const mergeMesasServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: MergeMesasInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel de mesas.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const secundarias = [...new Set(data.mesaIds.filter((id) => id !== data.mesaPrincipalId))];

    if (!secundarias.length) {
      throw new Error("Selecione ao menos uma mesa para juntar.");
    }

    await assertMesaBelongsToTenant(data.mesaPrincipalId, tenantId);
    for (const mesaId of secundarias) {
      await assertMesaBelongsToTenant(mesaId, tenantId);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pedidoPrincipal = await findActivePedidoForMesa(data.mesaPrincipalId, tenantId);
    if (!pedidoPrincipal) {
      throw new Error("A mesa principal precisa ter um pedido ativo para juntar outras mesas.");
    }

    for (const mesaId of secundarias) {
      const { data: mesa, error: mesaError } = await supabaseAdmin
        .from("mesas")
        .select("id,numero,status")
        .eq("id", mesaId)
        .single();
      if (mesaError) throw mesaError;

      if (mesa.status === "reservada") {
        throw new Error(`A mesa #${mesa.numero} está reservada.`);
      }

      const pedidoSecundario = await findActivePedidoForMesa(mesaId, tenantId);

      if (pedidoSecundario && pedidoSecundario.id !== pedidoPrincipal.id) {
        const { data: itensSecundarios, error: itensError } = await supabaseAdmin
          .from("pedido_itens")
          .select("produto_id, quantidade, preco_unitario, observacao")
          .eq("pedido_id", pedidoSecundario.id);
        if (itensError) throw itensError;

        if (itensSecundarios?.length) {
          const { error: insertError } = await supabaseAdmin.from("pedido_itens").insert(
            itensSecundarios.map((item) => ({
              pedido_id: pedidoPrincipal.id,
              produto_id: item.produto_id,
              quantidade: item.quantidade,
              preco_unitario: item.preco_unitario,
              observacao: item.observacao,
            })),
          );
          if (insertError) throw insertError;

          const valorSecundario = Number(pedidoSecundario.total ?? 0);
          const subtotal = Number(pedidoPrincipal.subtotal ?? 0) + Number(pedidoSecundario.subtotal ?? 0);
          const total = Number(pedidoPrincipal.total ?? 0) + valorSecundario;

          const { error: updatePrincipalError } = await supabaseAdmin
            .from("pedidos")
            .update({ subtotal, total })
            .eq("id", pedidoPrincipal.id);
          if (updatePrincipalError) throw updatePrincipalError;

          pedidoPrincipal.subtotal = subtotal;
          pedidoPrincipal.total = total;
        }

        const { error: cancelError } = await supabaseAdmin
          .from("pedidos")
          .update({ status: "cancelado", observacoes: `Mesclado ao pedido #${pedidoPrincipal.numero}` })
          .eq("id", pedidoSecundario.id);
        if (cancelError) throw cancelError;

        if (pedidoSecundario.mesa_id) {
          await supabaseAdmin
            .from("mesa_vinculos")
            .delete()
            .eq("mesa_id", pedidoSecundario.mesa_id);
        }
      }

      const { data: vinculoExistente, error: vinculoCheckError } = await supabaseAdmin
        .from("mesa_vinculos")
        .select("id")
        .eq("mesa_id", mesaId)
        .maybeSingle();
      if (vinculoCheckError) throw vinculoCheckError;

      if (!vinculoExistente && mesaId !== pedidoPrincipal.mesa_id) {
        const { error: vinculoError } = await supabaseAdmin.from("mesa_vinculos").insert({
          tenant_id: tenantId,
          pedido_id: pedidoPrincipal.id,
          mesa_id: mesaId,
        });
        if (vinculoError) throw vinculoError;
      }

      const { error: mesaUpdateError } = await supabaseAdmin
        .from("mesas")
        .update({ status: "ocupada" })
        .eq("id", mesaId);
      if (mesaUpdateError) throw mesaUpdateError;
    }

    return { ok: true, pedidoId: pedidoPrincipal.id };
  });

export const finalizeMesaOrderServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: FinalizeMesaInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel de mesas.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    await assertMesaBelongsToTenant(data.mesaId, tenantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pedido, error: pedidoCheckError } = await supabaseAdmin
      .from("pedidos")
      .select("id, tenant_id")
      .eq("id", data.pedidoId)
      .maybeSingle();
    if (pedidoCheckError) throw pedidoCheckError;
    if (!pedido || (pedido as { tenant_id?: string | null }).tenant_id !== tenantId) {
      throw new Error("Pedido não encontrado neste restaurante.");
    }

    const { data: pedidoCompleto, error: pedidoLoadError } = await supabaseAdmin
      .from("pedidos")
      .select("mesa_id")
      .eq("id", data.pedidoId)
      .single();
    if (pedidoLoadError) throw pedidoLoadError;

    const { data: vinculos, error: vinculosError } = await supabaseAdmin
      .from("mesa_vinculos")
      .select("mesa_id")
      .eq("pedido_id", data.pedidoId);
    if (vinculosError) throw vinculosError;

    const mesaIds = new Set<string>([data.mesaId]);
    if (pedidoCompleto.mesa_id) mesaIds.add(pedidoCompleto.mesa_id);
    for (const vinculo of vinculos ?? []) {
      mesaIds.add(vinculo.mesa_id);
    }

    const { error: orderError } = await supabaseAdmin
      .from("pedidos")
      .update({ status: "entregue" })
      .eq("id", data.pedidoId);
    if (orderError) throw orderError;

    const { error: mesaError } = await supabaseAdmin
      .from("mesas")
      .update({ status: "livre" })
      .in("id", [...mesaIds]);
    if (mesaError) throw mesaError;

    const { error: vinculosDeleteError } = await supabaseAdmin
      .from("mesa_vinculos")
      .delete()
      .eq("pedido_id", data.pedidoId);
    if (vinculosDeleteError) throw vinculosDeleteError;

    const { tryAutoEmitNfceForPedido } = await import("@/lib/api/fiscal/fiscal.server");
    void tryAutoEmitNfceForPedido(data.pedidoId, "mesas");

    return { ok: true };
  });

type ListMesaPedidoItensInput = {
  pedidoId: string;
  tenantSlug: string;
};

export const listMesaPedidoItensServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: ListMesaPedidoItensInput) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel de mesas.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos")
      .select("id, tenant_id")
      .eq("id", data.pedidoId)
      .maybeSingle();
    if (pedidoError) throw pedidoError;
    if (!pedido || (pedido as { tenant_id?: string | null }).tenant_id !== tenantId) {
      throw new Error("Pedido não encontrado neste restaurante.");
    }

    const { data: itens, error } = await supabaseAdmin
      .from("pedido_itens")
      .select("id, pedido_id, produto_id, quantidade, preco_unitario, observacao, produtos(nome, imagem_url)")
      .eq("pedido_id", data.pedidoId);
    if (error) throw error;
    return itens ?? [];
  });
