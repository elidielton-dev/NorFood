import { ENTREGADOR_PERFIS_TABLE } from "./constants";
import { getCurrentUser, requireSupabase } from "./supabase";
import { getActiveRiderTenantId } from "./tenant";

export async function sendRiderLocation(
  _deliveryId: string,
  payload: {
    riderId: string;
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    battery?: number | null;
    status?: string;
  },
) {
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  const riderId = payload.riderId || user.id;
  const status = payload.status ?? "em_rota";

  const [locationResult, profileResult] = await Promise.all([
    supabase.from("entregadores_localizacao").upsert(
      {
        entregador_id: riderId,
        tenant_id: getActiveRiderTenantId(),
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed ?? null,
        heading: payload.heading ?? null,
        accuracy: payload.accuracy ?? null,
        battery: payload.battery ?? null,
        status,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "entregador_id",
      },
    ),
    supabase.from(ENTREGADOR_PERFIS_TABLE).upsert(
      {
        user_id: riderId,
        tenant_id: getActiveRiderTenantId(),
        online: status !== "offline",
      },
      {
        onConflict: "user_id",
      },
    ),
  ]);

  if (locationResult.error) throw locationResult.error;
  if (profileResult.error) throw profileResult.error;

  return { ok: true };
}
