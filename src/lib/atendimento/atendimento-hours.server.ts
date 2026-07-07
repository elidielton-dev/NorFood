import { getAttendanceClosingBoundary, resolveStoreOpenStatus } from "@/lib/shared/horarios";
import { fetchHorariosConfigFromDb, fetchHorariosFromDb } from "@/lib/api/tenant/horarios.server";
import { WABA_WORKSPACE_ID } from "@/lib/waba/types";

type AttendanceCloseMarkerRow = {
  attendance_close_marker: string | null;
};

async function getAttendanceCloseMarker(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("config_operacional")
    .select("attendance_close_marker")
    .eq("id", "default")
    .maybeSingle<AttendanceCloseMarkerRow>();

  if (error) {
    if (/attendance_close_marker|does not exist|schema cache|PGRST20/i.test(error.message)) {
      return null;
    }
    throw error;
  }

  return data?.attendance_close_marker ?? null;
}

async function setAttendanceCloseMarker(marker: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("config_operacional")
    .update({
      attendance_close_marker: marker,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");

  if (error) {
    if (/attendance_close_marker|does not exist|schema cache|PGRST20/i.test(error.message)) {
      return;
    }
    throw error;
  }
}

async function closeEvolutionChatsForStoreClosed(boundaryIso: string) {
  const { closeAtendimentoChatsForStoreClosed } = await import("@/lib/api/atendimento/whatsapp-store.server");
  return closeAtendimentoChatsForStoreClosed(boundaryIso);
}

async function closeEvolutionChatsFromPreviousDays(reference: Date) {
  const { closeAtendimentoChatsFromPreviousDays } = await import("@/lib/api/atendimento/whatsapp-store.server");
  return closeAtendimentoChatsFromPreviousDays(reference);
}

async function countActiveEvolutionChats() {
  const { countActiveAtendimentoChats } = await import("@/lib/api/atendimento/whatsapp-store.server");
  return countActiveAtendimentoChats();
}

async function closeWabaConversationsForStoreClosed(boundaryIso: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const boundaryMs = new Date(boundaryIso).getTime();

  const { data, error } = await supabaseAdmin
    .from("waba_conversations")
    .select("id, status, attendance_opened_at, last_message_at")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .or("status.is.null,status.eq.open,status.eq.pending");
  if (error) throw error;

  const customerAfterBoundary = await getWabaConversationIdsWithCustomerMessageAfter(boundaryIso);

  const ids = (data ?? [])
    .filter((row) => {
      if (row.attendance_opened_at && new Date(row.attendance_opened_at).getTime() >= boundaryMs) {
        return false;
      }
      if (row.last_message_at && new Date(row.last_message_at).getTime() >= boundaryMs) {
        return false;
      }
      if (customerAfterBoundary.has(row.id)) return false;
      return true;
    })
    .map((row) => row.id);
  if (ids.length === 0) return 0;

  const { error: updateError } = await supabaseAdmin
    .from("waba_conversations")
    .update({ status: "closed", updated_at: now })
    .in("id", ids);
  if (updateError) throw updateError;
  return ids.length;
}

async function closeWabaConversationsFromPreviousDays(reference: Date) {
  const { isMessageBeforeCalendarDay, STORE_TIMEZONE } = await import("@/lib/shared/horarios");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("waba_conversations")
    .select("id, status, last_message_at")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .or("status.is.null,status.eq.open,status.eq.pending");
  if (error) throw error;

  const ids = (data ?? [])
    .filter((row) => isMessageBeforeCalendarDay(row.last_message_at, reference, STORE_TIMEZONE))
    .map((row) => row.id);
  if (ids.length === 0) return 0;

  const { error: updateError } = await supabaseAdmin
    .from("waba_conversations")
    .update({ status: "closed", updated_at: now })
    .in("id", ids);
  if (updateError) throw updateError;
  return ids.length;
}

async function countActiveWabaConversations() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("waba_conversations")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .or("status.is.null,status.eq.open,status.eq.pending");

  if (error) throw error;
  return count ?? 0;
}

async function countActiveAtendimentoConversations() {
  const [evolution, waba] = await Promise.all([
    countActiveEvolutionChats(),
    countActiveWabaConversations(),
  ]);
  return evolution + waba;
}

export async function isStoreOpenForAtendimento(now = new Date()) {
  const [configResult, horariosResult] = await Promise.all([
    fetchHorariosConfigFromDb(),
    fetchHorariosFromDb(),
  ]);
  const status = resolveStoreOpenStatus(configResult.config, horariosResult.horarios, now);
  return status.abertaAgora;
}

async function getEffectiveClosingBoundary(now = new Date()) {
  const [configResult, horariosResult] = await Promise.all([
    fetchHorariosConfigFromDb(),
    fetchHorariosFromDb(),
  ]);
  const config = configResult.config;
  const horarios = horariosResult.horarios;
  const status = resolveStoreOpenStatus(config, horarios, now);

  if (status.abertaAgora) return null;

  const boundary = getAttendanceClosingBoundary(status, config, now);
  if (!boundary) return null;

  const marker = await getAttendanceCloseMarker();
  const markerMs = marker ? new Date(marker).getTime() : null;
  const manualClose = config.pausa_imediata || !config.horario_automatico;
  if (manualClose && markerMs != null) {
    return new Date(markerMs);
  }
  return boundary;
}

/** Inbound do cliente apos o horario de fechamento da loja (ex.: Nataly as 20:39). */
export async function isAfterHoursCustomerActivity(activityAt: string | Date, now = new Date()) {
  const activityDate = typeof activityAt === "string" ? new Date(activityAt) : activityAt;
  if (await isStoreOpenForAtendimento(activityDate)) return false;

  const boundary = await getEffectiveClosingBoundary(now);
  if (!boundary) return false;

  return activityDate.getTime() >= boundary.getTime();
}

/** Ancora da sessao atual: primeira mensagem apos o ultimo fechamento, nao "agora". */
export async function resolveAttendanceSessionAnchor(chatId: string, activityAt: string) {
  const { findChatIdsForMessageHistory } = await import("@/lib/api/atendimento/whatsapp-store.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const chatIds = await findChatIdsForMessageHistory(chatId);
  const boundary = await getEffectiveClosingBoundary();
  const sinceIso = boundary?.toISOString() ?? activityAt;

  const { data: inbound, error: inboundError } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("sent_at")
    .in("chat_id", chatIds)
    .eq("direction", "inbound")
    .gte("sent_at", sinceIso)
    .order("sent_at", { ascending: true })
    .limit(1);
  if (inboundError) throw inboundError;
  if (inbound?.[0]?.sent_at) return inbound[0].sent_at;

  const { data: anyMsg, error: anyError } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("sent_at")
    .in("chat_id", chatIds)
    .gte("sent_at", sinceIso)
    .order("sent_at", { ascending: true })
    .limit(1);
  if (anyError) throw anyError;
  if (anyMsg?.[0]?.sent_at) return anyMsg[0].sent_at;

  return activityAt;
}

export async function syncAtendimentoSessionOnActivity(chatId: string, activityAt?: string) {
  const sessionAt = activityAt ?? new Date().toISOString();
  const activityMs = new Date(sessionAt).getTime();
  const { updateWhatsAppChatInboxStatus } = await import("@/lib/api/atendimento/whatsapp-store.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error: readError } = await supabaseAdmin
    .from("whatsapp_chats")
    .select("inbox_status, attendance_opened_at")
    .eq("id", chatId)
    .maybeSingle<{ inbox_status: string | null; attendance_opened_at: string | null }>();

  if (readError) throw readError;
  if (!row) return;

  if (row.inbox_status === "closed") {
    const anchor = await resolveAttendanceSessionAnchor(chatId, sessionAt);
    const { error } = await supabaseAdmin
      .from("whatsapp_chats")
      .update({
        inbox_status: "open",
        attendance_opened_at: anchor,
        updated_at: anchor,
      })
      .eq("id", chatId)
      .eq("inbox_status", "closed");

    if (error) {
      if (/attendance_opened_at|does not exist|schema cache|PGRST20/i.test(error.message)) {
        await updateWhatsAppChatInboxStatus(chatId, "open");
        return;
      }
      throw error;
    }
    return;
  }

  if (!row.attendance_opened_at) {
    const anchor = await resolveAttendanceSessionAnchor(chatId, sessionAt);
    const { error } = await supabaseAdmin
      .from("whatsapp_chats")
      .update({
        attendance_opened_at: anchor,
        updated_at: anchor,
      })
      .eq("id", chatId);

    if (error && !/attendance_opened_at|does not exist|schema cache|PGRST20/i.test(error.message)) {
      throw error;
    }
    return;
  }

  const currentSessionMs = new Date(row.attendance_opened_at).getTime();
  if (activityMs > currentSessionMs + 1000) {
    return;
  }
}

export async function reconcileAtendimentoSessionFromRecentMessages(chatId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: chat, error: chatError } = await supabaseAdmin
    .from("whatsapp_chats")
    .select("inbox_status, attendance_opened_at")
    .eq("id", chatId)
    .maybeSingle<{ inbox_status: string | null; attendance_opened_at: string | null }>();
  if (chatError) throw chatError;
  if (!chat || chat.inbox_status === "closed" || !chat.attendance_opened_at) return;

  const sessionMs = new Date(chat.attendance_opened_at).getTime();
  const windowStart = new Date(sessionMs - 6 * 60 * 60 * 1000).toISOString();

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("sent_at")
    .eq("chat_id", chatId)
    .gte("sent_at", windowStart)
    .lt("sent_at", chat.attendance_opened_at)
    .order("sent_at", { ascending: true })
    .limit(1);
  if (messagesError) throw messagesError;

  const earliest = messages?.[0]?.sent_at;
  if (earliest) {
    await syncAtendimentoSessionOnActivity(chatId, earliest);
  }
}

export async function ensureCustomerInboundKeepsConversationOpen(
  chatId: string,
  activityAt: string,
) {
  const afterHours = await isAfterHoursCustomerActivity(activityAt);
  if (!afterHours) {
    if (await isStoreOpenForAtendimento()) {
      await syncAtendimentoSessionOnActivity(chatId, activityAt);
    }
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("whatsapp_chats")
    .update({
      inbox_status: "open",
      attendance_opened_at: activityAt,
      updated_at: activityAt,
    })
    .eq("id", chatId);

  if (error) {
    if (/attendance_opened_at|does not exist|schema cache|PGRST20/i.test(error.message)) {
      const { updateWhatsAppChatInboxStatus } = await import("@/lib/api/atendimento/whatsapp-store.server");
      await updateWhatsAppChatInboxStatus(chatId, "open");
      return;
    }
    throw error;
  }
}

async function getWabaConversationIdsWithCustomerMessageAfter(boundaryIso: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("waba_messages")
    .select("conversation_id")
    .eq("sender_type", "customer")
    .gte("created_at", boundaryIso);
  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.conversation_id)));
}

let lastAtendimentoInboxRepairAt = 0;
const ATENDIMENTO_INBOX_REPAIR_MS = 30_000;

export async function maybeRepairAtendimentoInboxState() {
  if (Date.now() - lastAtendimentoInboxRepairAt < ATENDIMENTO_INBOX_REPAIR_MS) return;
  lastAtendimentoInboxRepairAt = Date.now();

  const { repairDuplicateAtendimentoChats } = await import("@/lib/api/atendimento/whatsapp-store.server");

  await repairDuplicateAtendimentoChats();
  await repairClosedAtendimentoChatsWithRecentInbound();
}

/** Reabre conversas fechadas com inbound do cliente somente apos o fechamento da loja. */
export async function repairClosedAtendimentoChatsWithRecentInbound(now = new Date()) {
  if (await isStoreOpenForAtendimento(now)) return 0;

  const boundary = await getEffectiveClosingBoundary(now);
  if (!boundary) return 0;
  const boundaryIso = boundary.toISOString();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const { data: closedChats, error } = await supabaseAdmin
    .from("whatsapp_chats")
    .select("id, last_message_at")
    .eq("inbox_status", "closed")
    .gte("last_message_at", since);
  if (error) {
    if (/inbox_status|does not exist|schema cache|PGRST20/i.test(error.message)) return 0;
    throw error;
  }
  if (!closedChats?.length) return 0;

  let repaired = 0;
  for (const chat of closedChats) {
    const { data: latest, error: latestError } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("direction, sent_at")
      .eq("chat_id", chat.id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ direction: string; sent_at: string }>();
    if (latestError || latest?.direction !== "inbound") continue;
    if (latest.sent_at < boundaryIso) continue;
    if (!(await isAfterHoursCustomerActivity(latest.sent_at, now))) continue;

    await ensureCustomerInboundKeepsConversationOpen(chat.id, latest.sent_at);
    repaired += 1;
  }
  return repaired;
}

export async function syncAtendimentoWithStoreHours(now = new Date()) {
  const [configResult, horariosResult] = await Promise.all([
    fetchHorariosConfigFromDb(),
    fetchHorariosFromDb(),
  ]);

  const config = configResult.config;
  const horarios = horariosResult.horarios;
  const status = resolveStoreOpenStatus(config, horarios, now);

  if (status.abertaAgora) {
    const [evolutionClosed, wabaClosed] = await Promise.all([
      closeEvolutionChatsFromPreviousDays(now),
      closeWabaConversationsFromPreviousDays(now),
    ]);

    const marker = await getAttendanceCloseMarker();
    if (marker) {
      await setAttendanceCloseMarker(null);
    }

    return {
      closed: evolutionClosed + wabaClosed,
      storeOpen: true as const,
      motivo: status.motivo,
    };
  }

  const boundary = getAttendanceClosingBoundary(status, config, now);
  if (!boundary) return { closed: 0, storeOpen: true as const, motivo: status.motivo };

  const marker = await getAttendanceCloseMarker();
  const markerMs = marker ? new Date(marker).getTime() : null;

  const manualClose = config.pausa_imediata || !config.horario_automatico;
  const effectiveBoundary = manualClose && markerMs != null ? new Date(markerMs) : boundary;

  const boundaryIso = effectiveBoundary.toISOString();
  const boundaryMs = effectiveBoundary.getTime();
  const activeCount = await countActiveAtendimentoConversations();

  if (markerMs != null && markerMs >= boundaryMs && activeCount === 0) {
    return {
      closed: 0,
      storeOpen: false as const,
      boundary: boundaryIso,
      motivo: status.motivo,
      activeCount,
    };
  }

  await Promise.all([
    closeEvolutionChatsForStoreClosed(boundaryIso),
    closeWabaConversationsForStoreClosed(boundaryIso),
  ]);
  await setAttendanceCloseMarker(boundaryIso);

  return {
    closed: 1,
    storeOpen: false as const,
    boundary: boundaryIso,
    motivo: status.motivo,
    activeCount,
  };
}

export async function syncAtendimentoWithStoreHoursNow() {
  return syncAtendimentoWithStoreHours();
}

let lastSyncAt = 0;
const SYNC_INTERVAL_MS = 60_000;

export function maybeSyncAtendimentoWithStoreHours() {
  if (Date.now() - lastSyncAt < SYNC_INTERVAL_MS) return;
  lastSyncAt = Date.now();
  void syncAtendimentoWithStoreHours().catch((error) => {
    console.error("[syncAtendimentoWithStoreHours]", error);
  });
}
