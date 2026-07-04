import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Enums, Tables } from "@/integrations/supabase/types";
import { assertStaffUserId, resolveStaffTenantId } from "@/lib/api/auth-helpers.server";
import {
  getOperationalConfig,
  resolveDeliveryFeeFromDb,
  validateAndPriceOrderItems,
  type OrderItemInput,
} from "@/lib/api/order-validation.server";
import { geocodeAddress } from "@/lib/geocoding";
import { normalizeWhatsAppPhone, phonesMatchLoosely } from "@/lib/whatsapp";

type FormaPagamento = Enums<"forma_pagamento">;
type PedidoRow = Tables<"pedidos">;

export type ModoVenda = "presencial" | "delivery" | "retirada";
export type OrigemVenda = "balcao" | "whatsapp" | "telefone" | "site" | "ifood";

export type ClienteEnderecoRow = {
  id: string;
  tenant_id: string;
  cliente_id: string | null;
  waba_contact_id: string | null;
  telefone: string | null;
  label: string | null;
  endereco: string;
  numero: string | null;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string | null;
  cep: string | null;
  referencia: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  last_used_at: string | null;
};

export type ClienteOmnichannelResult = {
  id: string;
  tipo: "profile" | "waba";
  nome: string;
  telefone: string | null;
  email: string | null;
  cliente_id: string | null;
  waba_contact_id: string | null;
  pontos: number | null;
};

function buildObservacoes(parts: Record<string, string | number | null | undefined>) {
  return Object.entries(parts)
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .map(([key, value]) => `${key}=${String(value).trim()}`)
    .join("; ");
}

function formatEnderecoCompleto(input: {
  endereco: string;
  numero?: string | null;
  complemento?: string | null;
  bairro: string;
  cidade?: string | null;
  cep?: string | null;
}) {
  const rua = [input.endereco, input.numero?.trim()].filter(Boolean).join(", ");
  const comp = input.complemento?.trim();
  const cidade = input.cidade?.trim();
  const cep = input.cep?.trim();
  return [rua, comp, input.bairro, cidade, cep].filter(Boolean).join(" - ");
}

/** Tabela criada em 20260705120000_omnichannel_pdv.sql (ainda fora dos types gerados). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clienteEnderecosTable(supabaseAdmin: any) {
  return supabaseAdmin.from("cliente_enderecos");
}

export const searchClienteOmnichannelServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; q: string }) => input)
  .handler(async ({ context, data }): Promise<ClienteOmnichannelResult[]> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao PDV.");
    await resolveStaffTenantId(context.userId, data.tenantSlug);
    const term = data.q.trim().toLowerCase();
    if (term.length < 2) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const digits = normalizeWhatsAppPhone(term);

    const safeTerm = term.replace(/[%_,]/g, " ");
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, telefone, pontos_fidelidade")
      .or(`nome.ilike.%${safeTerm}%,telefone.ilike.%${safeTerm}%`)
      .limit(12);
    if (profilesError) throw profilesError;

    const { data: wabaContacts, error: wabaError } = await supabaseAdmin
      .from("waba_contacts")
      .select("id, name, phone, email")
      .or(`name.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%`)
      .limit(12);
    if (wabaError) throw wabaError;

    const results: ClienteOmnichannelResult[] = [];
    const seenPhones = new Set<string>();

    for (const row of profiles ?? []) {
      const phone = row.telefone ?? null;
      const key = phone ? normalizeWhatsAppPhone(phone) : row.id;
      if (seenPhones.has(key)) continue;
      seenPhones.add(key);
      if (digits && phone && !normalizeWhatsAppPhone(phone).includes(digits.slice(-8))) {
        if (!row.nome?.toLowerCase().includes(term)) continue;
      }
      results.push({
        id: `profile:${row.id}`,
        tipo: "profile",
        nome: row.nome ?? "Cliente",
        telefone: phone,
        email: null,
        cliente_id: row.id,
        waba_contact_id: null,
        pontos: row.pontos_fidelidade ?? null,
      });
    }

    for (const row of wabaContacts ?? []) {
      const phone = row.phone ?? null;
      const key = phone ? normalizeWhatsAppPhone(phone) : row.id;
      if (seenPhones.has(key)) continue;
      const profileMatch = (profiles ?? []).find((p) =>
        phonesMatchLoosely(normalizeWhatsAppPhone(phone ?? ""), normalizeWhatsAppPhone(p.telefone ?? "")),
      );
      if (profileMatch) continue;
      seenPhones.add(key);
      results.push({
        id: `waba:${row.id}`,
        tipo: "waba",
        nome: row.name ?? phone ?? "Contato WhatsApp",
        telefone: phone,
        email: row.email ?? null,
        cliente_id: null,
        waba_contact_id: row.id,
        pontos: null,
      });
    }

    return results.slice(0, 10);
  });

export const listClienteEnderecosServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      tenantSlug: string;
      clienteId?: string | null;
      wabaContactId?: string | null;
      telefone?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }): Promise<ClienteEnderecoRow[]> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao PDV.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = clienteEnderecosTable(supabaseAdmin)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("is_default", { ascending: false })
      .order("last_used_at", { ascending: false, nullsFirst: false });

    if (data.clienteId) query = query.eq("cliente_id", data.clienteId);
    else if (data.wabaContactId) query = query.eq("waba_contact_id", data.wabaContactId);
    else if (data.telefone?.trim()) {
      const digits = normalizeWhatsAppPhone(data.telefone);
      query = query.ilike("telefone", `%${digits.slice(-8)}%`);
    } else return [];

    const { data: rows, error } = await query.limit(20);
    if (error) throw error;
    return (rows ?? []) as ClienteEnderecoRow[];
  });

export const saveClienteEnderecoServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      tenantSlug: string;
      id?: string | null;
      clienteId?: string | null;
      wabaContactId?: string | null;
      telefone?: string | null;
      label?: string | null;
      endereco: string;
      numero?: string | null;
      complemento?: string | null;
      bairro: string;
      cidade?: string | null;
      estado?: string | null;
      cep?: string | null;
      referencia?: string | null;
      isDefault?: boolean;
    }) => input,
  )
  .handler(async ({ context, data }): Promise<ClienteEnderecoRow> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao PDV.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload = {
      tenant_id: tenantId,
      cliente_id: data.clienteId ?? null,
      waba_contact_id: data.wabaContactId ?? null,
      telefone: data.telefone ?? null,
      label: data.label?.trim() || "Principal",
      endereco: data.endereco.trim(),
      numero: data.numero?.trim() || null,
      complemento: data.complemento?.trim() || null,
      bairro: data.bairro.trim(),
      cidade: data.cidade?.trim() || "",
      estado: data.estado?.trim() || "",
      cep: data.cep?.trim() || null,
      referencia: data.referencia?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (data.isDefault) {
      let clearQuery = clienteEnderecosTable(supabaseAdmin)
        .update({ is_default: false })
        .eq("tenant_id", tenantId);
      if (data.clienteId) clearQuery = clearQuery.eq("cliente_id", data.clienteId);
      else if (data.wabaContactId) clearQuery = clearQuery.eq("waba_contact_id", data.wabaContactId);
      await clearQuery;
    }

    if (data.id) {
      const { data: row, error } = await clienteEnderecosTable(supabaseAdmin)
        .update({ ...payload, is_default: data.isDefault ?? false })
        .eq("id", data.id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      return row as ClienteEnderecoRow;
    }

    const { data: row, error } = await clienteEnderecosTable(supabaseAdmin)
      .insert({ ...payload, is_default: data.isDefault ?? false })
      .select("*")
      .single();
    if (error) throw error;
    return row as ClienteEnderecoRow;
  });

export const fetchUltimoPedidoClienteServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { tenantSlug: string; clienteId?: string | null; telefone?: string | null }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao PDV.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let pedidoQuery = supabaseAdmin
      .from("pedidos")
      .select("id, numero, total, created_at, observacoes, endereco")
      .eq("tenant_id", tenantId)
      .not("status", "in", "(cancelado)")
      .order("created_at", { ascending: false })
      .limit(1);

    if (data.clienteId) {
      pedidoQuery = pedidoQuery.eq("cliente_id", data.clienteId);
    } else if (data.telefone?.trim()) {
      const digits = normalizeWhatsAppPhone(data.telefone);
      pedidoQuery = pedidoQuery.ilike("observacoes", `%telefone=${digits}%`);
    } else {
      return null;
    }

    const { data: pedido, error } = await pedidoQuery.maybeSingle();
    if (error) throw error;
    if (!pedido) return null;

    const { data: itens, error: itensError } = await supabaseAdmin
      .from("pedido_itens")
      .select("produto_id, quantidade, preco_unitario, observacao, produtos(nome)")
      .eq("pedido_id", pedido.id);
    if (itensError) throw itensError;

    return { pedido, itens: itens ?? [] };
  });

export const resolveDeliveryTaxaServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantSlug: string; bairro: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao PDV.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    const taxa = await resolveDeliveryFeeFromDb(data.bairro, tenantId);
    return { taxa };
  });

type CreateOmnichannelOrderInput = {
  tenantSlug: string;
  modo: ModoVenda;
  origem: OrigemVenda;
  forma_pagamento: string;
  troco_para?: number | null;
  desconto?: number;
  pago_no_balcao?: boolean;
  vendedor_id?: string | null;
  uso_consumo?: boolean;
  cliente: {
    cliente_id?: string | null;
    waba_contact_id?: string | null;
    nome: string;
    telefone?: string | null;
    email?: string | null;
  };
  endereco?: {
    endereco_id?: string | null;
    endereco: string;
    numero?: string | null;
    complemento?: string | null;
    bairro: string;
    cidade?: string | null;
    estado?: string | null;
    cep?: string | null;
    referencia?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  whatsapp_chat_id?: string | null;
  observacoes_extra?: string | null;
  itens: OrderItemInput[];
};

export const createOmnichannelOrderServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: CreateOmnichannelOrderInput) => input)
  .handler(async ({ context, data }): Promise<PedidoRow> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao PDV.");
    const tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);

    const config = await getOperationalConfig(tenantId);
    if (!config.loja_aberta) {
      throw new Error("A loja esta fechada no momento.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureOperationalOrderRecords } = await import("@/lib/api/mercado-pago.server");
    const { assertCanCreateTenantOrder } = await import("@/lib/tenant/tenant-plan.server");
    await assertCanCreateTenantOrder(tenantId);

    const { itens, subtotal } = await validateAndPriceOrderItems(data.itens, {
      checkStock: true,
    });

    const desconto = Math.max(0, Number(data.desconto ?? 0));
    const subtotalLiquido = Math.max(0, subtotal - desconto);

    if (subtotalLiquido < Number(config.pedido_minimo) && data.modo !== "presencial") {
      throw new Error(
        `Pedido minimo de R$ ${Number(config.pedido_minimo).toFixed(2).replace(".", ",")}.`,
      );
    }

    const isDelivery = data.modo === "delivery";
    const isRetirada = data.modo === "retirada";
    const taxaEntrega =
      isDelivery && data.endereco?.bairro
        ? await resolveDeliveryFeeFromDb(data.endereco.bairro, tenantId)
        : 0;
    const total = subtotalLiquido + taxaEntrega;

    let enderecoCompleto: string | null = null;
    let geocoded: { latitude: number; longitude: number } | null = null;

    if (isDelivery && data.endereco) {
      enderecoCompleto = formatEnderecoCompleto(data.endereco);
      if (data.endereco.latitude != null && data.endereco.longitude != null) {
        geocoded = { latitude: data.endereco.latitude, longitude: data.endereco.longitude };
      } else {
        geocoded = await geocodeAddress({
          endereco: data.endereco.endereco,
          bairro: data.endereco.bairro,
          cidade: data.endereco.cidade ?? undefined,
          estado: data.endereco.estado ?? undefined,
          cep: data.endereco.cep ?? undefined,
        });
      }

      if (data.endereco.endereco_id) {
        await clienteEnderecosTable(supabaseAdmin)
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", data.endereco.endereco_id);
      }
    }

    const observacoes = buildObservacoes({
      cliente: data.cliente.nome,
      telefone: data.cliente.telefone,
      email: data.cliente.email,
      bairro: data.endereco?.bairro,
      endereco: enderecoCompleto,
      referencia: data.endereco?.referencia,
      origem: data.origem,
      modo: data.modo,
      vendedor: data.vendedor_id,
      uso_consumo: data.uso_consumo ? "1" : null,
      desconto: desconto > 0 ? desconto.toFixed(2) : null,
      retirada: isRetirada ? "1" : null,
      pago_no_balcao: data.pago_no_balcao ? "1" : null,
      extra: data.observacoes_extra,
    });

    const canal = isDelivery || isRetirada ? "delivery" : "balcao";
    const status = isDelivery ? "aberto" : "em_preparo";

    const pedidoInsert: Record<string, unknown> = {
      canal,
      tenant_id: tenantId,
      cliente_id: data.cliente.cliente_id ?? null,
      status,
      subtotal,
      desconto,
      taxa_entrega: taxaEntrega,
      total,
      forma_pagamento: data.forma_pagamento as FormaPagamento,
      troco_para: data.troco_para ?? null,
      endereco: isDelivery ? enderecoCompleto : null,
      latitude_cliente: geocoded?.latitude ?? null,
      longitude_cliente: geocoded?.longitude ?? null,
      observacoes: observacoes || null,
      origem_venda: data.origem,
      whatsapp_chat_id: data.whatsapp_chat_id ?? null,
      waba_contact_id: data.cliente.waba_contact_id ?? null,
      modo_entrega: data.modo,
      endereco_id: data.endereco?.endereco_id ?? null,
    };

    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos")
      .insert(pedidoInsert as never)
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

    if (isDelivery) {
      await ensureOperationalOrderRecords({
        id: pedido.id,
        numero: pedido.numero,
        endereco: enderecoCompleto ?? "Endereco nao informado",
        taxa_entrega: taxaEntrega,
        total,
        forma_pagamento: pedido.forma_pagamento,
        bairro: data.endereco!.bairro,
        tenant_id: tenantId,
        createFinanceEntry: Boolean(data.pago_no_balcao),
      });
    } else {
      const categoria = isRetirada ? "Vendas retirada" : "Vendas balcão";
      const { error: financeError } = await supabaseAdmin.from("lancamentos_financeiros").insert({
        tipo: "entrada",
        descricao: `${isRetirada ? "Retirada" : "Balcão"} Pedido #${pedido.numero}`,
        categoria,
        valor: total,
        forma: data.forma_pagamento as FormaPagamento,
        pedido_id: pedido.id,
        tenant_id: tenantId,
      });
      if (financeError) throw financeError;
    }

    return pedido;
  });

export const fetchBairrosEntregaPdvServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((tenantSlug: string) => tenantSlug)
  .handler(async ({ context, data: tenantSlug }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao PDV.");
    const tenantId = await resolveStaffTenantId(context.userId, tenantSlug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("bairros_entrega")
      .select("id, nome, taxa, ativo")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("nome");
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      nome: r.nome,
      taxa: Number(r.taxa),
    }));
  });
