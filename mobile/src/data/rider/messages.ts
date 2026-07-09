import type { DeliveryMessage } from "../../types";
import { MOTOBOY_MENSAGENS_TABLE } from "./constants";
import { getCurrentUser, requireSupabase } from "./supabase";
import { getActiveRiderTenantId } from "./tenant";
import { buildQuickLinks } from "./utils";

export async function sendRiderMessage(
  deliveryId: string,
  text: string,
  templateId?: string,
): Promise<DeliveryMessage> {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const tenantId = getActiveRiderTenantId();

  const { data: deliveryRow } = await supabase
    .from("entregas")
    .select("id, pedido_id")
    .eq("id", deliveryId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!deliveryRow) throw new Error("Entrega nao encontrada para envio da mensagem.");

  const { data: order } = await supabase
    .from("pedidos")
    .select("cliente_id")
    .eq("id", deliveryRow.pedido_id)
    .maybeSingle<{ cliente_id: string | null }>();

  let customerPhone = "";
  if (order?.cliente_id) {
    const { data: customer } = await supabase
      .from("profiles")
      .select("telefone")
      .eq("id", order.cliente_id)
      .maybeSingle<{ telefone: string | null }>();
    customerPhone = customer?.telefone ?? "";
  }

  const quickLinks = buildQuickLinks(customerPhone, text);

  const { error } = await supabase.from(MOTOBOY_MENSAGENS_TABLE).insert({
    delivery_id: deliveryId,
    rider_id: user.id,
    tenant_id: tenantId,
    template_id: templateId ?? null,
    text,
    customer_phone: customerPhone,
    customer_whatsapp: customerPhone,
    quick_whatsapp: quickLinks.whatsapp,
    quick_sms: quickLinks.sms,
  });
  if (error) throw error;

  return {
    id: `local-${Date.now()}`,
    deliveryId,
    riderId: user.id,
    templateId: templateId ?? null,
    text,
    customerPhone,
    customerWhatsapp: customerPhone,
    quickLinks,
    createdAt: new Date().toISOString(),
  };
}
