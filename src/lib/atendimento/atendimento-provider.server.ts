/**
 * Camada unificada Atendimento — Meta Cloud API ou WhatsApp Web (Baileys).
 * A UI usa sempre tipos WabaConversation / WabaMessage.
 */

import {
  disconnectWhatsApp,
  fetchWhatsAppChats,
  getWhatsAppInboxState,
  getWhatsAppMessages,
  hardResetWhatsAppConnection,
  resolveAndPersistChatContact,
  sendWhatsAppMediaMessage,
  sendWhatsAppTextMessage,
  resolveWhatsAppMessageMediaUrl,
  refreshWhatsAppPairingCode,
  startWhatsAppConnection,
  startWhatsAppConnectionWithPhone,

  runLightInboxCatchUp,
  maybeRunLightInboxCatchUpInBackground,
} from "@/lib/api/atendimento/whatsapp.server";
import { isBaileysConfigured } from "@/lib/api/atendimento/whatsapp-baileys.server";
import { markChatAsRead } from "@/lib/api/atendimento/whatsapp-store.server";

import {
  getWabaConfigStatus,
  listWabaConversations,
  getWabaMessageHistoryMeta,
  listWabaMessages,
  markConversationRead,
  saveWabaConfig,
  sendWabaTextMessage,
} from "@/lib/waba/waba.server";
import {
  WABA_WORKSPACE_ID,
  type AtendimentoProvider,
  type WabaConfigPublic,
  type WabaConversation,
  type WabaConversationStatus,
  type AtendimentoMessagesPayload,
  type WabaMessage,
} from "@/lib/waba/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { WhatsAppChat, WhatsAppMessage } from "@/lib/atendimento/whatsapp";
import {
  formatWhatsAppPhone,
  isChatPhoneTrusted,
  isWhatsAppDraftConversationPreview,
  jidToPhone,
  normalizeWhatsAppPhone,
  phoneToJid,
  looksLikeWhatsAppPhoneDigits,
  phonesMatchLoosely,

  toWhatsAppSendDigits,
} from "@/lib/atendimento/whatsapp";

import { listWabaContacts } from "@/lib/waba/waba.server";
import type { WabaContact } from "@/lib/waba/types";

export type { AtendimentoProvider, AtendimentoMessagesPayload } from "@/lib/waba/types";

/** Telefone para exibir — nunca usa o ID interno @lid nem numero adivinhado por nome. */
function baileysContactDisplayPhone(
  chat: WhatsAppChat,
  wabaContact?: WabaContact | null,
): string {
  const saved = chat.phone?.trim();
  const lidDigits = chat.remoteJid.endsWith("@lid") ? (chat.remoteJid.split("@")[0] ?? "") : "";
  const phoneDigits = saved ? normalizeWhatsAppPhone(saved) : "";
  const phoneVerified = Boolean(chat.phoneVerifiedAt) || chat.remoteJid.endsWith("@s.whatsapp.net");

  if (
    saved &&
    phoneVerified &&
    phoneDigits &&
    looksLikeWhatsAppPhoneDigits(phoneDigits) &&
    (!lidDigits || phoneDigits !== lidDigits)
  ) {
    return saved;
  }

  if (chat.remoteJid.endsWith("@s.whatsapp.net")) {
    return jidToPhone(chat.remoteJid) ?? "";
  }

  if (wabaContact?.phone && chat.phoneVerifiedAt) {
    return formatWhatsAppPhone(wabaContact.phone) ?? wabaContact.phone;
  }

  return "";
}

/** Avatar so aparece se foi buscado para o telefone confirmado atual. */
function resolveChatAvatarUrl(chat: WhatsAppChat): string | null {
  const pic = chat.profilePicUrl?.trim();
  if (!pic || !isChatPhoneTrusted(chat)) return null;

  const phoneDigits = normalizeWhatsAppPhone(chat.phone ?? "");
  if (!phoneDigits || !looksLikeWhatsAppPhoneDigits(phoneDigits)) return null;

  if (chat.profilePicPhoneDigits) {
    return chat.profilePicPhoneDigits === phoneDigits ? pic : null;
  }

  return pic;
}

function normalizeAgendaName(name: string | null | undefined) {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function loadWabaContactIndexes() {
  const contacts = await listWabaContacts();
  const byPhone = new Map<string, WabaContact>();
  const byName = new Map<string, WabaContact>();

  for (const contact of contacts) {
    const digits = normalizeWhatsAppPhone(contact.phone);
    if (digits) byPhone.set(digits, contact);
    const nameKey = normalizeAgendaName(contact.name);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, contact);
  }

  return { byPhone, byName };
}

function resolveWabaContactForChat(
  chat: WhatsAppChat,
  indexes: { byPhone: Map<string, WabaContact>; byName: Map<string, WabaContact> },
) {
  const phoneDigits = normalizeWhatsAppPhone(chat.phone ?? "");
  if (phoneDigits && indexes.byPhone.has(phoneDigits)) {
    return indexes.byPhone.get(phoneDigits) ?? null;
  }

  const nameKey = normalizeAgendaName(chat.name);
  if (nameKey && indexes.byName.has(nameKey)) {
    return indexes.byName.get(nameKey) ?? null;
  }

  return null;
}

function applyWabaContactPhone(chat: WhatsAppChat, wabaContact: WabaContact | null): WhatsAppChat {
  if (!wabaContact?.phone?.trim()) return chat;
  if (baileysContactDisplayPhone(chat, wabaContact)) return chat;
  const formatted = formatWhatsAppPhone(wabaContact.phone) ?? wabaContact.phone;
  return { ...chat, phone: formatted };
}

async function syncAgendaPhoneToChat(chat: WhatsAppChat, wabaContact: WabaContact | null) {
  const withPhone = applyWabaContactPhone(chat, wabaContact);
  if (withPhone.phone === chat.phone) return withPhone;

  const { updateChatIdentityInPlace } = await import("@/lib/api/atendimento/whatsapp-store.server");
  await updateChatIdentityInPlace(chat.id, { phone: withPhone.phone });
  return withPhone;
}

let lastInboxPhoneResolveAt = 0;
let lastInboxConsolidateAt = 0;
const INBOX_PHONE_RESOLVE_MS = 60_000;
const INBOX_CONSOLIDATE_MS = 60 * 60 * 1000;

async function maybeResolveUnresolvedInboxChats(chats: WhatsAppChat[]) {
  if (Date.now() - lastInboxPhoneResolveAt < INBOX_PHONE_RESOLVE_MS) {
    return { chats, resolvedAny: false };
  }

  const needsResolve = chats
    .filter(
      (chat) =>
        !baileysContactDisplayPhone(chat) &&
        (chat.remoteJid.endsWith("@lid") || !chat.phone?.trim()),
    )
    .slice(0, 4);

  if (needsResolve.length === 0) {
    return { chats, resolvedAny: false };
  }

  lastInboxPhoneResolveAt = Date.now();
  let resolvedAny = false;

  for (const chat of needsResolve) {
    const result = await resolveAndPersistChatContact({
      chatId: chat.id,
      chatRemoteJid: chat.remoteJid,
      name: chat.name,
    });
    if (result.phone) resolvedAny = true;
  }

  if (!resolvedAny) return { chats, resolvedAny: false };
  return {
    chats: await fetchWhatsAppChats({ mode: "conversations", sync: "none" }),
    resolvedAny: true,
  };
}

function maybeConsolidateInboxInBackground() {
  if (Date.now() - lastInboxConsolidateAt < INBOX_CONSOLIDATE_MS) return;
  lastInboxConsolidateAt = Date.now();
  void consolidateBaileysInbox().catch((error) => {
    console.error("[maybeConsolidateInboxInBackground]", error);
  });
}

export type AtendimentoConfigStatus = WabaConfigPublic & {
  active_provider: AtendimentoProvider;
  /** Conectado conforme o provedor escolhido */
  inbox_connected: boolean;
  provider_label: string;
  baileys?: {
    configured: boolean;
    status: string;
    qrCode: string | null;
    pairingCode: string | null;
    connectMode: "qr" | "pairing" | null;
    pairingIssuedAt: string | null;
    baileysOwnerPhone: string | null;
    evolutionOwnerPhone: string | null;
    phoneNumber: string | null;
    profileName: string | null;
    connected: boolean;
    warning?: string | null;
  };
  /** @deprecated use baileys */
  evolution?: AtendimentoConfigStatus["baileys"];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function db(): Db {
  return supabaseAdmin;
}

export async function getActiveProvider(): Promise<AtendimentoProvider> {
  const { data } = await db()
    .from("waba_config")
    .select("active_provider")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();

  const provider = data?.active_provider;
  if (provider === "baileys" || provider === "evolution") return "baileys";
  return "meta";
}

export async function setActiveProvider(provider: AtendimentoProvider) {
  const normalized: "meta" | "baileys" =
    provider === "meta" ? "meta" : "baileys";
  const { error } = await db().from("waba_config").upsert(
    {
      workspace_id: WABA_WORKSPACE_ID,
      active_provider: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (error) throw new Error(error.message);
}

function mapBaileysChatToConversation(
  chat: WhatsAppChat,
  wabaContact?: WabaContact | null,
): WabaConversation {
  const now = new Date().toISOString();
  const displayPhone = baileysContactDisplayPhone(chat, wabaContact);
  return {
    id: chat.id,
    workspace_id: WABA_WORKSPACE_ID,
    contact_id: wabaContact?.id ?? chat.id,
    status: chat.inboxStatus as WabaConversationStatus,
    assigned_agent_id: chat.assignedAgentId ?? null,
    last_message_text: isWhatsAppDraftConversationPreview(chat.lastMessage)
      ? null
      : chat.lastMessage,
    last_message_at: chat.lastMessageAt,
    unread_count: chat.unreadCount,
    created_at: chat.firstContactAt ?? now,
    updated_at: chat.lastMessageAt ?? now,
    attendance_opened_at: chat.attendanceOpenedAt,
    contact: {
      id: wabaContact?.id ?? chat.id,
      workspace_id: WABA_WORKSPACE_ID,
      phone: displayPhone,
      name: wabaContact?.name?.trim() || chat.name || null,
      email: wabaContact?.email ?? null,
      company: wabaContact?.company ?? null,
      avatar_url: resolveChatAvatarUrl(chat) ?? null,
      created_at: wabaContact?.created_at ?? chat.firstContactAt ?? now,
      updated_at: now,
    },
  };
}

function mapBaileysMessageToWaba(msg: WhatsAppMessage, conversationId: string): WabaMessage {
  const outbound = msg.direction === "outbound";
  const contentType =
    msg.messageType === "text"
      ? "text"
      : msg.messageType === "sticker"
        ? "image"
        : (msg.messageType as WabaMessage["content_type"]);
  const previewText =
    msg.body?.trim() ||
    (msg.messageType === "document" && msg.fileName?.trim() ? msg.fileName.trim() : null) ||
    null;
  return {
    id: msg.id,
    conversation_id: conversationId,
    sender_type: outbound ? "agent" : "customer",
    sender_id: null,
    content_type: contentType,
    content_text: previewText,
    media_url: msg.mediaUrl,
    template_name: null,
    wa_message_id: msg.waMessageId,
    status: outbound ? (msg.status === "sent" ? "sent" : "delivered") : "delivered",
    created_at: msg.sentAt,
    reply_to_wa_message_id: msg.replyToWaMessageId ?? null,
    reply_to_text: msg.replyToText ?? null,
    reply_to_from_me: msg.replyToFromMe ?? null,
  };
}

export async function getAtendimentoConfigStatus(): Promise<AtendimentoConfigStatus> {
  const active_provider = await getActiveProvider();
  const meta = await getWabaConfigStatus();

  let baileysBlock: AtendimentoConfigStatus["baileys"];
  const gatewayConfigured = isBaileysConfigured();
  if (gatewayConfigured) {
    const state = await getWhatsAppInboxState();
    baileysBlock = {
      configured: true,
      status: state.status,
      qrCode: state.qrCode,
      pairingCode: state.pairingCode,
      connectMode: state.connectMode,
      pairingIssuedAt: state.pairingIssuedAt,
      baileysOwnerPhone: state.evolutionOwnerPhone,
      evolutionOwnerPhone: state.evolutionOwnerPhone,
      phoneNumber: state.phoneNumber,
      profileName: state.profileName,
      connected: state.status === "connected",
      warning: state.warning,
    };
  } else {
    baileysBlock = {
      configured: false,
      status: "disconnected",
      qrCode: null,
      pairingCode: null,
      connectMode: null,
      pairingIssuedAt: null,
      baileysOwnerPhone: null,
      evolutionOwnerPhone: null,
      phoneNumber: null,
      profileName: null,
      connected: false,
      warning: "Configure WHATSAPP_GATEWAY_URL e WHATSAPP_GATEWAY_KEY no servidor.",
    };
  }

  const inbox_connected =
    active_provider === "meta" ? meta.connected : Boolean(baileysBlock?.connected);

  const provider_label =
    active_provider === "meta" ? "Meta Cloud API" : "WhatsApp Web (Baileys)";

  return {
    ...meta,
    active_provider,
    inbox_connected,
    provider_label,
    connected: inbox_connected,
    baileys: baileysBlock,
    evolution: baileysBlock,
  };
}

export async function saveAtendimentoMetaConfig(input: Parameters<typeof saveWabaConfig>[0]) {
  await setActiveProvider("meta");
  return saveWabaConfig(input);
}

export async function connectAtendimentoBaileys(options?: { phone?: string; renew?: boolean }) {
  if (!isBaileysConfigured()) {
    throw new Error(
      "WhatsApp gateway não configurado no servidor (WHATSAPP_GATEWAY_URL / WHATSAPP_GATEWAY_KEY).",
    );
  }
  await setActiveProvider("baileys");
  const result = options?.phone?.trim()
    ? options.renew
      ? await refreshWhatsAppPairingCode(options.phone)
      : await startWhatsAppConnectionWithPhone(options.phone)
    : await startWhatsAppConnection();
  const { runFullOrphanLidConsolidation } = await import("@/lib/api/atendimento/whatsapp-store.server");
  void runFullOrphanLidConsolidation().catch(console.error);
  return result;
}

export const connectAtendimentoEvolution = connectAtendimentoBaileys;

export async function disconnectAtendimentoBaileys() {
  return disconnectWhatsApp();
}

export const disconnectAtendimentoEvolution = disconnectAtendimentoBaileys;

export async function hardResetAtendimentoBaileys() {
  if (!isBaileysConfigured()) {
    throw new Error(
      "WhatsApp gateway não configurado no servidor (WHATSAPP_GATEWAY_URL / WHATSAPP_GATEWAY_KEY).",
    );
  }
  await setActiveProvider("baileys");
  const result = await hardResetWhatsAppConnection();
  const status = await getAtendimentoConfigStatus();
  const warning =
    result && typeof result === "object" && "warning" in result
      ? String((result as { warning?: string | null }).warning ?? "").trim()
      : "";
  if (!warning || !status.baileys) return status;
  return {
    ...status,
    baileys: { ...status.baileys, warning },
    evolution: status.evolution ? { ...status.evolution, warning } : status.evolution,
  };
}

export const hardResetAtendimentoEvolution = hardResetAtendimentoBaileys;

let lastFullInboxListAt = 0;
const FULL_INBOX_LIST_MS = 120_000;

async function hydrateProfilePicturesForChats(chats: WhatsAppChat[]): Promise<WhatsAppChat[]> {
  if (!isBaileysConfigured()) return chats;

  const needsPic = chats.filter((chat) => {
    if (!isChatPhoneTrusted(chat)) return false;
    const phoneDigits = normalizeWhatsAppPhone(chat.phone ?? "");
    if (!phoneDigits) return false;
    if (!chat.profilePicUrl?.trim()) return true;
    if (!chat.profilePicPhoneDigits) return true;
    return chat.profilePicPhoneDigits !== phoneDigits;
  });
  if (needsPic.length === 0) return chats;

  const { refreshWhatsAppChatProfilePicture } = await import("@/lib/api/atendimento/whatsapp.server");
  const refreshed = new Map<string, string>();

  for (const chat of needsPic.slice(0, 8)) {
    try {
      const url = await refreshWhatsAppChatProfilePicture(chat.id, { force: true });
      if (!url) continue;
      refreshed.set(chat.id, url);
    } catch {
      // ignore per-contact failures
    }
  }

  if (refreshed.size === 0) return chats;
  return chats.map((chat) => {
    if (!refreshed.has(chat.id)) return chat;
    const phoneDigits = normalizeWhatsAppPhone(chat.phone ?? "");
    return {
      ...chat,
      profilePicUrl: refreshed.get(chat.id)!,
      profilePicPhoneDigits: phoneDigits || chat.profilePicPhoneDigits,
    };
  });
}

export async function listAtendimentoConversations(options?: {
  light?: boolean;
}): Promise<WabaConversation[]> {
  const { maybeSyncAtendimentoWithStoreHours, maybeRepairAtendimentoInboxState } =
    await import("@/lib/atendimento/atendimento-hours.server");
  maybeSyncAtendimentoWithStoreHours();
  void maybeRepairAtendimentoInboxState().catch((error) => {
    console.error("[maybeRepairAtendimentoInboxState]", error);
  });

  const provider = await getActiveProvider();
  if (provider === "baileys") {
    const useFullEnrichment =
      !options?.light && Date.now() - lastFullInboxListAt > FULL_INBOX_LIST_MS;

    if (useFullEnrichment) {
      lastFullInboxListAt = Date.now();
      maybeConsolidateInboxInBackground();
      maybeRunLightInboxCatchUpInBackground();

      const wabaIndexes = await loadWabaContactIndexes();
      let chats = await fetchWhatsAppChats({ mode: "conversations", sync: "none" });

      const resolved = await maybeResolveUnresolvedInboxChats(chats);
      chats = await hydrateProfilePicturesForChats(resolved.chats);

      const enriched = chats.map((chat) => {
        const wabaContact = resolveWabaContactForChat(chat, wabaIndexes);
        const withAgendaPhone = applyWabaContactPhone(chat, wabaContact);
        return { chat: withAgendaPhone, wabaContact };
      });
      return enriched
        .map(({ chat, wabaContact }) => mapBaileysChatToConversation(chat, wabaContact))
        .sort((a, b) =>
          String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? "")),
        );
    }

    const chats = await hydrateProfilePicturesForChats(
      await fetchWhatsAppChats({ mode: "conversations", sync: "none" }),
    );
    const wabaIndexes = await loadWabaContactIndexes();
    return chats
      .map((chat) => {
        const wabaContact = resolveWabaContactForChat(chat, wabaIndexes);
        const withAgendaPhone = applyWabaContactPhone(chat, wabaContact);
        return mapBaileysChatToConversation(withAgendaPhone, wabaContact);
      })
      .sort((a, b) =>
        String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? "")),
      );
  }
  return listWabaConversations();
}

export async function listAtendimentoMessages(
  conversationId: string,
  options?: { history?: boolean; before?: string | null },
): Promise<AtendimentoMessagesPayload> {
  const provider = await getActiveProvider();
  const history = options?.history ?? false;
  const before = options?.before ?? null;

  if (provider === "baileys") {
    const SESSION_ANCHOR_TOLERANCE_MS = 2000;
    const { getWhatsAppChatById, getWhatsAppMessageHistoryMeta } =

      await import("@/lib/api/atendimento/whatsapp-store.server");
    const { resolveAttendanceSessionAnchor, reconcileAtendimentoSessionFromRecentMessages } =

      await import("@/lib/atendimento/atendimento-hours.server");
    let chat = await getWhatsAppChatById(conversationId);
    let sessionAt = chat?.attendanceOpenedAt ?? null;

    if (!history && sessionAt && chat && chat.inboxStatus !== "closed") {
      const lastMsgAt = chat.lastMessageAt;
      if (lastMsgAt) {
        const lastMs = new Date(lastMsgAt).getTime();
        const sessionMs = new Date(sessionAt).getTime();
        if (
          Number.isFinite(lastMs) &&
          Number.isFinite(sessionMs) &&
          lastMs < sessionMs - SESSION_ANCHOR_TOLERANCE_MS
        ) {
          const anchor = await resolveAttendanceSessionAnchor(conversationId, sessionAt);
          if (new Date(anchor).getTime() < sessionMs) {
            await supabaseAdmin
              .from("whatsapp_chats")
              .update({
                attendance_opened_at: anchor,
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversationId);
            sessionAt = anchor;
          }
        }
      }
    }

    let since = !history ? (sessionAt ?? undefined) : undefined;
    let { messages } = await getWhatsAppMessages(conversationId, {
      history,
      since,
      before: before ?? undefined,
      markRead: false,
    });

    if (!history && messages.length === 0 && chat?.lastMessageAt) {
      await reconcileAtendimentoSessionFromRecentMessages(conversationId);
      chat = await getWhatsAppChatById(conversationId);
      const nextSessionAt = chat?.attendanceOpenedAt ?? sessionAt;
      if (nextSessionAt !== sessionAt) {
        sessionAt = nextSessionAt;
        since = sessionAt ?? undefined;
        ({ messages } = await getWhatsAppMessages(conversationId, {
          history,
          since,
          before: before ?? undefined,
          markRead: false,
        }));
      }
    }
    const mapped = messages.map((m) => mapBaileysMessageToWaba(m, conversationId));
    const meta = await getWhatsAppMessageHistoryMeta(conversationId, {
      since,
      history,
      fetchedCount: mapped.length,
      sessionAt,
    });
    return { messages: mapped, meta };
  }

  const { data: conv } = await supabaseAdmin
    .from("waba_conversations")
    .select("attendance_opened_at")
    .eq("id", conversationId)
    .maybeSingle<{ attendance_opened_at: string | null }>();
  const sessionAt = conv?.attendance_opened_at ?? null;
  const messages = await listWabaMessages(conversationId, { history });
  const meta = await getWabaMessageHistoryMeta(conversationId, {
    history,
    fetchedCount: messages.length,
    sessionAt,
  });
  return { messages, meta };
}

export async function markAtendimentoConversationRead(conversationId: string) {
  const provider = await getActiveProvider();
  if (provider === "baileys") {
    await markChatAsRead(conversationId);
    return;
  }
  await markConversationRead(conversationId);
}

export async function sendAtendimentoTextMessage(input: {
  conversationId: string;
  text: string;
  agentUserId?: string;
  quotedMessageId?: string;
}) {
  const provider = await getActiveProvider();
  if (provider === "baileys") {
    await sendWhatsAppTextMessage(input.conversationId, input.text, {
      quotedMessageId: input.quotedMessageId,
    });
    if (input.agentUserId) {
      void assignAtendimentoConversationAgent(input.conversationId, input.agentUserId).catch(
        console.error,
      );
    }
    return { ok: true as const };
  }
  return sendWabaTextMessage({
    conversationId: input.conversationId,
    text: input.text,
    agentUserId: input.agentUserId ?? "",
    quotedMessageId: input.quotedMessageId,
  });
}

export async function sendAtendimentoMediaMessage(input: {
  conversationId: string;
  mediatype: "image" | "document" | "audio" | "video";
  base64: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
  agentUserId?: string;
}) {
  const provider = await getActiveProvider();
  if (provider === "baileys") {
    await sendWhatsAppMediaMessage({
      chatId: input.conversationId,
      mediatype: input.mediatype,
      base64: input.base64,
      mimetype: input.mimetype,
      caption: input.caption,
      fileName: input.fileName,
    });
    return { ok: true as const };
  }
  throw new Error("Envio de audio e midia disponivel apenas com WhatsApp Web (Baileys).");
}

export async function resolveAtendimentoMessageMediaUrl(messageId: string) {
  const provider = await getActiveProvider();
  if (provider === "baileys") {
    return resolveWhatsAppMessageMediaUrl(messageId);
  }
  return null;
}

export async function updateAtendimentoConversationStatus(
  conversationId: string,
  status: WabaConversationStatus,
) {
  const provider = await getActiveProvider();

  if (provider === "baileys") {
    const { updateWhatsAppChatInboxStatus } = await import("@/lib/api/atendimento/whatsapp-store.server");

    await updateWhatsAppChatInboxStatus(conversationId, status);
    return;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { data: current } = await supabaseAdmin
    .from("waba_conversations")
    .select("status")
    .eq("id", conversationId)
    .maybeSingle<{ status: string }>();

  const patch: Record<string, string> = { status, updated_at: now };
  if (status === "open" && current?.status === "closed") {
    patch.attendance_opened_at = now;
  }

  const { error } = await supabaseAdmin
    .from("waba_conversations")
    .update(patch)
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
}


export async function consolidateBaileysInbox() {
  const { runFullOrphanLidConsolidation } = await import("@/lib/api/atendimento/whatsapp-store.server");

  await runFullOrphanLidConsolidation();
  return { ok: true };
}

export async function syncAtendimentoInbox() {
  return runLightInboxCatchUp();
}

export const consolidateEvolutionInbox = consolidateBaileysInbox;

export async function linkAtendimentoConversationPhone(conversationId: string, phone: string) {
  const { getWhatsAppChatById } = await import("@/lib/api/atendimento/whatsapp-store.server");
  const chat = await getWhatsAppChatById(conversationId);
  if (!chat) throw new Error("Conversa nao encontrada.");

  const result = await resolveAndPersistChatContact({
    chatId: conversationId,
    chatRemoteJid: chat.remote_jid,
    name: chat.name,
    manualPhone: phone,
  });

  if (!result.phone) {
    throw new Error("Nao foi possivel vincular o telefone a esta conversa.");
  }

  const { refreshWhatsAppChatProfilePicture } = await import("@/lib/api/atendimento/whatsapp.server");
  await refreshWhatsAppChatProfilePicture(conversationId, { force: true });

  return { ok: true as const, phone: result.phone };
}

export async function saveAtendimentoConversationContact(input: {
  conversationId: string;
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  contactId?: string;
  userId: string;
}) {
  const { getWhatsAppChatById } = await import("@/lib/api/atendimento/whatsapp-store.server");
  const { upsertWabaContact } = await import("@/lib/waba/waba.server");
  const chat = await getWhatsAppChatById(input.conversationId);
  if (!chat) throw new Error("Conversa nao encontrada.");

  const result = await resolveAndPersistChatContact({
    chatId: input.conversationId,
    chatRemoteJid: chat.remote_jid,
    name: input.name ?? chat.name,
    manualPhone: input.phone,
  });

  if (!result.phone) {
    throw new Error("Telefone invalido. Informe DDD + numero.");
  }

  const contact = await upsertWabaContact({
    id: input.contactId,
    phone: result.phone,
    name: input.name,
    email: input.email,
    company: input.company,
    userId: input.userId,
  });

  const { refreshWhatsAppChatProfilePicture } = await import("@/lib/api/atendimento/whatsapp.server");
  const avatarUrl = await refreshWhatsAppChatProfilePicture(input.conversationId, { force: true });

  return { ok: true as const, phone: result.phone, contact, avatarUrl };
}

/** Abre conversa existente ou cria uma nova a partir de um contato da agenda. */
export async function openAtendimentoConversationFromContact(input: {
  contactId: string;
  phone: string;
  name?: string | null;
}): Promise<{ conversationId: string }> {
  const provider = await getActiveProvider();
  const targetDigits = normalizeWhatsAppPhone(input.phone);
  if (!targetDigits) throw new Error("Telefone invalido.");


  if (provider === "baileys") {
    const { createWhatsAppChatByPhone } = await import("@/lib/api/atendimento/whatsapp.server");

    const {
      findWhatsAppChatByPhoneDigits,
      getWhatsAppChatById,
      mergeChatByIdentity,
      updateChatIdentityInPlace,
    } = await import("@/lib/api/atendimento/whatsapp-store.server");

    const formattedPhone = jidToPhone(phoneToJid(input.phone)) ?? input.phone;
    const phoneJid = phoneToJid(input.phone);
    if (!phoneJid) throw new Error("Telefone invalido.");

    let chat = await findWhatsAppChatByPhoneDigits(targetDigits);

    if (chat) {
      if (chat.remoteJid.endsWith("@lid")) {
        chat = await mergeChatByIdentity(chat.id, {
          remoteJid: phoneJid,
          phone: formattedPhone,
          name: input.name ?? chat.name,
          profilePicUrl: chat.profilePicUrl,
        });
      } else {
        await updateChatIdentityInPlace(chat.id, {
          phone: formattedPhone,
          name: input.name ?? chat.name ?? undefined,
        });
        const row = await getWhatsAppChatById(chat.id);
        if (row) {
          chat = {
            ...chat,
            phone: formattedPhone,
            name: row.name,
            remoteJid: row.remote_jid,
          };
        }
      }
      return { conversationId: chat.id };
    }

    const created = await createWhatsAppChatByPhone(input.phone, input.name ?? undefined);
    const verified = await getWhatsAppChatById(created.id);
    if (!verified) throw new Error("Falha ao criar conversa.");
    return { conversationId: created.id };
  }

  const now = new Date().toISOString();
  const { data: conv, error } = await db()
    .from("waba_conversations")
    .upsert(
      {
        workspace_id: WABA_WORKSPACE_ID,
        contact_id: input.contactId,
        status: "open",
        last_message_at: now,
        updated_at: now,
      },
      { onConflict: "workspace_id,contact_id" },
    )
    .select("id")
    .single();

  if (error || !conv) throw new Error(error?.message ?? "Falha ao abrir conversa.");
  return { conversationId: String(conv.id) };
}

export async function assignAtendimentoConversationAgent(
  conversationId: string,
  agentUserId: string | null,
) {
  const provider = await getActiveProvider();
  const now = new Date().toISOString();


  if (provider === "baileys") {
    const { updateChatIdentityInPlace } = await import("@/lib/api/atendimento/whatsapp-store.server");

    await updateChatIdentityInPlace(conversationId, { assigned_agent_id: agentUserId });
    return { ok: true as const };
  }

  const { error } = await supabaseAdmin
    .from("waba_conversations")
    .update({ assigned_agent_id: agentUserId, updated_at: now })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function mergeAtendimentoConversationDuplicates(conversationId: string) {
  const provider = await getActiveProvider();
  if (provider !== "baileys") {
    return { merged: 0, targetId: conversationId };
  }
  const { mergeDuplicatesForChat } = await import("@/lib/api/atendimento/whatsapp-store.server");
  return mergeDuplicatesForChat(conversationId);
}
