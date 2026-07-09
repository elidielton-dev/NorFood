import type { AppState } from "../../types";
import { fetchDeliveries, fetchRiderSatelliteRows } from "./deliveries.repository";
import {
  MOTOBOY_MENSAGENS_TABLE,
  MOTOBOY_NOTIFICACOES_TABLE,
  MOTOBOY_OCORRENCIAS_TABLE,
  ENTREGADOR_PERFIS_TABLE,
} from "./constants";
import {
  buildEarnings,
  buildRiderProfile,
  mapIncidentRow,
  mapMessageRow,
  mapNotificationRow,
} from "./mappers";
import { getCurrentUser, requireSupabase } from "./supabase";
import { requireActiveTenantId } from "./tenant";
import type { ProfileRow, RiderProfileRow } from "./types";

export type RiderRemoteState = Pick<
  AppState,
  | "loggedIn"
  | "rememberLogin"
  | "activeTenantId"
  | "rider"
  | "deliveries"
  | "incidents"
  | "messages"
  | "notifications"
  | "earnings"
>;

export async function fetchRiderAppState(tenantId?: string | null): Promise<RiderRemoteState> {
  const user = await getCurrentUser();
  const supabase = requireSupabase();
  const scopedTenantId = tenantId ?? requireActiveTenantId();

  const [
    { data: profile },
    { data: riderProfile },
    deliveriesResult,
    incidentsResult,
    messagesResult,
    notificationsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nome, telefone, avatar_url")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    supabase
      .from(ENTREGADOR_PERFIS_TABLE)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle<RiderProfileRow>(),
    fetchDeliveries(user.id, scopedTenantId),
    fetchRiderSatelliteRows(user.id, scopedTenantId, MOTOBOY_OCORRENCIAS_TABLE),
    fetchRiderSatelliteRows(user.id, scopedTenantId, MOTOBOY_MENSAGENS_TABLE),
    fetchRiderSatelliteRows(user.id, scopedTenantId, MOTOBOY_NOTIFICACOES_TABLE),
  ]);

  if (deliveriesResult.error) throw deliveriesResult.error;
  if (incidentsResult.error) throw incidentsResult.error;
  if (messagesResult.error) throw messagesResult.error;
  if (notificationsResult.error) throw notificationsResult.error;

  const deliveries = deliveriesResult.data;
  const incidents = (incidentsResult.data ?? []).map(mapIncidentRow);
  const messages = (messagesResult.data ?? []).map(mapMessageRow);
  const notifications = (notificationsResult.data ?? []).map(mapNotificationRow);
  const rider = buildRiderProfile(user, profile ?? null, riderProfile ?? null);
  const earnings = buildEarnings(deliveries);

  return {
    loggedIn: true,
    rememberLogin: true,
    activeTenantId: scopedTenantId,
    rider,
    deliveries,
    incidents,
    messages,
    notifications,
    earnings,
  };
}
