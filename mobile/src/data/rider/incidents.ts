import { MOTOBOY_OCORRENCIAS_TABLE } from "./constants";
import { tryInsertNotification } from "./notifications";
import { getCurrentUser, requireSupabase } from "./supabase";
import { getActiveRiderTenantId } from "./tenant";

export async function reportRiderIncident(deliveryId: string, type: string, note: string) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();

  const { error } = await supabase.from(MOTOBOY_OCORRENCIAS_TABLE).insert({
    delivery_id: deliveryId,
    rider_id: user.id,
    tenant_id: getActiveRiderTenantId(),
    type,
    note,
  });
  if (error) throw error;

  await tryInsertNotification(
    user.id,
    "Ocorrencia registrada",
    type,
    "incident_logged",
    deliveryId,
  );
}
