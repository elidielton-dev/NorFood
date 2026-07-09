import { MOTOBOY_NOTIFICACOES_TABLE } from "./constants";
import { getCurrentUser, requireSupabase } from "./supabase";
import { getActiveRiderTenantId } from "./tenant";

async function insertNotification(
  userId: string,
  title: string,
  body: string,
  type: string,
  deliveryId: string | null,
) {
  const supabase = requireSupabase();
  const { error } = await supabase.from(MOTOBOY_NOTIFICACOES_TABLE).insert({
    rider_id: userId,
    tenant_id: getActiveRiderTenantId(),
    title,
    body,
    type,
    delivery_id: deliveryId,
  });
  if (error) throw error;
}

export async function tryInsertNotification(
  userId: string,
  title: string,
  body: string,
  type: string,
  deliveryId: string | null,
) {
  try {
    await insertNotification(userId, title, body, type, deliveryId);
  } catch (error) {
    console.warn("[mobile] Falha ao registrar notificacao do motoboy.", error);
  }
}

export async function markNotificationsRead() {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from(MOTOBOY_NOTIFICACOES_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("rider_id", user.id)
    .eq("tenant_id", getActiveRiderTenantId())
    .is("read_at", null);
  if (error) throw error;
}
