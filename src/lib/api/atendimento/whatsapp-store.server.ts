import type {
  WhatsAppChat,
  WhatsAppConnectionStatus,
  WhatsAppMessage,
  WhatsAppMessageType,
} from "@/lib/atendimento/whatsapp";
import {
  formatMessagePreview,
  jidToPhone,
  normalizeWhatsAppPhone,
  whatsappRetentionCutoff,
  extractPhoneJidFromMessageKey,
  pickMessageRemoteJid,
  isWhatsAppDraftConversationPreview,
  canonicalBrazilWhatsAppDigits,
  phonesMatchLoosely,
  formatWhatsAppPhone,
  looksLikeWhatsAppPhoneDigits,
  phoneJidFromPhone,
  isPhoneSameAsLidId,
} from "@/lib/atendimento/whatsapp";
import { getInstanceOwner, pickChatDisplayName } from "@/lib/api/atendimento/whatsapp-identity.server";
import { mediaTypeLabel } from "@/lib/atendimento/message-reply";

type DbConfigRow = {
  id: string;
  instance_name: string;
  status: string;
  phone_number: string | null;
  profile_name: string | null;
  qr_code: string | null;
  provider: string;
  connected_at?: string | null;
  updated_at: string;
};

type DbChatRow = {
  id: string;
  remote_jid: string;
  phone: string | null;
  name: string | null;
  profile_pic_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  cliente_id: string | null;
  is_group: boolean;
  inbox_status?: "open" | "pending" | "closed";
  attendance_opened_at?: string | null;
  assigned_agent_id?: string | null;
  phone_verified_at?: string | null;
  profile_pic_phone_digits?: string | null;
  created_at?: string;
  first_contact_at?: string | null;
  updated_at: string;
};

type DbMessageRow = {
  id: string;
  chat_id: string;
  remote_jid: string;
  wa_message_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  file_name: string | null;
  status: string;
  sent_at: string;
  created_at: string;
  reply_to_wa_message_id?: string | null;
  reply_to_text?: string | null;
  reply_to_from_me?: boolean | null;
};

type MemoryState = {
  config: DbConfigRow;
  chats: DbChatRow[];
  messages: DbMessageRow[];
};

const SCHEMA_ERROR = /whatsapp_|does not exist|schema cache|PGRST20/i;

/** Retencao visivel no painel (ultimos 7 dias). */
export function getWhatsAppDisplayMessageCutoff(): Date {
  return whatsappRetentionCutoff();
}

/** Corte para importar mensagens novas via webhook/sync (apos conexao QR). */
export async function getWhatsAppInboundMessageCutoff(): Promise<Date> {
  const { config } = await readWhatsAppConfig("baileys");
  if (config.connected_at) {
    const connectedMs = new Date(config.connected_at).getTime();
    if (Number.isFinite(connectedMs)) {
      return new Date(connectedMs - 30_000);
    }
    return new Date(config.connected_at);
  }
  return whatsappRetentionCutoff();
}

/** @deprecated Prefer getWhatsAppInboundMessageCutoff ou getWhatsAppDisplayMessageCutoff. */
export async function getWhatsAppMessageCutoff(): Promise<Date> {
  return getWhatsAppInboundMessageCutoff();
}

function isSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return SCHEMA_ERROR.test(message);
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function seedDemoState(): MemoryState {
  const t1 = new Date(Date.now() - 1000 * 60 * 12).toISOString();
  const t2 = new Date(Date.now() - 1000 * 60 * 45).toISOString();
  const t3 = new Date(Date.now() - 1000 * 60 * 90).toISOString();

  const chat1Id = createId("chat");
  const chat2Id = createId("chat");
  const chat3Id = createId("chat");

  return {
    config: {
      id: "default",
      instance_name: "abelha-mel-demo",
      status: "demo",
      phone_number: "5581999990000",
      profile_name: "Abelha & Mel",
      qr_code: null,
      provider: "demo",
      updated_at: nowIso(),
    },
    chats: [
      {
        id: chat1Id,
        remote_jid: "5581988881111@s.whatsapp.net",
        phone: "(81) 98888-1111",
        name: "Mariana Costa",
        profile_pic_url: null,
        last_message: "Quero pedir um bolo para sabado",
        last_message_at: t1,
        unread_count: +2,
        cliente_id: null,
        is_group: false,
        updated_at: t1,
      },
      {
        id: chat2Id,
        remote_jid: "5581977772222@s.whatsapp.net",
        phone: "(81) 97777-2222",
        name: "Paulo Henrique",
        profile_pic_url: null,
        last_message: "📷 Imagem",
        last_message_at: t2,
        unread_count: 0,
        cliente_id: null,
        is_group: false,
        updated_at: t2,
      },
      {
        id: chat3Id,
        remote_jid: "5581966663333@s.whatsapp.net",
        phone: "(81) 96666-3333",
        name: "Aline Souza",
        profile_pic_url: null,
        last_message: "Obrigada pelo atendimento!",
        last_message_at: t3,
        unread_count: 0,
        cliente_id: null,
        is_group: false,
        updated_at: t3,
      },
    ],
    messages: [
      {
        id: createId("msg"),
        chat_id: chat1Id,
        remote_jid: "5581988881111@s.whatsapp.net",
        wa_message_id: "demo-msg-1",
        direction: "inbound",
        message_type: "text",
        body: "Ola! Voces estao abertos agora?",
        media_url: null,
        media_mime: null,
        file_name: null,
        status: "delivered",
        sent_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
        created_at: nowIso(),
      },
      {
        id: createId("msg"),
        chat_id: chat1Id,
        remote_jid: "5581988881111@s.whatsapp.net",
        wa_message_id: "demo-msg-2",
        direction: "outbound",
        message_type: "text",
        body: "Ola Mariana! Estamos abertos e prontos para receber seu pedido.",
        media_url: null,
        media_mime: null,
        file_name: null,
        status: "read",
        sent_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        created_at: nowIso(),
      },
      {
        id: createId("msg"),
        chat_id: chat1Id,
        remote_jid: "5581988881111@s.whatsapp.net",
        wa_message_id: "demo-msg-3",
        direction: "inbound",
        message_type: "text",
        body: "Quero pedir um bolo para sabado",
        media_url: null,
        media_mime: null,
        file_name: null,
        status: "delivered",
        sent_at: t1,
        created_at: nowIso(),
      },
      {
        id: createId("msg"),
        chat_id: chat2Id,
        remote_jid: "5581977772222@s.whatsapp.net",
        wa_message_id: "demo-msg-4",
        direction: "inbound",
        message_type: "image",
        body: "Segue referencia do brigadeiro",
        media_url: "https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=640",
        media_mime: "image/jpeg",
        file_name: "referencia.jpg",
        status: "delivered",
        sent_at: t2,
        created_at: nowIso(),
      },
      {
        id: createId("msg"),
        chat_id: chat3Id,
        remote_jid: "5581966663333@s.whatsapp.net",
        wa_message_id: "demo-msg-5",
        direction: "inbound",
        message_type: "text",
        body: "Obrigada pelo atendimento!",
        media_url: null,
        media_mime: null,
        file_name: null,
        status: "delivered",
        sent_at: t3,
        created_at: nowIso(),
      },
    ],
  };
}

let memoryState: MemoryState | null = null;

function getMemoryState() {
  if (!memoryState) memoryState = seedDemoState();
  return memoryState;
}

function mapChat(row: DbChatRow): WhatsAppChat {
  return {
    id: row.id,
    remoteJid: row.remote_jid,
    phone: row.phone,
    name: row.name,
    profilePicUrl: row.profile_pic_url,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    clienteId: row.cliente_id,
    isGroup: row.is_group,
    firstContactAt: row.first_contact_at ?? row.created_at ?? null,
    inboxStatus: row.inbox_status ?? "open",
    attendanceOpenedAt: row.attendance_opened_at ?? null,
    assignedAgentId: row.assigned_agent_id ?? null,
    phoneVerifiedAt: row.phone_verified_at ?? null,
    profilePicPhoneDigits: row.profile_pic_phone_digits ?? null,
  };
}

function isWithinRetention(iso: string | null | undefined) {
  if (!iso) return false;
  return new Date(iso).getTime() >= whatsappRetentionCutoff().getTime();
}

function chatWithinRetention(chat: DbChatRow) {
  if (!chat.last_message_at || !isWithinRetention(chat.last_message_at)) return false;
  return Boolean(chat.last_message?.trim());
}

function mapMessage(row: DbMessageRow): WhatsAppMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    remoteJid: row.remote_jid,
    waMessageId: row.wa_message_id,
    direction: row.direction,
    messageType: row.message_type as WhatsAppMessageType,
    body: row.body,
    mediaUrl: row.media_url,
    mediaMime: row.media_mime,
    fileName: row.file_name,
    status: row.status,
    sentAt: row.sent_at,
    replyToWaMessageId: row.reply_to_wa_message_id ?? null,
    replyToText: row.reply_to_text ?? null,
    replyToFromMe: row.reply_to_from_me ?? null,
  };
}

async function getSupabase() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const INBOX_CHAT_LIMIT = 250;
const DEDUPE_CHAT_POOL_LIMIT = 200;

async function paginateWhatsAppChats(
  build: (
    from: number,
    to: number,
  ) => Promise<{ data: DbChatRow[] | null; error: { message: string } | null }>,
) {
  const SUPABASE_PAGE_SIZE = 1000;
  const all: DbChatRow[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await build(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < SUPABASE_PAGE_SIZE) break;
  }
  return all;
}

export async function isWhatsAppSchemaReady() {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("whatsapp_config")
      .select("id")
      .eq("id", "default")
      .maybeSingle();
    return !error;
  } catch {
    return false;
  }
}

export async function readWhatsAppConfig(provider: "baileys" | "evolution" | "demo") {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    return { config: getMemoryState().config, schemaReady: false, provider: "demo" as const };
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("id", "default")
    .maybeSingle<DbConfigRow>();

  if (error) {
    if (isSchemaError(error)) {
      return { config: getMemoryState().config, schemaReady: false, provider: "demo" as const };
    }
    throw error;
  }

  if (!data) {
    const fallback: DbConfigRow = {
      id: "default",
      instance_name: "abelha-mel",
      status: provider === "baileys" || provider === "evolution" ? "disconnected" : "demo",
      phone_number: null,
      profile_name: provider === "demo" ? "Abelha & Mel" : null,
      qr_code: null,
      provider,
      updated_at: nowIso(),
    };
    await supabase.from("whatsapp_config").upsert(fallback);
    return { config: fallback, schemaReady: true, provider };
  }

  return {
    config: data,
    schemaReady: true,
    provider: data.provider as "baileys" | "evolution" | "demo",
  };
}

export async function writeWhatsAppConfig(patch: Partial<DbConfigRow>) {
  const schemaReady = await isWhatsAppSchemaReady();
  const merged = {
    ...getMemoryState().config,
    ...patch,
    updated_at: nowIso(),
  };

  if (!schemaReady) {
    getMemoryState().config = merged;
    return merged;
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_config")
    .upsert({ id: "default", ...patch, updated_at: nowIso() })
    .select("*")
    .single<DbConfigRow>();
  if (error) throw error;
  return data;
}

export async function getWhatsAppChatById(chatId: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    return getMemoryState().chats.find((item) => item.id === chatId) ?? null;
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select("*")
    .eq("id", chatId)
    .maybeSingle<DbChatRow>();
  if (error) throw error;
  return data ?? null;
}

export async function getChatByRemoteJid(remoteJid: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    return getMemoryState().chats.find((item) => item.remote_jid === remoteJid) ?? null;
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select("*")
    .eq("remote_jid", remoteJid)
    .maybeSingle<DbChatRow>();
  if (error) throw error;
  return data ?? null;
}

function sanitizeRealPhone(
  phone: string | null | undefined,
  lidJid?: string | null,
): string | null {
  if (!phone?.trim()) return null;
  const digits = normalizeWhatsAppPhone(phone);
  if (!looksLikeWhatsAppPhoneDigits(digits)) return null;
  if (isPhoneSameAsLidId(digits, lidJid)) return null;
  return formatWhatsAppPhone(canonicalBrazilWhatsAppDigits(digits) || digits);
}

function pickPhoneJidForChat(
  phone: string | null | undefined,
  lidJid?: string | null,
  fallbackJid?: string,
): string | null {
  const sanitized = sanitizeRealPhone(phone, lidJid);
  if (sanitized) return phoneJidFromPhone(sanitized);
  if (fallbackJid?.endsWith("@s.whatsapp.net")) return fallbackJid;
  return null;
}

/** Grava remote_jid como @s.whatsapp.net quando o telefone real e conhecido. */
export async function promoteChatToRealPhoneJid(chatId: string, phone: string | null | undefined) {
  const sanitized = sanitizeRealPhone(phone);
  if (!sanitized) return null;

  const phoneJid = phoneJidFromPhone(sanitized);
  if (!phoneJid) return null;

  const schemaReady = await isWhatsAppSchemaReady();
  const chat = await getWhatsAppChatById(chatId);
  if (!chat) return null;

  if (chat.remote_jid === phoneJid && sanitizeRealPhone(chat.phone) === sanitized) {
    return mapChat(chat);
  }

  const digits = normalizeWhatsAppPhone(sanitized);
  const existing = await findSimilarChatRowByDigits(digits, chatId);
  if (existing && existing.id !== chatId) {
    await consolidateChatsIntoTarget(chatId, existing.id, phoneJid);
    await updateChatIdentityInPlace(existing.id, { phone: sanitized, remote_jid: phoneJid });
    const merged = await getWhatsAppChatById(existing.id);
    return merged ? mapChat(merged) : null;
  }

  await updateChatIdentityInPlace(chatId, { phone: sanitized, remote_jid: phoneJid });

  if (!schemaReady) {
    const state = getMemoryState();
    for (const message of state.messages) {
      if (message.chat_id === chatId) message.remote_jid = phoneJid;
    }
    return mapChat((await getWhatsAppChatById(chatId))!);
  }

  const supabase = await getSupabase();
  await supabase.from("whatsapp_messages").update({ remote_jid: phoneJid }).eq("chat_id", chatId);

  const refreshed = await getWhatsAppChatById(chatId);
  return refreshed ? mapChat(refreshed) : null;
}

export async function findWhatsAppChatByRemoteJid(remoteJid: string) {
  const row = await getChatByRemoteJid(remoteJid);
  return row ? mapChat(row) : null;
}

/** Move mensagens de um chat duplicado para o canonico sem apagar historico. */
function mergeInboxFieldsForChatMerge(source: DbChatRow, target: DbChatRow) {
  const sourceStatus = source.inbox_status ?? "open";
  const targetStatus = target.inbox_status ?? "open";
  const inbox_status: DbChatRow["inbox_status"] =
    sourceStatus === "open" || targetStatus === "open"
      ? "open"
      : sourceStatus === "pending" || targetStatus === "pending"
        ? "pending"
        : "closed";

  const sourceAt = source.attendance_opened_at ?? null;
  const targetAt = target.attendance_opened_at ?? null;
  let attendance_opened_at = targetAt;
  if (sourceAt && (!targetAt || sourceAt.localeCompare(targetAt) > 0)) {
    attendance_opened_at = sourceAt;
  }

  return { inbox_status, attendance_opened_at };
}

export async function consolidateChatsIntoTarget(
  sourceChatId: string,
  targetChatId: string,
  remoteJid: string,
) {
  if (sourceChatId === targetChatId) return;

  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const state = getMemoryState();
    const source = state.chats.find((item) => item.id === sourceChatId);
    const target = state.chats.find((item) => item.id === targetChatId);
    if (!source || !target) return;
    for (const message of state.messages) {
      if (message.chat_id === sourceChatId) {
        message.chat_id = targetChatId;
        message.remote_jid = remoteJid;
      }
    }
    target.unread_count += source.unread_count;
    const sourceLastAt = String(source.last_message_at ?? "");
    const targetLastAt = String(target.last_message_at ?? "");
    if (sourceLastAt.localeCompare(targetLastAt) > 0) {
      target.last_message = source.last_message;
      target.last_message_at = source.last_message_at;
    }
    if (!target.name?.trim() && source.name?.trim()) target.name = source.name;
    if (!target.phone?.trim() && source.phone?.trim()) target.phone = source.phone;
    const mergedInbox = mergeInboxFieldsForChatMerge(source, target);
    target.inbox_status = mergedInbox.inbox_status;
    if (mergedInbox.attendance_opened_at) {
      target.attendance_opened_at = mergedInbox.attendance_opened_at;
    }
    state.chats = state.chats.filter((item) => item.id !== sourceChatId);
    return;
  }

  const supabase = await getSupabase();
  const source = await getWhatsAppChatById(sourceChatId);
  const target = await getWhatsAppChatById(targetChatId);
  if (!source || !target) return;

  await supabase
    .from("whatsapp_messages")
    .update({ chat_id: targetChatId, remote_jid: remoteJid })
    .eq("chat_id", sourceChatId);

  const sourceLastAt = String(source.last_message_at ?? "");
  const targetLastAt = String(target.last_message_at ?? "");
  const sourceIsNewer = sourceLastAt.localeCompare(targetLastAt) > 0;
  const mergedInbox = mergeInboxFieldsForChatMerge(source, target);

  await supabase
    .from("whatsapp_chats")
    .update({
      unread_count: (target.unread_count ?? 0) + (source.unread_count ?? 0),
      last_message: sourceIsNewer ? source.last_message : target.last_message,
      last_message_at: sourceIsNewer ? source.last_message_at : target.last_message_at,
      name: target.name?.trim() ? target.name : source.name,
      phone: target.phone?.trim() ? target.phone : source.phone,
      inbox_status: mergedInbox.inbox_status,
      ...(mergedInbox.attendance_opened_at
        ? { attendance_opened_at: mergedInbox.attendance_opened_at }
        : {}),
      updated_at: nowIso(),
    })
    .eq("id", targetChatId);

  await supabase.from("whatsapp_chats").delete().eq("id", sourceChatId);
}

function chatPhoneDigits(chat: DbChatRow | WhatsAppChat) {
  const remoteJid = "remote_jid" in chat ? chat.remote_jid : chat.remoteJid;
  const phone = chat.phone;
  const lidDigits = remoteJid.endsWith("@lid") ? (remoteJid.split("@")[0] ?? "") : "";

  if (phone?.trim()) {
    const digits = normalizeWhatsAppPhone(phone);
    if (digits && digits !== lidDigits) return digits;
  }

  if (remoteJid.endsWith("@s.whatsapp.net")) {
    return normalizeWhatsAppPhone(remoteJid.split("@")[0] ?? "") || null;
  }

  return null;
}

function stripEmoji(value: string) {
  return value.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F\u200D]/gu, "").trim();
}

function normalizeChatNameKey(name: string | null | undefined) {
  return stripEmoji(name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function chatNamesMatchLoosely(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeChatNameKey(a);
  const right = normalizeChatNameKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const leftParts = left.split(/\s+/).filter((part) => part.length >= 3);
  const rightParts = right.split(/\s+/).filter((part) => part.length >= 3);
  if (leftParts.length === 0 || rightParts.length === 0) return false;

  const [shorter, longer] =
    leftParts.length <= rightParts.length ? [leftParts, rightParts] : [rightParts, leftParts];
  return shorter.some((part) =>
    longer.some((candidate) => candidate.includes(part) || part.includes(candidate)),
  );
}

function chatMergeScore(chat: DbChatRow) {
  let score = 0;
  const status = chat.inbox_status ?? "open";
  if (status === "open") score += 300;
  else if (status === "pending") score += 200;
  if (chat.remote_jid.endsWith("@s.whatsapp.net")) score += 40;
  if (chat.last_message?.trim()) score += 30;
  if (chat.phone?.trim()) score += 10;
  if (chat.profile_pic_url?.trim()) score += 8;
  score += new Date(chat.last_message_at ?? 0).getTime() / 1e13;
  return score;
}

function mergeChatRowForList(target: DbChatRow, source: DbChatRow): DbChatRow {
  const targetDigits = chatPhoneDigits(target);
  const sourceDigits = chatPhoneDigits(source);
  const samePhone = Boolean(
    targetDigits && sourceDigits && phonesMatchLoosely(targetDigits, sourceDigits),
  );

  return {
    ...target,
    profile_pic_url: target.profile_pic_url?.trim()
      ? target.profile_pic_url
      : samePhone
        ? source.profile_pic_url
        : null,
    name: target.name?.trim() ? target.name : source.name,
    phone: target.phone?.trim() ? target.phone : source.phone,
  };
}

function pickCanonicalChatPair(a: DbChatRow, b: DbChatRow) {
  const target = chatMergeScore(a) >= chatMergeScore(b) ? a : b;
  const source = target.id === a.id ? b : a;
  const remoteJid = target.remote_jid.endsWith("@s.whatsapp.net")
    ? target.remote_jid
    : source.remote_jid.endsWith("@s.whatsapp.net")
      ? source.remote_jid
      : target.remote_jid;
  return { source, target, remoteJid };
}

function namesStrongEnoughForMerge(a: DbChatRow, b: DbChatRow) {
  const nameA = normalizeChatNameKey(a.name);
  const nameB = normalizeChatNameKey(b.name);
  if (!nameA || !nameB || !chatNamesMatchLoosely(nameA, nameB)) return false;
  const longer = nameA.length >= nameB.length ? nameA : nameB;
  const parts = longer.split(/\s+/).filter((part) => part.length >= 3);
  if (parts.length >= 2) return true;
  return longer.length >= 8;
}

function shouldMergeChatsByPhoneOrName(a: DbChatRow, b: DbChatRow) {
  const digitsA = chatPhoneDigits(a);
  const digitsB = chatPhoneDigits(b);
  if (digitsA && digitsB && phonesMatchLoosely(digitsA, digitsB)) return true;

  const aIsLid = a.remote_jid.endsWith("@lid");
  const bIsLid = b.remote_jid.endsWith("@lid");
  if (aIsLid !== bIsLid) {
    const phoneChat = aIsLid ? b : a;
    const lidChat = aIsLid ? a : b;
    const phoneDigits = chatPhoneDigits(phoneChat);
    const lidName = normalizeChatNameKey(lidChat.name);
    if (phoneDigits && lidName.length >= 4) {
      const phoneName = normalizeChatNameKey(phoneChat.name);
      if (!phoneName || chatNamesMatchLoosely(lidName, phoneName)) return true;
    }
  }

  if (aIsLid && bIsLid && namesStrongEnoughForMerge(a, b)) return true;

  return false;
}

function hasMeaningfulChatName(name: string | null | undefined) {
  const normalized = normalizeChatNameKey(name);
  if (!normalized || normalized.length < 2) return false;
  if (/^[?,.\-_\s]+$/.test(normalized)) return false;
  return true;
}

function isOrphanLidChat(chat: DbChatRow) {
  if (!chat.remote_jid.endsWith("@lid")) return false;
  if (hasMeaningfulChatName(chat.name)) return false;
  const lidDigits = chat.remote_jid.split("@")[0] ?? "";
  const phoneDigits = chat.phone ? normalizeWhatsAppPhone(chat.phone) : "";
  if (phoneDigits && phoneDigits !== lidDigits && phoneDigits.length >= 10) return false;
  return true;
}

function dedupeChatPoolById(chats: DbChatRow[]) {
  const seen = new Set<string>();
  const merged: DbChatRow[] = [];
  for (const chat of chats) {
    if (seen.has(chat.id)) continue;
    seen.add(chat.id);
    merged.push(chat);
  }
  return merged;
}

/** Resolve chat alvo para unir um @lid sem nome (ex.: mensagem enviada pelo celular). */
async function findMergeTargetForOrphanLid(
  orphan: DbChatRow,
  options: {
    allowEvolutionLookup?: boolean;
    pool?: DbChatRow[];
    namedHintChats?: DbChatRow[];
  } = {},
): Promise<{ target: DbChatRow; phoneJid: string | null; resolvedName: string | null } | null> {
  const { allowEvolutionLookup = true, pool: poolOverride, namedHintChats = [] } = options;
  const schemaReady = await isWhatsAppSchemaReady();
  const {
    getInstanceOwner,
    isOwnerJid,
    findCustomerJidFromLidMessages,
    findPhoneJidFromEvolutionChats,
    fetchEvolutionContactsCached,
    findPhoneJidByLidContactPair,
    resolveLidContactPushName,
    findPhoneContactByDisplayName,
    findCustomerJidFromLidContactQuery,
  } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();

  const basePool =
    poolOverride ?? (schemaReady ? await loadAllChatsForPhoneDedupe() : getMemoryState().chats);
  const pool = dedupeChatPoolById(basePool).filter(
    (chat) => !isOwnerJid(chat.remote_jid, owner) && chat.id !== orphan.id,
  );
  const phoneChats = pool.filter((chat) => chat.remote_jid.endsWith("@s.whatsapp.net"));

  const contacts = await fetchEvolutionContactsCached(allowEvolutionLookup);

  let phoneJid: string | null = findPhoneJidByLidContactPair(contacts, orphan.remote_jid, owner);
  const msgDigits = await resolvePhoneFromChatMessages(orphan.id);
  if (msgDigits) phoneJid = `${msgDigits}@s.whatsapp.net`;

  let resolvedName =
    stripEmoji(orphan.name ?? "").trim() ||
    stripEmoji(resolveLidContactPushName(contacts, orphan.remote_jid) ?? "").trim() ||
    null;

  if (allowEvolutionLookup) {
    if (!phoneJid) phoneJid = await findCustomerJidFromLidContactQuery(orphan.remote_jid, owner);
    if (!phoneJid) phoneJid = await findCustomerJidFromLidMessages(orphan.remote_jid, owner);
    if (!phoneJid) phoneJid = await findPhoneJidFromEvolutionChats(orphan.remote_jid, resolvedName);
  }

  let target: DbChatRow | null = null;

  if (phoneJid) {
    const digits = normalizeWhatsAppPhone(phoneJid.split("@")[0] ?? "");
    target =
      phoneChats.find((chat) => chat.remote_jid === phoneJid) ??
      (digits ? await findSimilarChatRowByDigits(digits, orphan.id) : null);

    if (!target && digits) {
      const { listWabaContacts } = await import("@/lib/waba/waba.server");
      const wabaMatch = (await listWabaContacts()).find((contact) =>
        phonesMatchLoosely(contact.phone, digits),
      );
      if (wabaMatch?.phone) {
        target =
          pool.find((chat) => {
            const chatDigits = chatPhoneDigits(chat);
            return Boolean(chatDigits && phonesMatchLoosely(chatDigits, digits));
          }) ?? null;
      }
    }

    if (!target) {
      for (const candidate of pool.filter((chat) => chat.name?.trim())) {
        const agenda = findPhoneJidByLidContactPair(contacts, candidate.remote_jid, owner);
        if (agenda && phonesMatchLoosely(agenda, phoneJid)) {
          target = candidate;
          break;
        }
      }
    }
  }

  if (!target && phoneJid) {
    for (const candidate of pool.filter((chat) => chat.name?.trim())) {
      const candidatePhone = candidate.remote_jid.endsWith("@s.whatsapp.net")
        ? candidate.remote_jid
        : (findPhoneJidByLidContactPair(contacts, candidate.remote_jid, owner) ?? null);
      if (candidatePhone && phonesMatchLoosely(phoneJid, candidatePhone)) {
        target = candidate;
        break;
      }
    }
  }

  if (!target) {
    for (const raw of contacts) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const jid = String(row.remoteJid ?? "");
      if (jid !== orphan.remote_jid || !jid.endsWith("@lid")) continue;

      const pushName = stripEmoji(String(row.pushName ?? "")).trim();
      const clusterPhone =
        findPhoneJidByLidContactPair(contacts, jid, owner) ??
        (pushName ? findPhoneContactByDisplayName(contacts, pushName, owner)?.remoteJid : null);
      if (!clusterPhone) continue;

      if (phoneJid && phonesMatchLoosely(phoneJid, clusterPhone)) {
        const matchChat = pushName
          ? pool.find((chat) => chatNamesMatchLoosely(chat.name, pushName))
          : null;
        if (matchChat) {
          target = matchChat;
          break;
        }
      }
    }
  }

  if (!target || target.id === orphan.id) return null;
  return { target, phoneJid, resolvedName };
}

/** Antes de criar chat @lid novo, tenta achar conversa existente (ex.: Kaylane). */
export async function findExistingChatForIncomingLid(input: {
  lidJid: string;
  preferredName?: string | null;
}) {
  const {
    findEvolutionChatIdentityForLid,
    findCustomerJidFromLidContactQuery,
    findCustomerJidFromLidMessages,
    getInstanceOwner,
  } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();

  const evolutionChat = await findEvolutionChatIdentityForLid(input.lidJid);
  const resolvedName = input.preferredName?.trim() || evolutionChat?.pushName?.trim() || null;

  let phoneJid =
    evolutionChat?.phoneJid ??
    (await findCustomerJidFromLidContactQuery(input.lidJid, owner)) ??
    (await findCustomerJidFromLidMessages(input.lidJid, owner));

  if (phoneJid) {
    const digits = normalizeWhatsAppPhone(phoneJid.split("@")[0] ?? "");
    const byPhone = digits ? await findSimilarChatRowByDigits(digits) : null;
    if (byPhone) return mapChat(byPhone);
  }

  return null;
}

/** Une chats @lid sem identidade ao par com telefone/nome real. */
export async function consolidateOrphanLidChats(
  options: {
    allowEvolutionLookup?: boolean;
    maxOrphans?: number;
  } = {},
) {
  const { allowEvolutionLookup = false, maxOrphans = 5 } = options;
  const schemaReady = await isWhatsAppSchemaReady();
  const { getInstanceOwner, isOwnerJid } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();

  const pool = schemaReady ? await loadAllChatsForPhoneDedupe() : getMemoryState().chats;
  const orphanLids = pool
    .filter((chat) => !isOwnerJid(chat.remote_jid, owner) && isOrphanLidChat(chat))
    .slice(0, maxOrphans);
  if (orphanLids.length === 0) return;

  for (const lidChat of orphanLids) {
    const match = await findMergeTargetForOrphanLid(lidChat, { allowEvolutionLookup, pool });
    if (!match) continue;

    const { target, phoneJid, resolvedName } = match;
    const remoteJid = target.remote_jid.endsWith("@s.whatsapp.net")
      ? target.remote_jid
      : (phoneJid ?? target.remote_jid);
    await consolidateChatsIntoTarget(lidChat.id, target.id, remoteJid);

    if (resolvedName && !target.name?.trim()) {
      await updateChatIdentityInPlace(target.id, { name: resolvedName });
    }
  }
}

/** Consolida todos os chats @lid orfaos em lotes (one-shot apos conectar ou manual). */
export async function runFullOrphanLidConsolidation(maxRounds = 12) {
  const { getInstanceOwner, isOwnerJid } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();

  for (let round = 0; round < maxRounds; round += 1) {
    const schemaReady = await isWhatsAppSchemaReady();
    const pool = schemaReady ? await loadAllChatsForPhoneDedupe() : getMemoryState().chats;
    const orphanCount = pool.filter(
      (chat) => !isOwnerJid(chat.remote_jid, owner) && isOrphanLidChat(chat),
    ).length;
    if (orphanCount === 0) break;

    await consolidateOrphanLidChats({ allowEvolutionLookup: true, maxOrphans: 20 });
    await consolidateSimilarPhoneChats();
  }
}

export async function updateWhatsAppChatInboxStatus(
  chatId: string,
  inboxStatus: "open" | "pending" | "closed",
) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const state = getMemoryState();
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) throw new Error("Conversa nao encontrada.");
    const wasClosed = (chat.inbox_status ?? "open") === "closed";
    chat.inbox_status = inboxStatus;
    if (inboxStatus === "open" && wasClosed) {
      const { resolveAttendanceSessionAnchor } =
        await import("@/lib/atendimento/atendimento-hours.server");
      chat.attendance_opened_at = await resolveAttendanceSessionAnchor(chatId, nowIso());
    }
    chat.updated_at = nowIso();
    return mapChat(chat);
  }

  const supabase = await getSupabase();
  const { data: current } = await supabase
    .from("whatsapp_chats")
    .select("inbox_status")
    .eq("id", chatId)
    .maybeSingle<{ inbox_status: string | null }>();

  const patch: Record<string, string> = {
    inbox_status: inboxStatus,
    updated_at: nowIso(),
  };
  if (inboxStatus === "open" && current?.inbox_status === "closed") {
    const { resolveAttendanceSessionAnchor } =
      await import("@/lib/atendimento/atendimento-hours.server");
    patch.attendance_opened_at = await resolveAttendanceSessionAnchor(chatId, nowIso());
  }

  const { data, error } = await supabase
    .from("whatsapp_chats")
    .update(patch)
    .eq("id", chatId)
    .select("*")
    .single<DbChatRow>();
  if (error) throw error;
  if (!data) throw new Error("Conversa nao encontrada.");
  return mapChat(data);
}

/** Encerra todos os atendimentos abertos ou pendentes. */
export async function closeAllActiveAtendimentoChats() {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const state = getMemoryState();
    for (const chat of state.chats) {
      const status = chat.inbox_status ?? "open";
      if (status === "open" || status === "pending") {
        chat.inbox_status = "closed";
        chat.updated_at = nowIso();
      }
    }
    return;
  }

  const supabase = await getSupabase();
  const { error } = await supabase
    .from("whatsapp_chats")
    .update({ inbox_status: "closed", updated_at: nowIso() })
    .or("inbox_status.is.null,inbox_status.eq.open,inbox_status.eq.pending");
  if (error) throw error;
}

/** Encerra atendimentos ativos cuja ultima mensagem e de dia anterior (fuso da loja). */
export async function closeAtendimentoChatsFromPreviousDays(reference = new Date()) {
  const { isMessageBeforeCalendarDay, STORE_TIMEZONE } = await import("@/lib/shared/horarios");
  const schemaReady = await isWhatsAppSchemaReady();
  const updatedAt = nowIso();

  if (!schemaReady) {
    const state = getMemoryState();
    for (const chat of state.chats) {
      const status = chat.inbox_status ?? "open";
      if (status !== "open" && status !== "pending") continue;
      if (isMessageBeforeCalendarDay(chat.last_message_at, reference, STORE_TIMEZONE)) {
        chat.inbox_status = "closed";
        chat.updated_at = updatedAt;
      }
    }
    return 0;
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select("id, inbox_status, last_message_at")
    .or("inbox_status.is.null,inbox_status.eq.open,inbox_status.eq.pending");
  if (error) throw error;

  const ids = (data ?? [])
    .filter((row) => isMessageBeforeCalendarDay(row.last_message_at, reference, STORE_TIMEZONE))
    .map((row) => row.id);

  if (ids.length === 0) return 0;

  const { error: updateError } = await supabase
    .from("whatsapp_chats")
    .update({ inbox_status: "closed", updated_at: updatedAt })
    .in("id", ids);
  if (updateError) throw updateError;
  return ids.length;
}

function isNewAttendanceAfterBoundary(
  row: {
    attendance_opened_at?: string | null;
    last_message_at?: string | null;
  },
  boundaryIso: string,
) {
  const boundaryMs = new Date(boundaryIso).getTime();
  if (row.attendance_opened_at) {
    if (new Date(row.attendance_opened_at).getTime() >= boundaryMs) return true;
  }
  if (row.last_message_at) {
    if (new Date(row.last_message_at).getTime() >= boundaryMs) return true;
  }
  return false;
}

/** Encerra expediente sem fechar atendimentos novos apos o horario da loja. */
export async function closeAtendimentoChatsForStoreClosed(boundaryIso: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  const updatedAt = nowIso();

  if (!schemaReady) {
    const state = getMemoryState();
    let closed = 0;
    for (const chat of state.chats) {
      const status = chat.inbox_status ?? "open";
      if (status !== "open" && status !== "pending") continue;
      if (isNewAttendanceAfterBoundary(chat, boundaryIso)) continue;
      chat.inbox_status = "closed";
      chat.updated_at = updatedAt;
      closed += 1;
    }
    return closed;
  }

  const supabase = await getSupabase();
  const { data: inboundRows, error: inboundError } = await supabase
    .from("whatsapp_messages")
    .select("chat_id")
    .eq("direction", "inbound")
    .gte("sent_at", boundaryIso);
  if (inboundError) throw inboundError;
  const inboundAfterBoundary = new Set((inboundRows ?? []).map((row) => String(row.chat_id)));

  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select("id, inbox_status, attendance_opened_at, last_message_at")
    .or("inbox_status.is.null,inbox_status.eq.open,inbox_status.eq.pending");
  if (error) throw error;

  const ids = (data ?? [])
    .filter((row) => {
      if (isNewAttendanceAfterBoundary(row, boundaryIso)) return false;
      if (inboundAfterBoundary.has(row.id)) return false;
      return true;
    })
    .map((row) => row.id);

  if (ids.length === 0) return 0;

  const { error: updateError } = await supabase
    .from("whatsapp_chats")
    .update({ inbox_status: "closed", updated_at: updatedAt })
    .in("id", ids);
  if (updateError) throw updateError;
  return ids.length;
}

/** Encerra atendimentos ativos cuja ultima mensagem e anterior ao instante informado. */
export async function closeAtendimentoChatsWithActivityBefore(beforeIso: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const state = getMemoryState();
    for (const chat of state.chats) {
      const status = chat.inbox_status ?? "open";
      if (status !== "open" && status !== "pending") continue;
      if (!chat.last_message_at || chat.last_message_at < beforeIso) {
        chat.inbox_status = "closed";
        chat.updated_at = nowIso();
      }
    }
    return;
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select("id, last_message_at")
    .or("inbox_status.is.null,inbox_status.eq.open,inbox_status.eq.pending");
  if (error) throw error;

  const ids = (data ?? [])
    .filter((row) => !row.last_message_at || row.last_message_at < beforeIso)
    .map((row) => row.id);
  if (ids.length === 0) return;

  const { error: updateError } = await supabase
    .from("whatsapp_chats")
    .update({ inbox_status: "closed", updated_at: nowIso() })
    .in("id", ids);
  if (updateError) throw updateError;
}

export async function countActiveAtendimentoChats() {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    return getMemoryState().chats.filter((chat) => {
      const status = chat.inbox_status ?? "open";
      return status === "open" || status === "pending";
    }).length;
  }

  const supabase = await getSupabase();
  const { count, error } = await supabase
    .from("whatsapp_chats")
    .select("id", { count: "exact", head: true })
    .or("inbox_status.is.null,inbox_status.eq.open,inbox_status.eq.pending");
  if (error) throw error;
  return count ?? 0;
}

let lastOrphanConsolidationAt = 0;
const ORPHAN_CONSOLIDATION_INTERVAL_MS = 60_000;

function scheduleOrphanLidConsolidation() {
  if (Date.now() - lastOrphanConsolidationAt < ORPHAN_CONSOLIDATION_INTERVAL_MS) return;
  lastOrphanConsolidationAt = Date.now();
  void consolidateOrphanLidChats({ allowEvolutionLookup: true, maxOrphans: 15 }).catch((error) => {
    console.error("[consolidateOrphanLidChats]", error);
  });
}

async function consolidateInboxOrphanLids(
  inboxChats: DbChatRow[],
  options: { maxOrphans?: number } = {},
) {
  const { maxOrphans = 12 } = options;
  const orphans = inboxChats.filter((chat) => isOrphanLidChat(chat)).slice(0, maxOrphans);
  if (orphans.length === 0) return false;

  const namedHints = inboxChats.filter((chat) => stripEmoji(chat.name ?? "").trim());
  let merged = false;

  for (const orphan of orphans) {
    const before = orphan.id;
    const after = await reconcileOrphanLidChat(orphan.id, orphan.remote_jid, {
      allowEvolutionLookup: true,
      namedHintChats: namedHints,
      pool: inboxChats,
    });
    if (after !== before) merged = true;
  }

  return merged;
}

let lastSimilarConsolidationAt = 0;
const SIMILAR_CONSOLIDATION_INTERVAL_MS = 30_000;

async function loadAllChatsForPhoneDedupe() {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) return getMemoryState().chats;

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select("*")
    .or("phone.not.is.null,remote_jid.like.%@s.whatsapp.net,remote_jid.like.%@lid")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(DEDUPE_CHAT_POOL_LIMIT);
  if (error) throw error;
  return data ?? [];
}

/** Une conversas duplicadas quando o telefone e ~95% igual (ex.: com/sem nono digito). */
export async function consolidateSimilarPhoneChats() {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const state = getMemoryState();
    const deleted = new Set<string>();
    for (let i = 0; i < state.chats.length; i += 1) {
      const a = state.chats[i];
      if (!a || deleted.has(a.id)) continue;
      for (let j = i + 1; j < state.chats.length; j += 1) {
        const b = state.chats[j];
        if (!b || deleted.has(b.id)) continue;
        if (!shouldMergeChatsByPhoneOrName(a, b)) continue;
        const { source, target, remoteJid } = pickCanonicalChatPair(a, b);
        for (const message of state.messages) {
          if (message.chat_id === source.id) {
            message.chat_id = target.id;
            message.remote_jid = remoteJid;
          }
        }
        target.unread_count += source.unread_count;
        const digits = chatPhoneDigits(target) ?? chatPhoneDigits(source);
        if (digits)
          target.phone = formatWhatsAppPhone(canonicalBrazilWhatsAppDigits(digits) || digits);
        deleted.add(source.id);
        if (source.id === a.id) break;
      }
    }
    state.chats = state.chats.filter((chat) => !deleted.has(chat.id));
    return;
  }

  const { getInstanceOwner, isOwnerJid } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();
  const chats = (await loadAllChatsForPhoneDedupe()).filter(
    (chat) => !isOwnerJid(chat.remote_jid, owner),
  );
  const deleted = new Set<string>();

  for (let i = 0; i < chats.length; i += 1) {
    const a = chats[i];
    if (!a || deleted.has(a.id)) continue;

    for (let j = i + 1; j < chats.length; j += 1) {
      const b = chats[j];
      if (!b || deleted.has(b.id)) continue;
      if (!shouldMergeChatsByPhoneOrName(a, b)) continue;

      const freshA = deleted.has(a.id) ? null : await getWhatsAppChatById(a.id);
      const freshB = await getWhatsAppChatById(b.id);
      if (!freshA || !freshB) continue;

      const { source, target, remoteJid } = pickCanonicalChatPair(freshA, freshB);
      await consolidateChatsIntoTarget(source.id, target.id, remoteJid);

      const digits = chatPhoneDigits(target) ?? chatPhoneDigits(source);
      if (digits) {
        const canonical = canonicalBrazilWhatsAppDigits(digits) || digits;
        await updateChatIdentityInPlace(target.id, {
          phone: formatWhatsAppPhone(canonical),
        });
      }

      deleted.add(source.id);
      if (source.id === a.id) break;
    }
  }
}

async function maybeConsolidateSimilarPhoneChats() {
  if (Date.now() - lastSimilarConsolidationAt < SIMILAR_CONSOLIDATION_INTERVAL_MS) return;
  lastSimilarConsolidationAt = Date.now();
  try {
    await consolidateSimilarPhoneChats();
  } catch (error) {
    console.error("[consolidateSimilarPhoneChats]", error);
  }
}

/** Remove duplicatas na listagem (telefone ~95% igual ou @lid com par real). */
function dedupeChatsForList(chats: DbChatRow[]) {
  const kept: DbChatRow[] = [];
  const dropped = new Set<string>();
  const ranked = [...chats].sort((a, b) => chatMergeScore(b) - chatMergeScore(a));

  for (const chat of ranked) {
    if (dropped.has(chat.id)) continue;
    const other = kept.find(
      (item) => item.id !== chat.id && shouldMergeChatsByPhoneOrName(chat, item),
    );
    if (other) {
      dropped.add(chat.id);
      const { source, target, remoteJid } = pickCanonicalChatPair(chat, other);
      if (source.id === other.id) {
        const idx = kept.indexOf(other);
        if (idx >= 0) kept[idx] = mergeChatRowForList(target, source);
      }
      if (source.id !== target.id) {
        // Merge no banco fica no webhook/repair — evita apagar UUID ativo durante listagem.
      }
      continue;
    }
    kept.push(chat);
  }

  return chats.filter((chat) => !dropped.has(chat.id));
}

async function findSimilarChatRowByDigits(
  targetDigits: string,
  excludeChatId?: string,
): Promise<DbChatRow | null> {
  if (!targetDigits) return null;

  const { getInstanceOwner, isOwnerJid } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();
  const schemaReady = await isWhatsAppSchemaReady();

  const pool = schemaReady ? await loadAllChatsForPhoneDedupe() : getMemoryState().chats;
  const matches = pool.filter((row) => {
    if (excludeChatId && row.id === excludeChatId) return false;
    if (isOwnerJid(row.remote_jid, owner)) return false;
    const digits = chatPhoneDigits(row);
    return Boolean(digits && phonesMatchLoosely(digits, targetDigits));
  });

  if (matches.length === 0) return null;
  return matches.sort((a, b) => chatMergeScore(b) - chatMergeScore(a))[0] ?? null;
}

/** Atualiza identidade do chat preservando UUID quando possivel. */
export async function mergeChatByIdentity(
  chatId: string,
  identity: {
    remoteJid: string;
    phone: string | null;
    name: string | null;
    profilePicUrl: string | null;
  },
): Promise<WhatsAppChat> {
  const chat = await getWhatsAppChatById(chatId);
  if (!chat) throw new Error("Conversa nao encontrada.");

  const identityDigits = identity.phone
    ? normalizeWhatsAppPhone(identity.phone)
    : identity.remoteJid.endsWith("@s.whatsapp.net")
      ? normalizeWhatsAppPhone(identity.remoteJid.split("@")[0] ?? "")
      : chatPhoneDigits(chat);
  if (identityDigits) {
    const similar = await findSimilarChatRowByDigits(identityDigits, chatId);
    if (similar) {
      const { source, target, remoteJid } = pickCanonicalChatPair(chat, similar);
      if (source.id === chatId) {
        await consolidateChatsIntoTarget(chatId, target.id, remoteJid);
        chatId = target.id;
      } else if (source.id === similar.id && chatId !== target.id) {
        await consolidateChatsIntoTarget(similar.id, chatId, remoteJid);
      }
    }
  }

  const refreshed = await getWhatsAppChatById(chatId);
  if (!refreshed) throw new Error("Conversa nao encontrada.");
  const chatRow = refreshed;

  const unchanged =
    chatRow.remote_jid === identity.remoteJid &&
    chatRow.phone === identity.phone &&
    chatRow.name === identity.name &&
    chatRow.profile_pic_url === identity.profilePicUrl;
  if (unchanged) return mapChat(chatRow);

  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    chatRow.remote_jid = identity.remoteJid;
    if (identity.phone) chatRow.phone = identity.phone;
    if (identity.name) chatRow.name = identity.name;
    if (identity.profilePicUrl) chatRow.profile_pic_url = identity.profilePicUrl;
    chatRow.updated_at = nowIso();
    for (const message of getMemoryState().messages) {
      if (message.chat_id === chatId) message.remote_jid = identity.remoteJid;
    }
    return mapChat(chatRow);
  }

  const existingTarget = await getChatByRemoteJid(identity.remoteJid);
  if (existingTarget && existingTarget.id !== chatId) {
    await consolidateChatsIntoTarget(chatId, existingTarget.id, identity.remoteJid);

    const owner = await getInstanceOwner();
    const phone = identity.phone ?? existingTarget.phone ?? chatRow.phone;
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("whatsapp_chats")
      .update({
        phone,
        name: pickChatDisplayName({
          existing: existingTarget.name,
          incoming: identity.name,
          phone,
          owner,
        }),
        profile_pic_url: identity.profilePicUrl ?? existingTarget.profile_pic_url,
        updated_at: nowIso(),
      })
      .eq("id", existingTarget.id)
      .select("*")
      .single<DbChatRow>();
    if (error) throw error;
    return mapChat(data);
  }

  const owner = await getInstanceOwner();
  const phone = identity.phone ?? chatRow.phone;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .update({
      remote_jid: identity.remoteJid,
      phone,
      name: pickChatDisplayName({
        existing: chatRow.name,
        incoming: identity.name,
        phone,
        owner,
      }),
      profile_pic_url: identity.profilePicUrl ?? chatRow.profile_pic_url,
      updated_at: nowIso(),
    })
    .eq("id", chatId)
    .select("*")
    .single<DbChatRow>();
  if (error) throw error;

  await supabase
    .from("whatsapp_messages")
    .update({ remote_jid: identity.remoteJid })
    .eq("chat_id", chatId);
  return mapChat(data);
}

/** Enriquece telefone resolvido sem trocar o chat aberto pelo usuario. */
export async function resolveCanonicalChatId(chatId: string): Promise<string> {
  const chat = await getWhatsAppChatById(chatId);
  if (!chat) return chatId;

  if (chat.remote_jid.endsWith("@s.whatsapp.net")) return chatId;

  try {
    const { resolveRealPhoneJid, getInstanceOwner, isOwnerJid } =
      await import("@/lib/api/atendimento/whatsapp-identity.server");
    const owner = await getInstanceOwner();
    const resolved = await resolveRealPhoneJid({
      remoteJid: chat.remote_jid,
      phone: chat.phone,
      chatId,
      preferredName: chat.name,
      forceRefresh: true,
    });

    if (resolved.phone && resolved.phone !== chat.phone && !isOwnerJid(resolved.remoteJid, owner)) {
      await updateChatIdentityInPlace(chatId, { phone: resolved.phone });
    }
  } catch {
    // mantem chatId original
  }

  return chatId;
}

export async function updateChatIdentityInPlace(
  chatId: string,
  patch: {
    phone?: string | null;
    name?: string | null;
    remote_jid?: string;
    assigned_agent_id?: string | null;
    profile_pic_url?: string | null;
    profile_pic_phone_digits?: string | null;
    phone_verified_at?: string | null;
  },
) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const chat = getMemoryState().chats.find((item) => item.id === chatId);
    if (!chat) return;
    if (patch.phone !== undefined) chat.phone = patch.phone;
    if (patch.name !== undefined) chat.name = patch.name;
    if (patch.remote_jid !== undefined) chat.remote_jid = patch.remote_jid;
    if (patch.profile_pic_url !== undefined) chat.profile_pic_url = patch.profile_pic_url;
    if (patch.assigned_agent_id !== undefined) {
      (chat as DbChatRow & { assigned_agent_id?: string | null }).assigned_agent_id =
        patch.assigned_agent_id;
    }
    if (patch.phone_verified_at !== undefined) {
      (chat as DbChatRow & { phone_verified_at?: string | null }).phone_verified_at =
        patch.phone_verified_at;
    }
    if (patch.profile_pic_phone_digits !== undefined) {
      (chat as DbChatRow & { profile_pic_phone_digits?: string | null }).profile_pic_phone_digits =
        patch.profile_pic_phone_digits;
    }
    chat.updated_at = nowIso();
    return;
  }

  const updates: Record<string, string | null> = { updated_at: nowIso() };
  if (patch.phone !== undefined) updates.phone = patch.phone;
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.remote_jid !== undefined) updates.remote_jid = patch.remote_jid;
  if (patch.assigned_agent_id !== undefined) updates.assigned_agent_id = patch.assigned_agent_id;
  if (patch.profile_pic_url !== undefined) updates.profile_pic_url = patch.profile_pic_url;
  if (patch.phone_verified_at !== undefined) updates.phone_verified_at = patch.phone_verified_at;
  if (patch.profile_pic_phone_digits !== undefined) {
    updates.profile_pic_phone_digits = patch.profile_pic_phone_digits;
  }

  const supabase = await getSupabase();
  let { error } = await supabase.from("whatsapp_chats").update(updates).eq("id", chatId);
  if (error?.message?.includes("phone_verified_at")) {
    delete updates.phone_verified_at;
    ({ error } = await supabase.from("whatsapp_chats").update(updates).eq("id", chatId));
  }
  if (error?.message?.includes("profile_pic_phone_digits")) {
    delete updates.profile_pic_phone_digits;
    ({ error } = await supabase.from("whatsapp_chats").update(updates).eq("id", chatId));
  }
  if (error) throw new Error(error.message);
}

/** Propaga telefone da agenda para chats Evolution com o mesmo contato. */
export async function syncAgendaPhoneToWhatsAppChats(phone: string) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits || !looksLikeWhatsAppPhoneDigits(digits)) return;

  const formatted = formatWhatsAppPhone(phone) ?? phone;
  const verifiedAt = nowIso();
  const schemaReady = await isWhatsAppSchemaReady();
  const pool = schemaReady ? await loadAllChatsForPhoneDedupe() : getMemoryState().chats;

  for (const row of pool) {
    const chatDigits = chatPhoneDigits(row);
    if (!chatDigits || !phonesMatchLoosely(chatDigits, digits)) continue;
    await updateChatIdentityInPlace(row.id, {
      phone: formatted,
      phone_verified_at: verifiedAt,
    });
    await promoteChatToRealPhoneJid(row.id, formatted);
  }
}

/** Propaga nome da agenda para chats Evolution com o mesmo telefone. */
export async function syncAgendaNameToWhatsAppChats(phone: string, name: string) {
  const digits = normalizeWhatsAppPhone(phone);
  const trimmed = name.trim();
  if (!digits || !trimmed) return;

  const schemaReady = await isWhatsAppSchemaReady();
  const pool = schemaReady ? await loadAllChatsForPhoneDedupe() : getMemoryState().chats;

  for (const row of pool) {
    const chatDigits = chatPhoneDigits(row);
    if (!chatDigits || !phonesMatchLoosely(chatDigits, digits)) continue;
    if ((row.name ?? "").trim() === trimmed) continue;
    await updateChatIdentityInPlace(row.id, { name: trimmed });
  }
}

/** Une duplicatas do mesmo contato (telefone ~95% igual) para uma conversa. */
export async function mergeDuplicatesForChat(chatId: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) return { merged: 0, targetId: chatId };

  const pool = await loadAllChatsForPhoneDedupe();
  const chat = pool.find((row) => row.id === chatId);
  if (!chat) throw new Error("Conversa nao encontrada.");

  let merged = 0;
  let targetId = chatId;

  for (const other of pool) {
    if (other.id === targetId) continue;
    const anchor = pool.find((row) => row.id === targetId) ?? chat;
    if (!shouldMergeChatsByPhoneOrName(anchor, other)) continue;
    const { source, target, remoteJid } = pickCanonicalChatPair(anchor, other);
    await consolidateChatsIntoTarget(source.id, target.id, remoteJid);
    targetId = target.id;
    merged += 1;
  }

  return { merged, targetId };
}

function isJunkChatRow(chat: DbChatRow) {
  const name = (chat.name ?? "").trim().toLowerCase();
  if (
    !chat.remote_jid ||
    chat.remote_jid.includes("broadcast") ||
    chat.remote_jid.endsWith("@g.us")
  ) {
    return true;
  }
  if ([".", ",", "-", "?", "!", "contato"].includes(name) && !chat.last_message?.trim()) {
    return true;
  }
  if (name.length <= 1 && !chat.phone?.trim() && !chat.last_message?.trim()) {
    return true;
  }
  return false;
}

/** Busca telefone real gravado nas mensagens do chat (funciona para @lid com historico). */
export async function resolvePhoneFromChatMessages(chatId: string) {
  const { toEvolutionSendDigits } = await import("@/lib/atendimento/whatsapp");
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    for (const message of getMemoryState().messages) {
      if (message.chat_id !== chatId) continue;
      if (!message.remote_jid.endsWith("@s.whatsapp.net")) continue;
      const digits = toEvolutionSendDigits(message.remote_jid.split("@")[0] ?? "");
      if (digits) return digits;
    }
    return null;
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("remote_jid")
    .eq("chat_id", chatId)
    .like("remote_jid", "%@s.whatsapp.net")
    .order("sent_at", { ascending: false })
    .limit(10);
  if (error) return null;

  for (const row of data ?? []) {
    const digits = toEvolutionSendDigits(String(row.remote_jid).split("@")[0] ?? "");
    if (digits) return digits;
  }
  return null;
}

/** Remove timestamps falsos de importacao da agenda (sem mensagem real). */
export async function cleanupConversationPollution() {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) return;

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select("id, last_message, last_message_at")
    .not("last_message_at", "is", null);
  if (error) {
    console.error("[cleanupConversationPollution]", error);
    return;
  }

  const polluted = (data ?? []).filter((row) => !row.last_message?.trim());
  if (polluted.length === 0) return;

  for (let index = 0; index < polluted.length; index += 100) {
    const chunk = polluted.slice(index, index + 100);
    const ids = chunk.map((row) => row.id);
    await supabase
      .from("whatsapp_chats")
      .update({ last_message: null, last_message_at: null, updated_at: nowIso() })
      .in("id", ids);
  }
}

export async function cleanupJunkWhatsAppChats() {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const state = getMemoryState();
    state.chats = state.chats.filter((chat) => !isJunkChatRow(chat));
    return;
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select("id, name, phone, last_message, remote_jid");
  if (error) {
    console.error("[cleanupJunkWhatsAppChats]", error);
    return;
  }

  const junkIds = (data ?? []).filter(isJunkChatRow).map((row) => row.id);
  if (junkIds.length === 0) return;

  for (let index = 0; index < junkIds.length; index += 100) {
    const chunk = junkIds.slice(index, index + 100);
    await supabase.from("whatsapp_chats").delete().in("id", chunk);
  }
}

function isVisibleInboxChat(chat: DbChatRow, cutoff: string) {
  if (!chat.last_message_at || chat.last_message_at < cutoff) return false;
  if (chat.remote_jid.endsWith("@lid") && isOrphanLidChat(chat)) return false;
  if (isWhatsAppDraftConversationPreview(chat.last_message)) return true;
  return Boolean(chat.last_message?.trim());
}

export async function findWhatsAppChatByPhoneDigits(targetDigits: string) {
  if (!targetDigits) return null;

  const schemaReady = await isWhatsAppSchemaReady();
  const { getInstanceOwner, isOwnerJid } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();
  const phoneJid = `${canonicalBrazilWhatsAppDigits(targetDigits) || targetDigits}@s.whatsapp.net`;

  const pickBest = (rows: DbChatRow[]) => {
    const eligible = rows.filter((row) => {
      if (isOwnerJid(row.remote_jid, owner)) return false;
      if (row.remote_jid === phoneJid) return true;
      const digits = chatPhoneDigits(row);
      return Boolean(digits && phonesMatchLoosely(digits, targetDigits));
    });
    if (eligible.length === 0) return null;
    return eligible.sort((a, b) => chatMergeScore(b) - chatMergeScore(a))[0] ?? null;
  };

  if (!schemaReady) {
    const row = pickBest(getMemoryState().chats);
    return row ? mapChat(row) : null;
  }

  const row = await findSimilarChatRowByDigits(targetDigits);
  return row ? mapChat(row) : null;
}

export async function findWhatsAppChatByDisplayName(name: string) {
  const term = stripEmoji(name).trim();
  if (!term) return null;

  const normalized = normalizeChatNameKey(term);
  const { getInstanceOwner, isOwnerJid } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();

  const pickBest = (rows: DbChatRow[]) => {
    const eligible = rows.filter((row) => !isOwnerJid(row.remote_jid, owner));
    if (eligible.length === 0) return null;

    const exact = eligible.filter((row) => normalizeChatNameKey(row.name) === normalized);
    const loose = eligible.filter((row) => chatNamesMatchLoosely(row.name, term));
    const pool = exact.length > 0 ? exact : loose;
    if (pool.length === 0) return null;

    const withPhone = pool.filter(
      (row) => row.remote_jid.endsWith("@s.whatsapp.net") || Boolean(chatPhoneDigits(row)),
    );
    const ranked = (withPhone.length > 0 ? withPhone : pool).sort((a, b) =>
      String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? "")),
    );
    return ranked[0] ?? null;
  };

  const schemaReady = await isWhatsAppSchemaReady();
  const firstName = normalized.split(/\s+/)[0] ?? normalized;
  const searchTerm = firstName.length >= 3 ? firstName : normalized;

  if (!schemaReady) {
    const row = pickBest(getMemoryState().chats);
    return row ? mapChat(row) : null;
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select("*")
    .ilike("name", `%${searchTerm}%`)
    .limit(30);
  if (error) throw error;

  const row = pickBest(data ?? []);
  return row ? mapChat(row) : null;
}

export async function repairDuplicateAtendimentoChats(now = new Date()) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) return 0;

  const { getInstanceOwner, isOwnerJid } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();
  const pool = await loadAllChatsForPhoneDedupe();
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const supabase = await getSupabase();
  const processed = new Set<string>();
  let merged = 0;

  for (const chat of pool) {
    if (processed.has(chat.id) || isOwnerJid(chat.remote_jid, owner)) continue;

    const group = pool.filter(
      (other) =>
        other.id !== chat.id &&
        !processed.has(other.id) &&
        !isOwnerJid(other.remote_jid, owner) &&
        shouldMergeChatsByPhoneOrName(chat, other),
    );
    if (group.length === 0) continue;

    const all = [chat, ...group];
    for (const row of all) processed.add(row.id);

    let latestInbound: { sentAt: string } | null = null;
    for (const row of all) {
      if (!row.last_message_at || row.last_message_at < since) continue;
      const { data: latest, error } = await supabase
        .from("whatsapp_messages")
        .select("direction, sent_at")
        .eq("chat_id", row.id)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ direction: string; sent_at: string }>();
      if (error || latest?.direction !== "inbound") continue;
      if (!latestInbound || latest.sent_at > latestInbound.sentAt) {
        latestInbound = { sentAt: latest.sent_at };
      }
    }

    const ranked = [...all].sort((a, b) => chatMergeScore(b) - chatMergeScore(a));
    let canonical = ranked[0];
    for (let i = 1; i < ranked.length; i += 1) {
      const { source, target, remoteJid } = pickCanonicalChatPair(ranked[i], canonical);
      if (source.id === target.id) continue;
      await consolidateChatsIntoTarget(source.id, target.id, remoteJid);
      merged += 1;
      canonical = (await getWhatsAppChatById(target.id)) ?? target;
    }

    if (latestInbound) {
      const { ensureCustomerInboundKeepsConversationOpen, isAfterHoursCustomerActivity } =
        await import("@/lib/atendimento/atendimento-hours.server");
      if (await isAfterHoursCustomerActivity(latestInbound.sentAt, now)) {
        await ensureCustomerInboundKeepsConversationOpen(canonical.id, latestInbound.sentAt);
      }
    }
  }

  return merged;
}

export async function listWhatsAppChats(search = "") {
  scheduleOrphanLidConsolidation();
  void maybeConsolidateSimilarPhoneChats();

  const schemaReady = await isWhatsAppSchemaReady();
  const term = search.trim().toLowerCase();
  const cutoff = (await getWhatsAppMessageCutoff()).toISOString();
  const { getInstanceOwner, isOwnerJid } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();

  const notOwner = (chat: DbChatRow) => !isOwnerJid(chat.remote_jid, owner);

  if (!schemaReady) {
    const memoryChats = getMemoryState()
      .chats.filter(chatWithinRetention)
      .filter(notOwner)
      .filter((chat) => isVisibleInboxChat(chat, cutoff));
    await consolidateInboxOrphanLids(memoryChats);
    const chats = dedupeChatsForList(memoryChats)
      .filter((chat) => {
        if (!term) return true;
        return [chat.name, chat.phone, chat.last_message]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)))
      .slice(0, INBOX_CHAT_LIMIT);
    return chats.map(mapChat);
  }

  const supabase = await getSupabase();
  const loadInboxRows = async () => {
    const { data, error } = await supabase
      .from("whatsapp_chats")
      .select("*")
      .gte("last_message_at", cutoff)
      .not("last_message", "is", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(INBOX_CHAT_LIMIT);
    if (error) throw error;
    return data ?? [];
  };

  let rows = await loadInboxRows();
  try {
    const merged = await consolidateInboxOrphanLids(rows);
    if (merged) rows = await loadInboxRows();
  } catch (error) {
    console.error("[consolidateInboxOrphanLids]", error);
  }

  let filtered = dedupeChatsForList(rows)
    .filter(notOwner)
    .filter((chat) => !isJunkChatRow(chat))
    .filter((chat) => isVisibleInboxChat(chat, cutoff))
    .filter((chat) => {
      if (!term) return true;
      return [chat.name, chat.phone, chat.last_message]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    })
    .sort((a, b) => String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? "")));

  if (filtered.length === 0 && rows.length > 0) {
    filtered = rows
      .filter(notOwner)
      .filter((chat) => !isJunkChatRow(chat))
      .filter((chat) => isVisibleInboxChat(chat, cutoff))
      .filter((chat) => {
        if (!term) return true;
        return [chat.name, chat.phone, chat.last_message]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .sort((a, b) =>
        String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? "")),
      );
  }

  schedulePreviewSync(filtered);

  return filtered.map(mapChat);
}

/** Lista todos os contatos da agenda importados (sem filtro de 7 dias). */
export async function listWhatsAppAgenda(search = "") {
  const schemaReady = await isWhatsAppSchemaReady();
  const term = search.trim().toLowerCase();
  const { getInstanceOwner, isOwnerJid } = await import("@/lib/api/atendimento/whatsapp-identity.server");
  const owner = await getInstanceOwner();

  const notOwner = (chat: DbChatRow) => !isOwnerJid(chat.remote_jid, owner);
  const matchesTerm = (chat: DbChatRow) => {
    if (!term) return true;
    return [chat.name, chat.phone, chat.remote_jid]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  };

  if (!schemaReady) {
    return getMemoryState()
      .chats.filter((chat) => chat.remote_jid.endsWith("@s.whatsapp.net"))
      .filter(notOwner)
      .filter(matchesTerm)
      .sort((a, b) => String(a.name ?? a.phone).localeCompare(String(b.name ?? b.phone)))
      .map(mapChat);
  }

  const supabase = await getSupabase();
  const data = await paginateWhatsAppChats((from, to) =>
    supabase
      .from("whatsapp_chats")
      .select("*")
      .or("remote_jid.like.%@s.whatsapp.net,remote_jid.like.%@lid")
      .order("name", { ascending: true, nullsFirst: false })
      .range(from, to),
  );

  return dedupeChatsForList(data).filter(notOwner).filter(matchesTerm).map(mapChat);
}

export async function clearWhatsAppMessagesForChat(chatId: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const state = getMemoryState();
    state.messages = state.messages.filter((message) => message.chat_id !== chatId);
    return;
  }
  const supabase = await getSupabase();
  await supabase.from("whatsapp_messages").delete().eq("chat_id", chatId);
}

async function findChatIdsForMessageHistory(chatId: string): Promise<string[]> {
  const chat = await getWhatsAppChatById(chatId);
  if (!chat) return [chatId];

  const digits = chatPhoneDigits(chat as DbChatRow);
  if (!digits) return [chatId];

  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const ids = new Set<string>([chatId]);
    for (const row of getMemoryState().chats) {
      if (row.id === chatId) continue;
      const rowDigits = chatPhoneDigits(row);
      if (rowDigits && phonesMatchLoosely(digits, rowDigits)) ids.add(row.id);
    }
    return [...ids];
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase.from("whatsapp_chats").select("id, phone, remote_jid");
  if (error) throw error;

  const ids = new Set<string>([chatId]);
  for (const row of data ?? []) {
    if (row.id === chatId) continue;
    const rowDigits = chatPhoneDigits(row as DbChatRow);
    if (rowDigits && phonesMatchLoosely(digits, rowDigits)) ids.add(row.id);
  }
  return [...ids];
}

export const SESSION_MESSAGE_LIMIT = 100;
export const HISTORY_MESSAGE_LIMIT = 400;

export async function getWhatsAppMessageHistoryMeta(
  chatId: string,
  options: {
    since?: string | null;
    history?: boolean;
    fetchedCount: number;
    sessionAt?: string | null;
  },
): Promise<import("@/lib/waba/types").AtendimentoMessagesMeta> {
  const sessionAt = options.sessionAt ?? options.since ?? null;
  const base = {
    hasOlderBeforeSession: false,
    hasMoreInSession: false,
    hasMoreInHistory: false,
    sessionAt,
  };

  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) return base;

  const chatIds = await findChatIdsForMessageHistory(chatId);
  const supabase = await getSupabase();

  if (sessionAt) {
    const { count, error } = await supabase
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .in("chat_id", chatIds)
      .lt("sent_at", sessionAt);
    if (!error) base.hasOlderBeforeSession = (count ?? 0) > 0;
  }

  const displayCutoff = getWhatsAppDisplayMessageCutoff().toISOString();
  const { count: totalCount, error: totalError } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .in("chat_id", chatIds)
    .gte("sent_at", displayCutoff);
  const total = totalError ? options.fetchedCount : (totalCount ?? 0);

  if (!sessionAt && !options.history) {
    base.hasOlderBeforeSession = total > options.fetchedCount;
    base.hasMoreInSession = total > SESSION_MESSAGE_LIMIT;
  }

  if (!options.history && sessionAt) {
    const { count, error } = await supabase
      .from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .in("chat_id", chatIds)
      .gte("sent_at", sessionAt);
    if (!error) {
      base.hasMoreInSession =
        (count ?? 0) > SESSION_MESSAGE_LIMIT || options.fetchedCount >= SESSION_MESSAGE_LIMIT;
    }
  }

  if (options.history) {
    base.hasMoreInHistory =
      total > HISTORY_MESSAGE_LIMIT || options.fetchedCount >= HISTORY_MESSAGE_LIMIT;
  }

  return base;
}

export async function listWhatsAppMessages(
  chatId: string,
  options?: { since?: string | null; history?: boolean; before?: string | null },
) {
  const schemaReady = await isWhatsAppSchemaReady();
  const displayCutoff = getWhatsAppDisplayMessageCutoff();
  const sinceMs = Math.max(
    displayCutoff.getTime(),
    options?.since ? new Date(options.since).getTime() : displayCutoff.getTime(),
  );
  const sinceIso = new Date(sinceMs).toISOString();
  const chatIds = await findChatIdsForMessageHistory(chatId);
  const history = options?.history ?? false;
  const limit = history ? HISTORY_MESSAGE_LIMIT : SESSION_MESSAGE_LIMIT;

  if (!schemaReady) {
    const all = getMemoryState()
      .messages.filter((message) => chatIds.includes(message.chat_id))
      .filter((message) => new Date(message.sent_at).getTime() >= sinceMs)
      .sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
    const sliced = all.slice(-limit);
    return dedupeLocalOutboundMessages(sliced.map(mapMessage));
  }

  const supabase = await getSupabase();
  let query = supabase
    .from("whatsapp_messages")
    .select("*")
    .in("chat_id", chatIds)
    .gte("sent_at", sinceIso);

  if (options?.before) {
    query = query.lt("sent_at", options.before);
  }

  const { data, error } = await query.order("sent_at", { ascending: false }).limit(limit);
  if (error) throw error;
  const rows = ([...(data ?? [])] as DbMessageRow[]).reverse();
  const mapped = dedupeLocalOutboundMessages(rows.map(mapMessage));
  return enrichMessagesWithReplyLookup(chatId, mapped);
}

/** Remove espelho local quando a Evolution ja confirmou a mesma mensagem outbound. */
function dedupeLocalOutboundMessages(messages: WhatsAppMessage[]): WhatsAppMessage[] {
  const realKeys = new Set<string>();
  for (const msg of messages) {
    if (msg.direction !== "outbound" || msg.waMessageId.startsWith("local-")) continue;
    const minute = Math.floor(new Date(msg.sentAt).getTime() / 60_000);
    realKeys.add(`${msg.body?.trim() ?? ""}:${minute}`);
  }
  return messages.filter((msg) => {
    if (msg.direction !== "outbound" || !msg.waMessageId.startsWith("local-")) return true;
    const minute = Math.floor(new Date(msg.sentAt).getTime() / 60_000);
    return !realKeys.has(`${msg.body?.trim() ?? ""}:${minute}`);
  });
}

type ReplyMeta = {
  replyToWaMessageId: string | null;
  replyToText: string | null;
  replyToFromMe: boolean | null;
};

function formatReplyPreviewFromMessageRow(row: {
  body: string | null;
  message_type: string;
  file_name: string | null;
}) {
  return (
    row.body?.trim() ||
    (row.message_type === "document" && row.file_name?.trim() ? row.file_name.trim() : null) ||
    mediaTypeLabel(row.message_type as WhatsAppMessageType)
  );
}

async function loadReplyPreviewsByStanzaIds(chatId: string, stanzaIds: string[]) {
  const uniqueIds = [...new Set(stanzaIds.filter(Boolean))];
  const lookup = new Map<string, { text: string; fromMe: boolean }>();
  if (uniqueIds.length === 0) return lookup;

  const chatIds = await findChatIdsForMessageHistory(chatId);
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("wa_message_id, direction, body, message_type, file_name")
    .in("chat_id", chatIds)
    .in("wa_message_id", uniqueIds);
  if (error) throw error;

  for (const row of data ?? []) {
    lookup.set(row.wa_message_id, {
      text: formatReplyPreviewFromMessageRow(row),
      fromMe: row.direction === "outbound",
    });
  }
  return lookup;
}

async function enrichReplyMetadataFromStanza(chatId: string, reply: ReplyMeta): Promise<ReplyMeta> {
  if (!reply.replyToWaMessageId) return reply;

  const needsText = !reply.replyToText?.trim() || reply.replyToText === "Mensagem";
  const needsFromMe = reply.replyToFromMe == null;
  if (!needsText && !needsFromMe) return reply;

  const previews = await loadReplyPreviewsByStanzaIds(chatId, [reply.replyToWaMessageId]);
  const found = previews.get(reply.replyToWaMessageId);
  if (!found) return reply;

  return {
    replyToWaMessageId: reply.replyToWaMessageId,
    replyToText: needsText ? found.text : reply.replyToText,
    replyToFromMe: needsFromMe ? found.fromMe : reply.replyToFromMe,
  };
}

async function enrichMessagesWithReplyLookup(
  chatId: string,
  messages: WhatsAppMessage[],
): Promise<WhatsAppMessage[]> {
  const stanzaIds = messages
    .filter(
      (msg) =>
        msg.replyToWaMessageId &&
        (!msg.replyToText?.trim() || msg.replyToText === "Mensagem" || msg.replyToFromMe == null),
    )
    .map((msg) => msg.replyToWaMessageId as string);
  if (stanzaIds.length === 0) return messages;

  const previews = await loadReplyPreviewsByStanzaIds(chatId, stanzaIds);
  if (previews.size === 0) return messages;

  return messages.map((msg) => {
    if (!msg.replyToWaMessageId) return msg;
    const found = previews.get(msg.replyToWaMessageId);
    if (!found) return msg;

    const needsText = !msg.replyToText?.trim() || msg.replyToText === "Mensagem";
    const needsFromMe = msg.replyToFromMe == null;
    if (!needsText && !needsFromMe) return msg;

    return {
      ...msg,
      replyToText: needsText ? found.text : msg.replyToText,
      replyToFromMe: needsFromMe ? found.fromMe : msg.replyToFromMe,
    };
  });
}

async function loadExistingReplyByWaMessageId(waMessageId: string): Promise<ReplyMeta | null> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("reply_to_wa_message_id, reply_to_text, reply_to_from_me")
    .eq("wa_message_id", waMessageId)
    .maybeSingle<
      Pick<DbMessageRow, "reply_to_wa_message_id" | "reply_to_text" | "reply_to_from_me">
    >();
  if (error) throw error;
  if (!data?.reply_to_wa_message_id && !data?.reply_to_text?.trim()) return null;
  return {
    replyToWaMessageId: data.reply_to_wa_message_id ?? null,
    replyToText: data.reply_to_text ?? null,
    replyToFromMe: data.reply_to_from_me ?? null,
  };
}

async function findPendingLocalOutboundWithReply(
  chatId: string,
  body: string | null | undefined,
  sentAt: string,
): Promise<{ id: string; reply: ReplyMeta } | null> {
  const bodyNorm = body?.trim();
  if (!bodyNorm) return null;

  const sentMs = new Date(sentAt).getTime();
  const windowMs = 3 * 60 * 1000;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id, body, reply_to_wa_message_id, reply_to_text, reply_to_from_me, sent_at")
    .eq("chat_id", chatId)
    .eq("direction", "outbound")
    .like("wa_message_id", "local-%")
    .gte("sent_at", new Date(sentMs - windowMs).toISOString())
    .lte("sent_at", new Date(sentMs + windowMs).toISOString())
    .order("sent_at", { ascending: false });
  if (error) throw error;

  for (const row of data ?? []) {
    if (row.body?.trim() === bodyNorm && row.reply_to_text?.trim()) {
      return {
        id: row.id,
        reply: {
          replyToWaMessageId: row.reply_to_wa_message_id ?? null,
          replyToText: row.reply_to_text,
          replyToFromMe: row.reply_to_from_me ?? null,
        },
      };
    }
  }
  return null;
}

async function deleteLocalOutboundMirrors(
  chatId: string,
  body: string | null | undefined,
  sentAt: string,
) {
  const bodyNorm = body?.trim();
  if (!bodyNorm) return;

  const sentMs = new Date(sentAt).getTime();
  const windowMs = 3 * 60 * 1000;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id, body")
    .eq("chat_id", chatId)
    .eq("direction", "outbound")
    .like("wa_message_id", "local-%")
    .gte("sent_at", new Date(sentMs - windowMs).toISOString())
    .lte("sent_at", new Date(sentMs + windowMs).toISOString());
  if (error) throw error;

  for (const row of data ?? []) {
    if (row.body?.trim() !== bodyNorm) continue;
    await deleteWhatsAppMessageRow(row.id);
  }
}

async function deleteWhatsAppMessageRow(messageId: string) {
  const supabase = await getSupabase();
  const { error } = await supabase.from("whatsapp_messages").delete().eq("id", messageId);
  if (error) throw error;
}

export async function countWhatsAppInboundMessages(chatId: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    return getMemoryState().messages.filter(
      (message) => message.chat_id === chatId && message.direction === "inbound",
    ).length;
  }

  const supabase = await getSupabase();
  const { count, error } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId)
    .eq("direction", "inbound");
  if (error) throw error;
  return count ?? 0;
}

export async function getWhatsAppMessageRow(messageId: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    return getMemoryState().messages.find((item) => item.id === messageId) ?? null;
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle<DbMessageRow>();
  if (error) throw error;
  return data ?? null;
}

export async function updateWhatsAppMessageStatusByWaId(waMessageId: string, status: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const state = getMemoryState();
    const row = state.messages.find((item) => item.wa_message_id === waMessageId);
    if (!row) return null;
    row.status = status;
    return mapMessage(row);
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .update({ status })
    .eq("wa_message_id", waMessageId)
    .select("*")
    .maybeSingle<DbMessageRow>();
  if (error) throw error;
  return data ? mapMessage(data) : null;
}

export async function updateWhatsAppMessageMediaUrl(messageId: string, mediaUrl: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const message = getMemoryState().messages.find((item) => item.id === messageId);
    if (message) message.media_url = mediaUrl;
    return;
  }

  const supabase = await getSupabase();
  await supabase.from("whatsapp_messages").update({ media_url: mediaUrl }).eq("id", messageId);
}

export async function markChatAsRead(chatId: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const chat = getMemoryState().chats.find((item) => item.id === chatId);
    if (chat) chat.unread_count = 0;
    return;
  }
  const supabase = await getSupabase();
  await supabase
    .from("whatsapp_chats")
    .update({ unread_count: 0, updated_at: nowIso() })
    .eq("id", chatId);
}

export async function upsertWhatsAppChat(input: {
  remoteJid: string;
  name?: string | null;
  phone?: string | null;
  profilePicUrl?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadDelta?: number;
  isGroup?: boolean;
  firstContactAt?: string | null;
  mirrorName?: boolean;
}) {
  const rawPhone = input.phone ?? jidToPhone(input.remoteJid);
  const phone =
    sanitizeRealPhone(rawPhone, input.remoteJid.endsWith("@lid") ? input.remoteJid : null) ??
    rawPhone;
  const schemaReady = await isWhatsAppSchemaReady();
  const owner = await getInstanceOwner();

  const resolveName = (existing?: string | null) => {
    if (input.mirrorName && input.name) return input.name;
    return pickChatDisplayName({
      existing,
      incoming: input.name,
      phone,
      owner,
    });
  };

  if (!schemaReady) {
    const state = getMemoryState();
    let chat = state.chats.find((item) => item.remote_jid === input.remoteJid);
    const phoneDigits = phone ? normalizeWhatsAppPhone(phone) : null;
    if (!chat && phoneDigits) {
      chat =
        state.chats.find((item) => {
          const digits = chatPhoneDigits(item);
          return Boolean(digits && phonesMatchLoosely(digits, phoneDigits));
        }) ?? undefined;
    }

    const remoteJid =
      pickPhoneJidForChat(canonicalPhone, input.remoteJid, chat?.remote_jid) ??
      (input.remoteJid.endsWith("@s.whatsapp.net")
        ? input.remoteJid
        : chat?.remote_jid.endsWith("@s.whatsapp.net")
          ? chat.remote_jid
          : input.remoteJid);
    const canonicalPhone = phoneDigits
      ? formatWhatsAppPhone(canonicalBrazilWhatsAppDigits(phoneDigits) || phoneDigits)
      : phone;

    if (!chat) {
      chat = {
        id: createId("chat"),
        remote_jid: remoteJid,
        phone: canonicalPhone,
        name: resolveName() ?? canonicalPhone,
        profile_pic_url: input.profilePicUrl ?? null,
        last_message: input.lastMessage ?? null,
        last_message_at: input.lastMessageAt ?? nowIso(),
        unread_count: 0,
        cliente_id: null,
        is_group: input.isGroup ?? false,
        created_at: nowIso(),
        first_contact_at: input.firstContactAt ?? input.lastMessageAt ?? nowIso(),
        updated_at: nowIso(),
      };
      state.chats.unshift(chat);
    } else {
      chat.remote_jid = remoteJid;
      if (canonicalPhone) chat.phone = canonicalPhone;
      if (input.name) {
        chat.name = resolveName(chat.name) ?? chat.name;
      }
      if (input.profilePicUrl) chat.profile_pic_url = input.profilePicUrl;
      if (input.lastMessage) chat.last_message = input.lastMessage;
      if (input.lastMessageAt) chat.last_message_at = input.lastMessageAt;
      if (input.unreadDelta) chat.unread_count += input.unreadDelta;
      chat.updated_at = nowIso();
      for (const message of state.messages) {
        if (message.chat_id === chat.id) message.remote_jid = remoteJid;
      }
    }
    return mapChat(chat);
  }

  const supabase = await getSupabase();
  const clienteId = phone ? await resolveClienteIdByPhone(phone) : null;
  const { data: existing, error: existingError } = await supabase
    .from("whatsapp_chats")
    .select("*")
    .eq("remote_jid", input.remoteJid)
    .maybeSingle<DbChatRow>();
  if (existingError) throw existingError;

  const phoneDigits = phone ? normalizeWhatsAppPhone(phone) : null;
  const similar = !existing && phoneDigits ? await findSimilarChatRowByDigits(phoneDigits) : null;

  const mergeTarget = existing ?? similar;
  const canonicalPhone =
    phoneDigits && looksLikeWhatsAppPhoneDigits(phoneDigits)
      ? formatWhatsAppPhone(canonicalBrazilWhatsAppDigits(phoneDigits) || phoneDigits)
      : sanitizeRealPhone(phone, input.remoteJid.endsWith("@lid") ? input.remoteJid : null);

  const remoteJid =
    pickPhoneJidForChat(canonicalPhone, input.remoteJid, mergeTarget?.remote_jid) ??
    (input.remoteJid.endsWith("@s.whatsapp.net")
      ? input.remoteJid
      : mergeTarget?.remote_jid.endsWith("@s.whatsapp.net")
        ? mergeTarget.remote_jid
        : input.remoteJid);

  const preview = pickNewerChatPreview(mergeTarget, input.lastMessage, input.lastMessageAt);

  const openedAt =
    input.firstContactAt ?? input.lastMessageAt ?? mergeTarget?.attendance_opened_at ?? nowIso();

  const payload = {
    remote_jid: remoteJid,
    phone: canonicalPhone,
    name: resolveName(mergeTarget?.name),
    profile_pic_url: input.profilePicUrl ?? mergeTarget?.profile_pic_url ?? null,
    last_message: preview.last_message,
    last_message_at: preview.last_message_at,
    unread_count: Math.max(0, (mergeTarget?.unread_count ?? 0) + (input.unreadDelta ?? 0)),
    cliente_id: clienteId ?? mergeTarget?.cliente_id ?? null,
    is_group: input.isGroup ?? mergeTarget?.is_group ?? false,
    first_contact_at:
      mergeTarget?.first_contact_at ??
      input.firstContactAt ??
      input.lastMessageAt ??
      mergeTarget?.last_message_at ??
      nowIso(),
    attendance_opened_at: mergeTarget?.attendance_opened_at ?? openedAt,
    updated_at: nowIso(),
  };

  const { data, error } = mergeTarget
    ? await supabase
        .from("whatsapp_chats")
        .update({ ...payload })
        .eq("id", mergeTarget.id)
        .select("*")
        .single<DbChatRow>()
    : await supabase.from("whatsapp_chats").insert(payload).select("*").single<DbChatRow>();
  if (error) throw error;

  if (similar && !existing && similar.remote_jid !== remoteJid) {
    await supabase
      .from("whatsapp_messages")
      .update({ remote_jid: remoteJid })
      .eq("chat_id", similar.id);
  }

  return mapChat(data);
}

function pickNewerChatPreview(
  existing: Pick<DbChatRow, "last_message" | "last_message_at"> | null | undefined,
  incomingMessage: string | null | undefined,
  incomingAt: string | null | undefined,
) {
  const incomingAtValue = incomingAt ?? "";
  const existingAtValue = existing?.last_message_at ?? "";
  if (
    incomingAtValue &&
    (!existingAtValue || incomingAtValue.localeCompare(existingAtValue) >= 0)
  ) {
    return {
      last_message: incomingMessage ?? existing?.last_message ?? null,
      last_message_at: incomingAtValue,
    };
  }
  return {
    last_message: existing?.last_message ?? incomingMessage ?? null,
    last_message_at: existingAtValue || incomingAtValue || nowIso(),
  };
}

/** Corrige preview quando mensagens no banco sao mais recentes que o chat. */
async function syncChatPreviewsFromMessages(chats: DbChatRow[], maxChats = 20) {
  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady || chats.length === 0) return chats;

  const supabase = await getSupabase();
  const updated = [...chats];
  const slice = updated.slice(0, maxChats);

  for (let index = 0; index < slice.length; index += 1) {
    const chat = slice[index];
    if (!chat) continue;

    const { data: latest, error } = await supabase
      .from("whatsapp_messages")
      .select("body, message_type, sent_at")
      .eq("chat_id", chat.id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !latest?.sent_at) continue;

    const latestAt = String(latest.sent_at);
    const currentAt = String(chat.last_message_at ?? "");
    if (latestAt.localeCompare(currentAt) <= 0) continue;

    const preview = formatMessagePreview(latest.message_type as WhatsAppMessageType, latest.body);
    updated[index] = { ...chat, last_message: preview, last_message_at: latestAt };
    await supabase
      .from("whatsapp_chats")
      .update({ last_message: preview, last_message_at: latestAt, updated_at: nowIso() })
      .eq("id", chat.id);
  }

  return updated;
}

function schedulePreviewSync(chats: DbChatRow[]) {
  void syncChatPreviewsFromMessages(chats, 15).catch((error) => {
    console.error("[syncChatPreviewsFromMessages]", error);
  });
}

export async function touchWhatsAppChatPreview(
  chatId: string,
  input: {
    lastMessage?: string | null;
    lastMessageAt?: string | null;
    unreadDelta?: number;
    name?: string | null;
    phone?: string | null;
  },
) {
  const schemaReady = await isWhatsAppSchemaReady();
  const chat = await getWhatsAppChatById(chatId);
  if (!chat) return null;

  const preview = pickNewerChatPreview(chat, input.lastMessage, input.lastMessageAt);

  if (!schemaReady) {
    const row = getMemoryState().chats.find((item) => item.id === chatId);
    if (!row) return null;
    row.last_message = preview.last_message;
    row.last_message_at = preview.last_message_at;
    if (input.unreadDelta) row.unread_count += input.unreadDelta;
    if (input.name) row.name = input.name;
    if (input.phone) row.phone = input.phone;
    row.updated_at = nowIso();
    return mapChat(row);
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .update({
      last_message: preview.last_message,
      last_message_at: preview.last_message_at,
      unread_count: Math.max(0, (chat.unread_count ?? 0) + (input.unreadDelta ?? 0)),
      name: input.name ?? chat.name,
      phone: input.phone ?? chat.phone,
      updated_at: nowIso(),
    })
    .eq("id", chatId)
    .select("*")
    .single<DbChatRow>();
  if (error) throw error;
  return mapChat(data);
}

export async function mergeChatIfPhoneKnown(
  sourceChatId: string,
  phoneJid: string | null | undefined,
) {
  if (!phoneJid?.endsWith("@s.whatsapp.net")) return sourceChatId;

  const digits = normalizeWhatsAppPhone(phoneJid.split("@")[0] ?? "");
  if (!digits) return sourceChatId;

  const target = await findWhatsAppChatByPhoneDigits(digits);
  if (!target || target.id === sourceChatId) return sourceChatId;

  const remoteJid = target.remoteJid.endsWith("@s.whatsapp.net") ? target.remoteJid : phoneJid;
  await consolidateChatsIntoTarget(sourceChatId, target.id, remoteJid);
  return target.id;
}

/** Une chat @lid sem nome ao contato certo via agenda Evolution / waba. */
export async function reconcileOrphanLidChat(
  chatId: string,
  _sourceLidJid: string,
  options: {
    allowEvolutionLookup?: boolean;
    pool?: DbChatRow[];
    namedHintChats?: DbChatRow[];
  } = {},
) {
  const chat = await getWhatsAppChatById(chatId);
  if (!chat || !isOrphanLidChat(chat)) return chatId;

  const match = await findMergeTargetForOrphanLid(chat, {
    allowEvolutionLookup: options.allowEvolutionLookup ?? true,
    pool: options.pool,
    namedHintChats: options.namedHintChats,
  });
  if (!match) return chatId;

  const { target, phoneJid, resolvedName } = match;
  const pushName = resolvedName ?? (stripEmoji(chat.name ?? "").trim() || null);

  const remoteJid = target.remote_jid.endsWith("@s.whatsapp.net")
    ? target.remote_jid
    : (phoneJid ?? target.remote_jid);
  await consolidateChatsIntoTarget(chatId, target.id, remoteJid);

  const { ensureWabaContactFromMessage } = await import("@/lib/waba/waba.server");
  const merged = await getWhatsAppChatById(target.id);
  if (merged?.phone) {
    await ensureWabaContactFromMessage({
      phone: merged.phone,
      name: merged.name ?? pushName,
    });
  }

  return target.id;
}

export async function insertWhatsAppMessage(input: {
  chatId?: string;
  remoteJid: string;
  waMessageId: string;
  direction: "inbound" | "outbound";
  messageType: WhatsAppMessageType;
  body?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  fileName?: string | null;
  status?: string;
  sentAt?: string;
  replyToWaMessageId?: string | null;
  replyToText?: string | null;
  replyToFromMe?: boolean | null;
}) {
  let chatId = input.chatId;
  let remoteJid = input.remoteJid;

  if (chatId) {
    const schemaReady = await isWhatsAppSchemaReady();
    if (!schemaReady) {
      const row = getMemoryState().chats.find((item) => item.id === chatId);
      if (!row) throw new Error("Conversa nao encontrada.");
      remoteJid = row.remote_jid;
    } else {
      const supabase = await getSupabase();
      const { data: row, error } = await supabase
        .from("whatsapp_chats")
        .select("id, remote_jid")
        .eq("id", chatId)
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Conversa nao encontrada.");
      remoteJid = row.remote_jid;
    }
  } else {
    const chat = await upsertWhatsAppChat({ remoteJid: input.remoteJid });
    chatId = chat.id;
  }

  const schemaReady = await isWhatsAppSchemaReady();
  const sentAt = input.sentAt ?? nowIso();
  let replyToWaMessageId = input.replyToWaMessageId ?? null;
  let replyToText = input.replyToText ?? null;
  let replyToFromMe = input.replyToFromMe ?? null;
  let pendingLocalId: string | null = null;

  if (schemaReady && (!replyToWaMessageId || !replyToText?.trim())) {
    const existingReply = await loadExistingReplyByWaMessageId(input.waMessageId);
    if (existingReply) {
      replyToWaMessageId = replyToWaMessageId ?? existingReply.replyToWaMessageId;
      replyToText = replyToText?.trim() ? replyToText : existingReply.replyToText;
      replyToFromMe = replyToFromMe ?? existingReply.replyToFromMe;
    }
  }

  if (
    schemaReady &&
    chatId &&
    input.direction === "outbound" &&
    !input.waMessageId.startsWith("local-") &&
    !replyToText?.trim()
  ) {
    const pending = await findPendingLocalOutboundWithReply(chatId, input.body, sentAt);
    if (pending) {
      replyToWaMessageId = pending.reply.replyToWaMessageId;
      replyToText = pending.reply.replyToText;
      replyToFromMe = pending.reply.replyToFromMe;
      pendingLocalId = pending.id;
    }
  }

  if (schemaReady && chatId && replyToWaMessageId) {
    const enriched = await enrichReplyMetadataFromStanza(chatId, {
      replyToWaMessageId,
      replyToText,
      replyToFromMe,
    });
    replyToWaMessageId = enriched.replyToWaMessageId;
    replyToText = enriched.replyToText;
    replyToFromMe = enriched.replyToFromMe;
  }

  const payload: DbMessageRow = {
    id: createId("msg"),
    chat_id: chatId,
    remote_jid: remoteJid,
    wa_message_id: input.waMessageId,
    direction: input.direction,
    message_type: input.messageType,
    body: input.body ?? null,
    media_url: input.mediaUrl ?? null,
    media_mime: input.mediaMime ?? null,
    file_name: input.fileName ?? null,
    status: input.status ?? "sent",
    sent_at: sentAt,
    created_at: nowIso(),
    reply_to_wa_message_id: replyToWaMessageId,
    reply_to_text: replyToText,
    reply_to_from_me: replyToFromMe,
  };

  if (!schemaReady) {
    const state = getMemoryState();
    const duplicate = state.messages.some((message) => message.wa_message_id === input.waMessageId);
    if (!duplicate) state.messages.push(payload);
    const chatRow = state.chats.find((item) => item.id === chatId);
    if (chatRow) {
      chatRow.last_message = formatMessagePreview(input.messageType, input.body ?? null);
      chatRow.last_message_at = payload.sent_at;
      if (input.direction === "inbound") chatRow.unread_count += 1;
    }
    return mapMessage(payload);
  }

  const supabase = await getSupabase();

  let body = input.body ?? null;
  let messageType = input.messageType;
  let mediaUrl = input.mediaUrl ?? null;
  let mediaMime = input.mediaMime ?? null;
  let fileName = input.fileName ?? null;

  if (
    !body?.trim() &&
    !mediaUrl &&
    !input.waMessageId.startsWith("local-")
  ) {
    const { data: existing } = await supabase
      .from("whatsapp_messages")
      .select("body, message_type, media_url, media_mime, file_name")
      .eq("wa_message_id", input.waMessageId)
      .maybeSingle<DbMessageRow>();
    if (existing) {
      if (existing.body?.trim()) body = existing.body;
      if (!mediaUrl && existing.media_url) mediaUrl = existing.media_url;
      if (!mediaMime && existing.media_mime) mediaMime = existing.media_mime;
      if (!fileName && existing.file_name) fileName = existing.file_name;
      if (messageType === "text" && existing.message_type !== "text") {
        messageType = existing.message_type as WhatsAppMessageType;
      }
    }
  }

  const baseRow = {
    chat_id: chatId,
    remote_jid: remoteJid,
    wa_message_id: input.waMessageId,
    direction: input.direction,
    message_type: messageType,
    body,
    media_url: mediaUrl,
    media_mime: mediaMime,
    file_name: fileName,
    status: input.status ?? "sent",
    sent_at: sentAt,
  };
  const withReply = {
    ...baseRow,
    reply_to_wa_message_id: replyToWaMessageId,
    reply_to_text: replyToText,
    reply_to_from_me: replyToFromMe,
  };

  let data: DbMessageRow | null = null;
  let error: { message: string } | null = null;
  ({ data, error } = await supabase
    .from("whatsapp_messages")
    .upsert(withReply, { onConflict: "wa_message_id" })
    .select("*")
    .single<DbMessageRow>());

  if (error && /reply_to_|does not exist|schema cache|PGRST20/i.test(error.message)) {
    ({ data, error } = await supabase
      .from("whatsapp_messages")
      .upsert(baseRow, { onConflict: "wa_message_id" })
      .select("*")
      .single<DbMessageRow>());
  }
  if (error) throw error;
  if (!data) throw new Error("Falha ao salvar mensagem.");

  if (pendingLocalId && pendingLocalId !== data.id) {
    try {
      await deleteWhatsAppMessageRow(pendingLocalId);
    } catch (deleteError) {
      console.error("[insertWhatsAppMessage] cleanup local mirror", pendingLocalId, deleteError);
    }
  }

  if (
    schemaReady &&
    chatId &&
    input.direction === "outbound" &&
    !input.waMessageId.startsWith("local-")
  ) {
    try {
      await deleteLocalOutboundMirrors(chatId, input.body, sentAt);
    } catch (deleteError) {
      console.error("[insertWhatsAppMessage] cleanup local outbound mirrors", chatId, deleteError);
    }
  }

  if (chatId) {
    await touchWhatsAppChatPreview(chatId, {
      lastMessage: formatMessagePreview(messageType, body ?? null),
      lastMessageAt: payload.sent_at,
      unreadDelta: input.direction === "inbound" ? 1 : 0,
    });
  } else {
    await upsertWhatsAppChat({
      remoteJid,
      lastMessage: formatMessagePreview(messageType, body ?? null),
      lastMessageAt: payload.sent_at,
      unreadDelta: input.direction === "inbound" ? 1 : 0,
    });
  }

  return mapMessage(data);
}

async function resolveClienteIdByPhone(phone: string) {
  try {
    const digits = normalizeWhatsAppPhone(phone);
    if (!digits || digits.length < 10) return null;
    const map = await loadClientePhoneMap();
    return map.get(digits) ?? null;
  } catch {
    return null;
  }
}

export async function enrichWhatsAppContactProfile(remoteJid: string) {
  const profile = await getWhatsAppContactProfile(remoteJid);
  try {
    const { resolveRealPhoneJid, getInstanceOwner, isOwnerJid } =
      await import("@/lib/api/atendimento/whatsapp-identity.server");
    const owner = await getInstanceOwner();
    const resolved = await resolveRealPhoneJid({
      remoteJid: profile.remoteJid,
      phone: profile.phone,
    });

    if (isOwnerJid(resolved.remoteJid, owner)) {
      return profile;
    }

    return {
      ...profile,
      phone: resolved.phone ?? profile.phone,
      name: profile.clienteNome ?? profile.name,
    };
  } catch {
    return profile;
  }
}

export async function getWhatsAppContactProfile(remoteJid: string) {
  const schemaReady = await isWhatsAppSchemaReady();
  let chat: DbChatRow | undefined;

  if (!schemaReady) {
    chat = getMemoryState().chats.find((item) => item.remote_jid === remoteJid);
  } else {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("whatsapp_chats")
      .select("*")
      .eq("remote_jid", remoteJid)
      .maybeSingle<DbChatRow>();
    chat = data ?? undefined;
  }

  let clienteNome: string | null = null;
  let clientePontos: number | null = null;
  if (chat?.cliente_id) {
    try {
      const supabase = await getSupabase();
      const { data } = await supabase
        .from("profiles")
        .select("nome, pontos_fidelidade")
        .eq("id", chat.cliente_id)
        .maybeSingle();
      clienteNome = data?.nome ?? null;
      clientePontos = data?.pontos_fidelidade ?? null;
    } catch {
      // ignore
    }
  }

  return {
    remoteJid,
    phone: chat?.phone ?? jidToPhone(remoteJid),
    name: clienteNome ?? chat?.name ?? null,
    profilePicUrl: chat?.profile_pic_url ?? null,
    clienteId: chat?.cliente_id ?? null,
    clienteNome,
    clientePontos,
  };
}

export function activateDemoWhatsApp() {
  memoryState = seedDemoState();
  return memoryState.config;
}

export async function setWhatsAppStatus(
  status: WhatsAppConnectionStatus,
  patch: Partial<DbConfigRow> = {},
) {
  return writeWhatsAppConfig({ status, ...patch });
}

export { extractPhoneJidFromMessageKey, pickMessageRemoteJid } from "@/lib/atendimento/whatsapp";

function unwrapEvolutionMessageContent(message: Record<string, unknown>): Record<string, unknown> {
  for (const field of [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "documentWithCaptionMessage",
  ]) {
    const wrapper = message[field];
    if (!wrapper || typeof wrapper !== "object") continue;
    const nested = (wrapper as Record<string, unknown>).message;
    if (nested && typeof nested === "object") {
      return unwrapEvolutionMessageContent(nested as Record<string, unknown>);
    }
  }
  return message;
}

function parseQuotedContextInfo(contextInfo: Record<string, unknown>) {
  const stanzaId = String(contextInfo.stanzaId ?? "").trim();
  if (!stanzaId) return null;

  const quotedMessage = contextInfo.quotedMessage;
  let replyToText: string | null = null;
  if (quotedMessage && typeof quotedMessage === "object") {
    const quoted = quotedMessage as Record<string, unknown>;
    if (typeof quoted.conversation === "string") {
      replyToText = quoted.conversation;
    } else if (quoted.extendedTextMessage && typeof quoted.extendedTextMessage === "object") {
      replyToText = String((quoted.extendedTextMessage as Record<string, unknown>).text ?? "");
    } else if (quoted.imageMessage) {
      replyToText = "Imagem";
    } else if (quoted.videoMessage) {
      replyToText = "Video";
    } else if (quoted.audioMessage) {
      replyToText = "Audio";
    } else if (quoted.documentMessage) {
      replyToText = "Documento";
    } else if (quoted.stickerMessage) {
      replyToText = "Imagem";
    } else if (quoted.locationMessage) {
      replyToText = "Localizacao";
    }
  }

  return {
    replyToWaMessageId: stanzaId,
    replyToText: replyToText?.trim() || null,
    replyToFromMe: null,
  };
}

function extractQuotedFromMessageContent(message: Record<string, unknown>) {
  if (message.contextInfo && typeof message.contextInfo === "object") {
    const parsed = parseQuotedContextInfo(message.contextInfo as Record<string, unknown>);
    if (parsed) return parsed;
  }

  const sources = [
    message.extendedTextMessage,
    message.imageMessage,
    message.videoMessage,
    message.audioMessage,
    message.documentMessage,
    message.stickerMessage,
    message.locationMessage,
  ];

  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const contextInfo = (source as Record<string, unknown>).contextInfo;
    if (!contextInfo || typeof contextInfo !== "object") continue;
    const parsed = parseQuotedContextInfo(contextInfo as Record<string, unknown>);
    if (parsed) return parsed;
  }

  return null;
}

export function parseEvolutionMessage(data: Record<string, unknown>) {
  const key = (data.key ?? {}) as Record<string, unknown>;
  const message = unwrapEvolutionMessageContent((data.message ?? {}) as Record<string, unknown>);
  const primaryJid = String(key.remoteJid ?? "");
  const phoneJid = extractPhoneJidFromMessageKey(key);
  const remoteJidAlt =
    primaryJid.endsWith("@lid") && phoneJid?.endsWith("@s.whatsapp.net") ? phoneJid : null;
  const remoteJid = pickMessageRemoteJid(key);
  const waMessageId = String(key.id ?? createId("wa"));
  const fromMe = Boolean(key.fromMe);
  const pushName = typeof data.pushName === "string" ? data.pushName : null;
  const timestamp = Number(data.messageTimestamp ?? Date.now() / 1000);
  const topLevelType = String(data.messageType ?? "").toLowerCase();
  const quoted =
    extractQuotedFromMessageContent(message) ??
    (data.contextInfo && typeof data.contextInfo === "object"
      ? parseQuotedContextInfo(data.contextInfo as Record<string, unknown>)
      : null);

  let messageType: WhatsAppMessageType = "text";
  let body: string | null = null;
  let mediaUrl: string | null = null;
  let mediaMime: string | null = null;
  let fileName: string | null = null;

  if (typeof message.conversation === "string") {
    body = message.conversation;
  } else if (message.extendedTextMessage && typeof message.extendedTextMessage === "object") {
    body = String((message.extendedTextMessage as Record<string, unknown>).text ?? "");
  } else if (message.imageMessage && typeof message.imageMessage === "object") {
    messageType = "image";
    const image = message.imageMessage as Record<string, unknown>;
    body = String(image.caption ?? "");
    mediaUrl = typeof image.url === "string" ? image.url : null;
    mediaMime = String(image.mimetype ?? "image/jpeg");
    fileName = "imagem.jpg";
  } else if (message.audioMessage && typeof message.audioMessage === "object") {
    messageType = "audio";
    const audio = message.audioMessage as Record<string, unknown>;
    mediaUrl = typeof audio.url === "string" ? audio.url : null;
    mediaMime = String(audio.mimetype ?? "audio/ogg");
    fileName = "audio.ogg";
  } else if (message.documentMessage && typeof message.documentMessage === "object") {
    messageType = "document";
    const doc = message.documentMessage as Record<string, unknown>;
    body = String(doc.caption ?? "");
    mediaUrl = typeof doc.url === "string" ? doc.url : null;
    mediaMime = String(doc.mimetype ?? "application/octet-stream");
    fileName = String(doc.fileName ?? "arquivo");
  } else if (message.videoMessage && typeof message.videoMessage === "object") {
    messageType = "video";
    const video = message.videoMessage as Record<string, unknown>;
    body = String(video.caption ?? "");
    mediaUrl = typeof video.url === "string" ? video.url : null;
    mediaMime = String(video.mimetype ?? "video/mp4");
    fileName = "video.mp4";
  } else if (message.stickerMessage && typeof message.stickerMessage === "object") {
    messageType = "image";
    const sticker = message.stickerMessage as Record<string, unknown>;
    mediaUrl = typeof sticker.url === "string" ? sticker.url : null;
    mediaMime = String(sticker.mimetype ?? "image/webp");
    fileName = "sticker.webp";
  } else if (message.ptvMessage && typeof message.ptvMessage === "object") {
    messageType = "video";
    const ptv = message.ptvMessage as Record<string, unknown>;
    mediaUrl = typeof ptv.url === "string" ? ptv.url : null;
    mediaMime = String(ptv.mimetype ?? "video/mp4");
    fileName = "video.mp4";
  } else if (topLevelType.includes("audio")) {
    messageType = "audio";
    fileName = "audio.ogg";
    mediaMime = "audio/ogg";
  } else if (topLevelType.includes("image") || topLevelType.includes("sticker")) {
    messageType = "image";
    fileName = topLevelType.includes("sticker") ? "sticker.webp" : "imagem.jpg";
    mediaMime = topLevelType.includes("sticker") ? "image/webp" : "image/jpeg";
  } else if (topLevelType.includes("video")) {
    messageType = "video";
    fileName = "video.mp4";
  } else if (topLevelType.includes("document")) {
    messageType = "document";
    fileName = "arquivo";
  }

  return {
    remoteJid,
    primaryJid,
    remoteJidAlt,
    waMessageId,
    direction: fromMe ? ("outbound" as const) : ("inbound" as const),
    messageType,
    body,
    mediaUrl,
    mediaMime,
    fileName,
    pushName,
    sentAt: new Date(timestamp * 1000).toISOString(),
    replyToWaMessageId: quoted?.replyToWaMessageId ?? null,
    replyToText: quoted?.replyToText ?? null,
    replyToFromMe: quoted?.replyToFromMe ?? null,
  };
}

export function parseEvolutionChat(data: Record<string, unknown>) {
  const remoteJid = String(data.remoteJid ?? data.id ?? "");
  const name =
    typeof data.name === "string"
      ? data.name
      : typeof data.pushName === "string"
        ? data.pushName
        : null;
  const profilePicUrl =
    typeof data.profilePicUrl === "string"
      ? data.profilePicUrl
      : typeof data.profilePictureUrl === "string"
        ? data.profilePictureUrl
        : null;
  const lastMessage =
    typeof data.lastMessage === "string"
      ? data.lastMessage
      : typeof (data as { lastMessage?: { message?: string } }).lastMessage?.message === "string"
        ? ((data as { lastMessage?: { message?: string } }).lastMessage?.message ?? null)
        : null;
  const updatedAt = data.updatedAt ?? data.conversationTimestamp;
  const lastMessageAt =
    typeof updatedAt === "number"
      ? new Date(updatedAt * 1000).toISOString()
      : typeof updatedAt === "string"
        ? updatedAt
        : nowIso();

  return {
    remoteJid,
    name,
    phone: jidToPhone(remoteJid),
    profilePicUrl,
    lastMessage,
    lastMessageAt,
    isGroup: remoteJid.endsWith("@g.us"),
  };
}

export const parseWhatsAppWebMessage = parseEvolutionMessage;
export const parseWhatsAppWebChat = parseEvolutionChat;

type ChatUpsertInput = {
  remoteJid: string;
  name?: string | null;
  phone?: string | null;
  profilePicUrl?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadDelta?: number;
  isGroup?: boolean;
  firstContactAt?: string | null;
  /** Importacao da agenda: nao altera ultima mensagem nem coloca timestamp falso. */
  agendaImport?: boolean;
  /** Espelho findChats: sobrescreve nome com o da Evolution (WhatsApp Web). */
  mirrorName?: boolean;
};

async function loadClientePhoneMap() {
  const map = new Map<string, string>();
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, telefone")
      .not("telefone", "is", null);
    if (error) return map;
    for (const profile of data ?? []) {
      const digits = normalizeWhatsAppPhone(profile.telefone ?? "");
      if (digits) map.set(digits, profile.id);
    }
  } catch {
    // ignore
  }
  return map;
}

export async function bulkUpsertWhatsAppChats(inputs: ChatUpsertInput[]) {
  if (inputs.length === 0) return;

  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    for (const input of inputs) {
      await upsertWhatsAppChat(input);
    }
    return;
  }

  const supabase = await getSupabase();
  const clienteMap = await loadClientePhoneMap();
  const owner = await getInstanceOwner();
  const remoteJids = inputs.map((input) => input.remoteJid);
  const { data: existingRows, error: existingError } = await supabase
    .from("whatsapp_chats")
    .select(
      "remote_jid, unread_count, name, profile_pic_url, last_message, last_message_at, cliente_id, first_contact_at",
    )
    .in("remote_jid", remoteJids);
  if (existingError) throw existingError;

  const existingMap = new Map((existingRows ?? []).map((row) => [row.remote_jid, row]));
  const rows = inputs.map((input) => {
    const phone = input.phone ?? jidToPhone(input.remoteJid);
    const existing = existingMap.get(input.remoteJid);
    const digits = phone ? normalizeWhatsAppPhone(phone) : "";
    const clienteId = digits
      ? (clienteMap.get(digits) ?? existing?.cliente_id ?? null)
      : (existing?.cliente_id ?? null);
    return {
      remote_jid: input.remoteJid,
      phone,
      name:
        input.mirrorName && input.name
          ? input.name
          : pickChatDisplayName({
              existing: existing?.name,
              incoming: input.name,
              phone,
              owner,
            }),
      profile_pic_url: input.profilePicUrl ?? existing?.profile_pic_url ?? null,
      last_message: input.agendaImport
        ? (existing?.last_message ?? null)
        : (input.lastMessage ?? existing?.last_message ?? null),
      last_message_at: input.agendaImport
        ? (existing?.last_message_at ?? null)
        : (input.lastMessageAt ?? existing?.last_message_at ?? nowIso()),
      unread_count: Math.max(0, (existing?.unread_count ?? 0) + (input.unreadDelta ?? 0)),
      cliente_id: clienteId,
      is_group: input.isGroup ?? false,
      first_contact_at: input.agendaImport
        ? (existing?.first_contact_at ?? null)
        : (existing?.first_contact_at ??
          input.firstContactAt ??
          input.lastMessageAt ??
          existing?.last_message_at ??
          nowIso()),
      updated_at: nowIso(),
    };
  });

  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    const { error } = await supabase
      .from("whatsapp_chats")
      .upsert(chunk, { onConflict: "remote_jid" });
    if (error) throw error;
  }
}

export async function deleteWhatsAppChatsByRemoteJids(remoteJids: string[]) {
  const unique = [...new Set(remoteJids.filter(Boolean))];
  if (unique.length === 0) return;

  const schemaReady = await isWhatsAppSchemaReady();
  if (!schemaReady) {
    const state = getMemoryState();
    state.chats = state.chats.filter((chat) => !unique.includes(chat.remote_jid));
    state.messages = state.messages.filter((message) => !unique.includes(message.remote_jid));
    return;
  }

  const supabase = await getSupabase();
  const { error } = await supabase.from("whatsapp_chats").delete().in("remote_jid", unique);
  if (error) throw error;
}

export async function cleanupExpiredWhatsAppData() {
  const schemaReady = await isWhatsAppSchemaReady();
  const cutoff = whatsappRetentionCutoff().toISOString();

  if (!schemaReady) {
    const state = getMemoryState();
    state.messages = state.messages.filter((message) => message.sent_at >= cutoff);
    state.chats = state.chats.filter(chatWithinRetention);
    return { messagesRemoved: 0, chatsRemoved: 0 };
  }

  const supabase = await getSupabase();
  await supabase.from("whatsapp_messages").delete().lt("sent_at", cutoff);
  const { data: staleChats } = await supabase
    .from("whatsapp_chats")
    .select("id, last_message_at, last_message")
    .or(`last_message_at.lt.${cutoff},last_message_at.is.null`);
  let chatsRemoved = 0;
  for (const chat of staleChats ?? []) {
    if (chatWithinRetention(chat as DbChatRow)) continue;
    await supabase.from("whatsapp_chats").delete().eq("id", chat.id);
    chatsRemoved += 1;
  }
  return { messagesRemoved: -1, chatsRemoved };
}
