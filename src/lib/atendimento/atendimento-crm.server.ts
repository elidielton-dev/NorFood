import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeWhatsAppPhone, phonesMatchLoosely } from "@/lib/atendimento/whatsapp";

export type AtendimentoContactCrm = {
  clienteId: string | null;
  nome: string | null;
  telefone: string | null;
  pontos: number | null;
  pedidosRecentes: Array<{
    id: string;
    status: string;
    total: number;
    created_at: string;
  }>;
  totalPedidos: number;
};

async function findClienteByPhone(phone: string) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits || digits.length < 10) return null;

  const suffix = digits.slice(-8);
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, nome, telefone, pontos_fidelidade")
    .ilike("telefone", `%${suffix}%`)
    .limit(24);
  if (error) throw error;

  const match = (data ?? []).find((row) =>
    phonesMatchLoosely(digits, normalizeWhatsAppPhone(row.telefone ?? "")),
  );
  return match ?? null;
}

export async function fetchAtendimentoContactCrm(
  phone: string | null | undefined,
  tenantId?: string | null,
): Promise<AtendimentoContactCrm> {
  const empty: AtendimentoContactCrm = {
    clienteId: null,
    nome: null,
    telefone: phone ?? null,
    pontos: null,
    pedidosRecentes: [],
    totalPedidos: 0,
  };
  if (!phone?.trim()) return empty;

  const cliente = await findClienteByPhone(phone);
  if (!cliente) return empty;

  // Sem tenant, não lista pedidos (evita vazar histórico entre restaurantes).
  if (!tenantId) {
    return {
      clienteId: cliente.id,
      nome: cliente.nome ?? null,
      telefone: cliente.telefone ?? phone,
      pontos: cliente.pontos_fidelidade ?? null,
      pedidosRecentes: [],
      totalPedidos: 0,
    };
  }

  const {
    data: pedidos,
    error,
    count,
  } = await supabaseAdmin
    .from("pedidos")
    .select("id, status, total, created_at", { count: "exact" })
    .eq("cliente_id", cliente.id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;

  return {
    clienteId: cliente.id,
    nome: cliente.nome ?? null,
    telefone: cliente.telefone ?? phone,
    pontos: cliente.pontos_fidelidade ?? null,
    pedidosRecentes: (pedidos ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      total: Number(row.total ?? 0),
      created_at: row.created_at,
    })),
    totalPedidos: count ?? 0,
  };
}

export async function fetchAtendimentoStats() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [evolutionOpen, metaOpen, evolutionInbound, metaInbound, automationLogs] =
    await Promise.all([
      supabaseAdmin
        .from("whatsapp_chats")
        .select("id", { count: "exact", head: true })
        .eq("inbox_status", "open"),
      supabaseAdmin
        .from("waba_conversations")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabaseAdmin
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .gte("sent_at", since),
      supabaseAdmin
        .from("waba_messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_type", "customer")
        .gte("created_at", since),
      supabaseAdmin
        .from("waba_automation_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since)
        .eq("status", "success"),
    ]);

  return {
    openConversations: (evolutionOpen.count ?? 0) + (metaOpen.count ?? 0),
    inboundMessages7d: (evolutionInbound.count ?? 0) + (metaInbound.count ?? 0),
    automationsSent7d: automationLogs.count ?? 0,
  };
}
