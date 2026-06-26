import {
  ensureEvolutionInstance,
  ensureEvolutionWebhookConfigured,
  fetchEvolutionChats,
  fetchEvolutionConnectionState,
  forceDisconnectEvolutionInstance,
  fetchEvolutionInstanceMeta,
  fetchEvolutionMessages,
  fetchEvolutionProfile,
  fetchEvolutionQrCode,
  fetchEvolutionWebhookStatus,
  buildEvolutionContactIndex,
  isEvolutionConfigured,
  refreshEvolutionPairingCode,
  parseEvolutionPairingCode,
  requestEvolutionPairingCode,
  nudgeEvolutionPairingCode,
  snapshotEvolutionPairingCode,
  sendEvolutionAudio,
  sendEvolutionMedia,
  sendEvolutionMessage,
  resolveEvolutionSendTarget,
  startEvolutionQrSession,
} from "@/lib/api/whatsapp-evolution.server";
import {
  activateDemoWhatsApp,
  bulkUpsertWhatsAppChats,
  cleanupConversationPollution,
  cleanupExpiredWhatsAppData,
  cleanupJunkWhatsAppChats,
  clearWhatsAppMessagesForChat,
  consolidateOrphanLidChats,
  enrichWhatsAppContactProfile,
  getWhatsAppChatById,
  getWhatsAppInboundMessageCutoff,
  getWhatsAppMessageCutoff,
  insertWhatsAppMessage,
  isWhatsAppSchemaReady,
  listWhatsAppChats,
  listWhatsAppAgenda,
  listWhatsAppMessages,
  markChatAsRead,
  mergeChatByIdentity,
  parseEvolutionChat,
  parseEvolutionMessage,
  readWhatsAppConfig,
  setWhatsAppStatus,
  updateChatIdentityInPlace,
  upsertWhatsAppChat,
} from "@/lib/api/whatsapp-store.server";
import type {
  WhatsAppInboxState,
  WhatsAppListMode,
  WhatsAppMessageType,
  WhatsAppSyncMode,
} from "@/lib/whatsapp";
import {
  decodePairingCodeStorage,
  encodePairingCodeStorage,
  formatMessagePreview,
  formatWhatsAppPhone,
  extractPhoneJidFromMessageKey,
  isPairingCodeStorage,
  isValidWhatsAppChatJid,
  jidToPhone,
  resolveConnectAuthMode,
  normalizeWhatsAppPhone,
  phoneToJid,
  phoneJidFromPhone,
  looksLikeWhatsAppPhoneDigits,
  isPhoneSameAsLidId,
  isChatPhoneTrusted,
  isDirectPlayableMediaUrl,
  isWhatsAppEncryptedMediaUrl,
  toEvolutionSendDigits,
  WHATSAPP_DRAFT_CONVERSATION_MARKER,
  whatsappRetentionCutoff,
} from "@/lib/whatsapp";
import {
  getInstanceOwner,
  isOwnerJid,
  sanitizeCustomerName,
  fetchEvolutionContactsCached,
  clearEvolutionContactsCache,
  resolveRealPhoneJid,
  findCustomerJidFromLidMessages,
  findPhoneJidFromEvolutionChats,
  findEvolutionChatIdentityForLid,
  findPhoneJidByLidContactPair,
  resolveLidContactPushName,
} from "@/lib/api/whatsapp-identity.server";

function resolveProvider(): "evolution" | "demo" {
  return isEvolutionConfigured() ? "evolution" : "demo";
}

let lastRetentionCleanupAt = 0;

async function maybeCleanupExpiredWhatsAppData() {
  const now = Date.now();
  if (now - lastRetentionCleanupAt < 10 * 60 * 1000) return;
  lastRetentionCleanupAt = now;
  await cleanupExpiredWhatsAppData();
}

async function repairOwnerCorruptedChats() {
  const owner = await getInstanceOwner();
  if (!owner) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("whatsapp_chats").select("id, remote_jid, phone");
  for (const row of data ?? []) {
    if (isOwnerJid(row.remote_jid, owner)) {
      await supabaseAdmin.from("whatsapp_chats").delete().eq("id", row.id);
    }
  }
}

async function persistChatMirror(input: {
  remoteJid: string;
  name?: string | null;
  phone?: string | null;
  profilePicUrl?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadDelta?: number;
  firstContactAt?: string | null;
}) {
  const owner = await getInstanceOwner();
  if (isOwnerJid(input.remoteJid, owner)) {
    throw new Error("Chat vinculado ao numero da loja.");
  }

  return upsertWhatsAppChat({
    remoteJid: input.remoteJid,
    name: input.name,
    phone: input.phone ?? jidToPhone(input.remoteJid),
    profilePicUrl: input.profilePicUrl,
    lastMessage: input.lastMessage,
    lastMessageAt: input.lastMessageAt,
    unreadDelta: input.unreadDelta,
    firstContactAt: input.firstContactAt,
    mirrorName: true,
  });
}

/** Evita criar chat @lid orfao quando ja existe conversa/contato com telefone ou nome. */
async function resolveWebhookChatMirror(input: {
  chatRemoteJid: string;
  key: Record<string, unknown>;
  parsed: ReturnType<typeof parseEvolutionMessage>;
  inboundName: string | null;
}) {
  const owner = await getInstanceOwner();
  const {
    findWhatsAppChatByPhoneDigits,
    findWhatsAppChatByRemoteJid,
    getChatByRemoteJid,
    consolidateChatsIntoTarget,
  } = await import("@/lib/api/whatsapp-store.server");

  const phoneJidFromKey = extractPhoneJidFromMessageKey(input.key);
  let phone =
    (phoneJidFromKey ? jidToPhone(phoneJidFromKey) : null) ??
    (input.parsed.remoteJidAlt ? jidToPhone(input.parsed.remoteJidAlt) : null);
  let preferredName = input.inboundName ?? sanitizeCustomerName(input.parsed.pushName, owner);

  if (input.chatRemoteJid.endsWith("@lid")) {
    const evolutionChat = await findEvolutionChatIdentityForLid(input.chatRemoteJid);
    if (evolutionChat?.pushName && !preferredName) {
      preferredName = sanitizeCustomerName(evolutionChat.pushName, owner);
    }
    if (evolutionChat?.phoneJid && !phone) {
      phone = jidToPhone(evolutionChat.phoneJid);
    }

    const contacts = await fetchEvolutionContactsCached();
    const lidPushName = resolveLidContactPushName(contacts, input.chatRemoteJid);
    preferredName = preferredName ?? sanitizeCustomerName(lidPushName, owner);
  }

  if (!phone && input.chatRemoteJid.endsWith("@lid")) {
    const phoneJid =
      (await findCustomerJidFromLidMessages(input.chatRemoteJid, owner)) ??
      (await findPhoneJidFromEvolutionChats(input.chatRemoteJid, preferredName));
    if (phoneJid) {
      phone = jidToPhone(phoneJid);
    }
  }

  const resolved = await resolveRealPhoneJid({
    remoteJid: input.chatRemoteJid,
    phone,
    preferredName,
  });

  if (resolved.phone && looksLikeWhatsAppPhoneDigits(normalizeWhatsAppPhone(resolved.phone))) {
    phone = resolved.phone;
  }

  const phoneJid =
    phone && looksLikeWhatsAppPhoneDigits(normalizeWhatsAppPhone(phone))
      ? phoneJidFromPhone(phone)
      : null;

  let existingChat = null as Awaited<ReturnType<typeof findWhatsAppChatByRemoteJid>>;

  if (input.chatRemoteJid.endsWith("@lid")) {
    existingChat = await findWhatsAppChatByRemoteJid(input.chatRemoteJid);
  }

  if (!existingChat && phoneJid) {
    existingChat = await findWhatsAppChatByPhoneDigits(normalizeWhatsAppPhone(phone!));
  }

  if (!existingChat) {
    existingChat = await findWhatsAppChatByRemoteJid(input.chatRemoteJid);
  }

  if (!existingChat && phone) {
    const { listWabaContacts } = await import("@/lib/waba/waba.server");
    const digits = normalizeWhatsAppPhone(phone);
    const wabaMatch = (await listWabaContacts()).find(
      (contact) => normalizeWhatsAppPhone(contact.phone) === digits,
    );
    if (wabaMatch?.phone) {
      existingChat = await findWhatsAppChatByPhoneDigits(digits);
    }
  }

  if (!existingChat && input.chatRemoteJid.endsWith("@lid")) {
    const { findExistingChatForIncomingLid } = await import("@/lib/api/whatsapp-store.server");
    existingChat = await findExistingChatForIncomingLid({
      lidJid: input.chatRemoteJid,
      preferredName,
    });
  }

  let mirrorRemoteJid = phoneJid ?? input.chatRemoteJid;
  if (existingChat) {
    mirrorRemoteJid = existingChat.remoteJid.endsWith("@s.whatsapp.net")
      ? existingChat.remoteJid
      : (phoneJid ?? existingChat.remoteJid);
    phone = existingChat.phone ?? phone ?? resolved.phone;
    preferredName = existingChat.name ?? preferredName;
  } else if (phoneJid) {
    mirrorRemoteJid = phoneJid;
    phone = phone ?? resolved.phone;
  }

  const sourceLidJid = input.chatRemoteJid.endsWith("@lid") ? input.chatRemoteJid : null;
  const existingChatId = existingChat?.id ?? null;

  return {
    mirrorRemoteJid,
    phone,
    name: preferredName,
    sourceLidJid,
    existingChatId,
    async consolidateLidOrphan(targetChatId: string) {
      if (!sourceLidJid || sourceLidJid === mirrorRemoteJid) return;
      const lidChat = await getChatByRemoteJid(sourceLidJid);
      if (!lidChat || lidChat.id === targetChatId) return;
      const remoteJid = mirrorRemoteJid.endsWith("@s.whatsapp.net")
        ? mirrorRemoteJid
        : sourceLidJid;
      await consolidateChatsIntoTarget(lidChat.id, targetChatId, remoteJid);
    },
  };
}

const MEDIA_MESSAGE_TYPES = new Set<WhatsAppMessageType>([
  "image",
  "audio",
  "video",
  "document",
  "sticker",
]);

async function ensureWhatsAppMessageMediaStored(input: {
  messageId: string;
  chatId: string;
  waMessageId: string;
  direction: "inbound" | "outbound";
  messageType: WhatsAppMessageType;
  mediaUrl: string | null;
  mediaMime?: string | null;
  webhookKey?: Record<string, unknown>;
  webhookRecord?: Record<string, unknown>;
}) {
  if (!MEDIA_MESSAGE_TYPES.has(input.messageType)) return input.mediaUrl;
  if (isDirectPlayableMediaUrl(input.mediaUrl)) return input.mediaUrl;
  if (!isEvolutionConfigured()) return input.mediaUrl;
  if (!input.waMessageId || input.waMessageId.startsWith("local-")) return input.mediaUrl;

  const { updateWhatsAppMessageMediaUrl } = await import("@/lib/api/whatsapp-store.server");
  const { fetchEvolutionMediaBase64 } = await import("@/lib/api/whatsapp-evolution.server");
  const chat = await getWhatsAppChatById(input.chatId);

  const jids = new Set<string>();
  const key = input.webhookKey ?? {};
  if (typeof key.remoteJid === "string" && key.remoteJid.trim()) jids.add(key.remoteJid.trim());
  const phoneJid = extractPhoneJidFromMessageKey(key);
  if (phoneJid) jids.add(phoneJid);
  if (chat?.remote_jid) jids.add(chat.remote_jid);
  if (chat?.phone) {
    const pj = phoneJidFromPhone(chat.phone);
    if (pj) jids.add(pj);
  }

  const attempts: Array<{ remoteJid?: string; webhookRecord?: Record<string, unknown> }> = [];
  if (input.webhookRecord) {
    attempts.push({ webhookRecord: input.webhookRecord });
  }
  for (const remoteJid of jids) {
    attempts.push({ remoteJid });
  }
  attempts.push({});

  for (const attempt of attempts) {
    try {
      const fetched = await fetchEvolutionMediaBase64({
        remoteJid: attempt.remoteJid,
        waMessageId: input.waMessageId,
        fromMe: input.direction === "outbound",
        webhookRecord: attempt.webhookRecord,
      });
      if (!fetched?.base64) continue;
      const mimetype = fetched.mimetype || input.mediaMime || "application/octet-stream";
      const dataUrl = `data:${mimetype};base64,${fetched.base64}`;
      await updateWhatsAppMessageMediaUrl(input.messageId, dataUrl);
      return dataUrl;
    } catch (error) {
      console.error("[ensureWhatsAppMessageMediaStored]", input.messageId, error);
    }
  }

  return input.mediaUrl;
}

export async function processIncomingWhatsAppRecord(record: Record<string, unknown>) {
  const parsed = parseEvolutionMessage(record);
  const key = (record.key ?? {}) as Record<string, unknown>;
  const chatRemoteJid = String(key.remoteJid ?? parsed.primaryJid ?? parsed.remoteJid);

  if (!chatRemoteJid || chatRemoteJid.endsWith("@g.us")) return null;
  if (!isValidWhatsAppChatJid(chatRemoteJid)) return null;
  const messageCutoff = await getWhatsAppInboundMessageCutoff();
  if (new Date(parsed.sentAt).getTime() < messageCutoff.getTime()) return null;

  const owner = await getInstanceOwner();
  if (isOwnerJid(chatRemoteJid, owner)) return null;

  const isInbound = parsed.direction === "inbound";
  const inboundName = isInbound ? sanitizeCustomerName(parsed.pushName, owner) : null;

  const mirror = await resolveWebhookChatMirror({
    chatRemoteJid,
    key,
    parsed,
    inboundName,
  });

  const preview = formatMessagePreview(parsed.messageType, parsed.body);
  const { touchWhatsAppChatPreview, mergeChatIfPhoneKnown, reconcileOrphanLidChat } =
    await import("@/lib/api/whatsapp-store.server");

  let chat =
    mirror.existingChatId != null
      ? await touchWhatsAppChatPreview(mirror.existingChatId, {
          lastMessage: preview,
          lastMessageAt: parsed.sentAt,
          name: mirror.name,
          phone: mirror.phone,
        })
      : await persistChatMirror({
          remoteJid: mirror.mirrorRemoteJid,
          name: mirror.name,
          phone: mirror.phone,
          lastMessage: preview,
          lastMessageAt: parsed.sentAt,
          firstContactAt: isInbound ? parsed.sentAt : undefined,
        });

  if (!chat) throw new Error("Falha ao espelhar conversa.");

  await mirror.consolidateLidOrphan(chat.id);

  const phoneJidFromKey = extractPhoneJidFromMessageKey(key);
  const messageRemoteJid =
    phoneJidFromKey ??
    (parsed.remoteJid.endsWith("@s.whatsapp.net") ? parsed.remoteJid : null) ??
    (mirror.mirrorRemoteJid.endsWith("@s.whatsapp.net") ? mirror.mirrorRemoteJid : null) ??
    chatRemoteJid;

  let finalChatId = chat.id;
  finalChatId = await mergeChatIfPhoneKnown(finalChatId, phoneJidFromKey ?? messageRemoteJid);

  if (chatRemoteJid.endsWith("@lid")) {
    finalChatId = await reconcileOrphanLidChat(finalChatId, chatRemoteJid);
  }

  if (finalChatId !== chat.id) {
    const refreshedFinal = await getWhatsAppChatById(finalChatId);
    if (refreshedFinal) {
      chat = { ...chat, id: finalChatId, phone: refreshedFinal.phone ?? chat.phone };
    } else {
      chat = { ...chat, id: finalChatId };
    }
  }

  const storedMediaUrl = isWhatsAppEncryptedMediaUrl(parsed.mediaUrl) ? null : parsed.mediaUrl;

  const saved = await insertWhatsAppMessage({
    chatId: finalChatId,
    remoteJid: messageRemoteJid,
    waMessageId: parsed.waMessageId,
    direction: parsed.direction,
    messageType: parsed.messageType,
    body: parsed.body,
    mediaUrl: storedMediaUrl,
    mediaMime: parsed.mediaMime,
    fileName: parsed.fileName,
    sentAt: parsed.sentAt,
    status: parsed.direction === "outbound" ? "sent" : "delivered",
    replyToWaMessageId: parsed.replyToWaMessageId ?? null,
    replyToText: parsed.replyToText ?? null,
    replyToFromMe: parsed.replyToFromMe ?? null,
  });

  if (!isInbound) {
    const { syncAtendimentoSessionOnActivity } =
      await import("@/lib/atendimento/atendimento-hours.server");
    await syncAtendimentoSessionOnActivity(finalChatId, parsed.sentAt);
  }

  if (MEDIA_MESSAGE_TYPES.has(parsed.messageType)) {
    void ensureWhatsAppMessageMediaStored({
      messageId: saved.id,
      chatId: finalChatId,
      waMessageId: parsed.waMessageId,
      direction: parsed.direction,
      messageType: parsed.messageType,
      mediaUrl: storedMediaUrl,
      mediaMime: parsed.mediaMime,
      webhookKey: key,
      webhookRecord: record,
    }).catch((error) => {
      console.error("[ensureWhatsAppMessageMediaStored]", saved.id, error);
    });
  }

  if (isInbound) {
    const { ensureCustomerInboundKeepsConversationOpen } =
      await import("@/lib/atendimento/atendimento-hours.server");
    await ensureCustomerInboundKeepsConversationOpen(finalChatId, parsed.sentAt);
  }

  const contactName =
    mirror.name ?? inboundName ?? sanitizeCustomerName(parsed.pushName, owner) ?? null;

  const persisted = await resolveAndPersistChatContact({
    chatId: chat.id,
    chatRemoteJid,
    name: contactName,
    messageKey: key,
  });

  const savePhone = persisted.phone;
  const refreshed = await getWhatsAppChatById(chat.id);
  if (refreshed && persisted.phone) {
    chat = { ...chat, phone: persisted.phone, remote_jid: refreshed.remote_jid };
  }

  if (isInbound && savePhone) {
    const { ensureWabaContactFromMessage } = await import("@/lib/waba/waba.server");
    const { canonicalContactPhone } = await import("@/lib/waba/phone-utils");
    const { runAtendimentoAutomations } = await import("@/lib/waba/automations-engine.server");
    const contact = await ensureWabaContactFromMessage({
      phone: canonicalContactPhone(savePhone),
      name: contactName ?? persisted.name,
      lidJid: chatRemoteJid.endsWith("@lid") ? chatRemoteJid : null,
    });
    if (contact?.id) {
      const { countWhatsAppInboundMessages } = await import("@/lib/api/whatsapp-store.server");
      const priorCount = await countWhatsAppInboundMessages(chat.id);
      void runAtendimentoAutomations({
        triggerType: priorCount <= 1 ? "first_inbound_message" : "new_message_received",
        contactId: contact.id,
        conversationId: chat.id,
        messageText: parsed.body ?? undefined,
        inboundMessageId: parsed.waMessageId,
      }).catch(console.error);
    }
  }

  return parsed;
}

function normalizeAgendaName(name: string | null | undefined) {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isValidSavedPhoneForLid(phone: string | null | undefined, lidJid: string) {
  if (!phone?.trim()) return false;
  const digits = normalizeWhatsAppPhone(phone);
  if (!looksLikeWhatsAppPhoneDigits(digits)) return false;
  return !isPhoneSameAsLidId(digits, lidJid);
}

async function autoSaveWabaContactFromChat(input: {
  phone?: string | null;
  name?: string | null;
  chatRemoteJid: string;
}) {
  const phone =
    input.phone ??
    (input.chatRemoteJid.endsWith("@s.whatsapp.net") ? jidToPhone(input.chatRemoteJid) : null);
  if (!phone || !isValidSavedPhoneForLid(phone, input.chatRemoteJid)) return null;

  const { ensureWabaContactFromMessage } = await import("@/lib/waba/waba.server");
  return ensureWabaContactFromMessage({
    phone,
    name: input.name,
    lidJid: input.chatRemoteJid.endsWith("@lid") ? input.chatRemoteJid : null,
  });
}

/**
 * Resolve telefone real (mensagem, Evolution, agenda) e grava no chat + waba_contacts.
 * Roda em inbound e outbound — celular ou painel.
 */
export async function resolveAndPersistChatContact(input: {
  chatId: string;
  chatRemoteJid: string;
  name?: string | null;
  messageKey?: Record<string, unknown>;
  manualPhone?: string | null;
}): Promise<{ phone: string | null; name: string | null; saved: boolean }> {
  const owner = await getInstanceOwner();
  const {
    getWhatsAppChatById,
    promoteChatToRealPhoneJid,
    updateChatIdentityInPlace,
    resolvePhoneFromChatMessages,
  } = await import("@/lib/api/whatsapp-store.server");

  let name = input.name?.trim() || null;
  const verifiedAt = new Date().toISOString();

  if (input.manualPhone?.trim()) {
    const digits = normalizeWhatsAppPhone(input.manualPhone);
    if (!looksLikeWhatsAppPhoneDigits(digits)) {
      throw new Error("Telefone invalido. Informe DDD + numero (ex: 5587999999999).");
    }
    if (!isValidSavedPhoneForLid(input.manualPhone, input.chatRemoteJid)) {
      throw new Error("Esse valor parece ser o ID interno @lid, nao um telefone real.");
    }

    const chat = await getWhatsAppChatById(input.chatId);
    name = name ?? chat?.name?.trim() ?? null;
    const formattedPhone = formatWhatsAppPhone(input.manualPhone) ?? input.manualPhone;

    await updateChatIdentityInPlace(input.chatId, {
      phone: formattedPhone,
      phone_verified_at: verifiedAt,
      profile_pic_url: null,
      profile_pic_phone_digits: null,
      ...(name ? { name } : {}),
    });
    await promoteChatToRealPhoneJid(input.chatId, formattedPhone);
    await refreshWhatsAppChatProfilePicture(input.chatId, { force: true });

    const contact = await autoSaveWabaContactFromChat({
      phone: formattedPhone,
      name,
      chatRemoteJid: input.chatRemoteJid,
    });

    return { phone: formattedPhone, name, saved: Boolean(contact) };
  }

  let phone: string | null = null;
  let phoneVerified = false;

  const phoneJidFromKey = input.messageKey ? extractPhoneJidFromMessageKey(input.messageKey) : null;
  if (phoneJidFromKey) {
    phone = jidToPhone(phoneJidFromKey);
    phoneVerified = true;
  }

  const chat = await getWhatsAppChatById(input.chatId);
  name = name ?? chat?.name?.trim() ?? null;

  if (!phone && input.chatRemoteJid.endsWith("@s.whatsapp.net")) {
    phone = jidToPhone(input.chatRemoteJid);
    phoneVerified = true;
  }

  if (!phone && input.chatRemoteJid.endsWith("@lid")) {
    const fromMessages = await resolvePhoneFromChatMessages(input.chatId);
    if (fromMessages) {
      phone = formatWhatsAppPhone(fromMessages) ?? fromMessages;
      phoneVerified = true;
    }

    if (!phone) {
      const { pullRealPhoneForLidChat } = await import("@/lib/api/whatsapp-identity.server");
      const pulled = await pullRealPhoneForLidChat(input.chatId, input.chatRemoteJid, name);
      if (pulled?.phone && pulled.source !== "lidContactPair" && pulled.source !== "contactName") {
        phone = pulled.phone;
        phoneVerified = true;
      }
    }
  }

  if (
    !phone &&
    chat?.phone &&
    chat.phoneVerifiedAt &&
    isValidSavedPhoneForLid(chat.phone, input.chatRemoteJid)
  ) {
    phone = chat.phone;
    phoneVerified = true;
  }

  if (!phone || !isValidSavedPhoneForLid(phone, input.chatRemoteJid)) {
    return { phone: null, name, saved: false };
  }

  const formattedPhone = formatWhatsAppPhone(phone) ?? phone;
  await updateChatIdentityInPlace(input.chatId, {
    phone: formattedPhone,
    ...(phoneVerified ? { phone_verified_at: verifiedAt } : {}),
    ...(phoneVerified ? { profile_pic_url: null, profile_pic_phone_digits: null } : {}),
    ...(name ? { name } : {}),
  });
  if (phoneVerified) {
    await promoteChatToRealPhoneJid(input.chatId, formattedPhone);
    await refreshWhatsAppChatProfilePicture(input.chatId, { force: true });
  }

  const contact = await autoSaveWabaContactFromChat({
    phone: formattedPhone,
    name,
    chatRemoteJid: input.chatRemoteJid,
  });

  return { phone: formattedPhone, name, saved: Boolean(contact) };
}

/** Busca foto de perfil na Evolution pelo telefone/JID confirmado e grava no chat. */
export async function refreshWhatsAppChatProfilePicture(
  chatId: string,
  options?: { force?: boolean },
): Promise<string | null> {
  if (!isEvolutionConfigured()) return null;

  const { getWhatsAppChatById, updateChatIdentityInPlace } =
    await import("@/lib/api/whatsapp-store.server");
  const { fetchEvolutionProfilePicture } = await import("@/lib/api/whatsapp-evolution.server");

  const row = await getWhatsAppChatById(chatId);
  if (!row) return null;

  const phoneDigits = normalizeWhatsAppPhone(row.phone ?? "");
  if (!phoneDigits || !looksLikeWhatsAppPhoneDigits(phoneDigits)) return null;

  if (
    !options?.force &&
    row.profile_pic_url?.trim() &&
    row.profile_pic_phone_digits &&
    row.profile_pic_phone_digits === phoneDigits
  ) {
    return row.profile_pic_url;
  }

  if (
    !isChatPhoneTrusted({
      remoteJid: row.remote_jid,
      phone: row.phone,
      phoneVerifiedAt: row.phone_verified_at,
    })
  ) {
    return null;
  }

  await updateChatIdentityInPlace(chatId, {
    profile_pic_url: null,
    profile_pic_phone_digits: null,
  });

  const url = await fetchEvolutionProfilePicture(phoneDigits);
  if (!url) return null;

  await updateChatIdentityInPlace(chatId, {
    profile_pic_url: url,
    profile_pic_phone_digits: phoneDigits,
  });
  return url;
}

async function syncChatPhoneFromWabaAgenda(chat: {
  id: string;
  remoteJid: string;
  name?: string | null;
  phone?: string | null;
  phoneVerifiedAt?: string | null;
}) {
  if (chat.phoneVerifiedAt && isValidSavedPhoneForLid(chat.phone, chat.remoteJid)) return chat;

  if (chat.remoteJid.endsWith("@s.whatsapp.net")) {
    const phone = jidToPhone(chat.remoteJid);
    if (phone) {
      await updateChatIdentityInPlace(chat.id, { phone });
      return { ...chat, phone };
    }
  }

  const digits = chat.phone ? normalizeWhatsAppPhone(chat.phone) : "";
  if (!digits || !looksLikeWhatsAppPhoneDigits(digits)) return chat;

  const { listWabaContacts } = await import("@/lib/waba/waba.server");
  const match = (await listWabaContacts()).find(
    (contact) => normalizeWhatsAppPhone(contact.phone) === digits,
  );
  if (!match?.phone?.trim()) return chat;

  const formatted = formatWhatsAppPhone(match.phone) ?? match.phone;
  await updateChatIdentityInPlace(chat.id, { phone: formatted });
  return { ...chat, phone: formatted };
}

async function mergeLidChatToPhoneJid(chat: {
  id: string;
  remoteJid: string;
  phone?: string | null;
  name?: string | null;
  profilePicUrl?: string | null;
  firstContactAt?: string | null;
}) {
  if (!chat.remoteJid.endsWith("@lid") || !isValidSavedPhoneForLid(chat.phone, chat.remoteJid)) {
    return chat;
  }

  const phoneJid = phoneToJid(chat.phone ?? "");
  if (!phoneJid) return chat;

  const merged = await mergeChatByIdentity(chat.id, {
    remoteJid: phoneJid,
    phone: jidToPhone(phoneJid) ?? chat.phone ?? null,
    name: chat.name ?? null,
    profilePicUrl: chat.profilePicUrl ?? null,
  });

  return {
    id: merged.id,
    remoteJid: merged.remoteJid,
    phone: merged.phone,
    name: merged.name,
    profilePicUrl: merged.profilePicUrl,
    firstContactAt: chat.firstContactAt,
  };
}

async function ensureChatReadyForSend(chat: {
  id: string;
  remoteJid: string;
  name?: string | null;
  phone?: string | null;
  phoneVerifiedAt?: string | null;
  profilePicUrl?: string | null;
  firstContactAt?: string | null;
}) {
  const { promoteChatToRealPhoneJid } = await import("@/lib/api/whatsapp-store.server");
  chat = await syncChatPhoneFromWabaAgenda(chat);
  chat = await mergeLidChatToPhoneJid(chat);

  if (chat.remoteJid.endsWith("@lid") && !isChatPhoneTrusted(chat)) {
    throw new Error(
      "Telefone nao confirmado. Edite o contato no painel lateral e informe o numero com DDD antes de enviar.",
    );
  }

  const target = await resolveEvolutionSendTarget({
    id: chat.id,
    remoteJid: chat.remoteJid,
    phone: chat.phone,
    name: chat.name,
    phoneVerifiedAt: chat.phoneVerifiedAt,
  });

  if (!target.digits) {
    throw new Error(
      "Telefone do contato nao identificado. Aguarde a sincronizacao ou cadastre o numero na agenda.",
    );
  }

  if (target.identity.phone && target.identity.phone !== chat.phone) {
    await updateChatIdentityInPlace(chat.id, { phone: target.identity.phone });
  }

  if (target.sendRemoteJid.endsWith("@s.whatsapp.net") && chat.remoteJid.endsWith("@lid")) {
    await promoteChatToRealPhoneJid(chat.id, target.identity.phone ?? chat.phone);
  }

  return {
    chatId: chat.id,
    remoteJid: target.sendRemoteJid,
    identity: target.identity,
    digits: target.digits,
    sendViaLid: false,
    sendRemoteJid: target.sendRemoteJid,
  };
}

function pairingPendingAgeMs(updatedAt: string | null | undefined) {
  if (!updatedAt) return 0;
  const ts = new Date(updatedAt).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Date.now() - ts);
}

async function resolvePendingPairingCode(
  phoneNumber: string | null,
  pairingCode: string | null,
  updatedAt: string | null | undefined,
): Promise<string | null> {
  if (pairingCode) return pairingCode;
  if (!phoneNumber || pairingPendingAgeMs(updatedAt) < 8_000) return null;

  const digits = toEvolutionSendDigits(phoneNumber) || normalizeWhatsAppPhone(phoneNumber);
  if (!digits) return null;

  return nudgeEvolutionPairingCode(digits);
}

function resolveStoredAuthMode(
  status: string,
  qrCodeStorage: string | null | undefined,
): "qr" | "pairing" | null {
  if (status === "pairing") return "pairing";
  if (status === "qr") return "qr";
  return resolveConnectAuthMode(qrCodeStorage);
}

function inboxStateWithFreshAuth(
  state: WhatsAppInboxState,
  auth: {
    status: "qr" | "pairing";
    qrCode?: string | null;
    pairingCode?: string | null;
    phoneNumber?: string | null;
  },
): WhatsAppInboxState {
  if (auth.status === "pairing") {
    return {
      ...state,
      status: "pairing",
      connectMode: "pairing",
      qrCode: null,
      pairingCode: auth.pairingCode ?? null,
      phoneNumber: auth.phoneNumber ?? state.phoneNumber,
      pairingIssuedAt: new Date().toISOString(),
      warning: null,
    };
  }

  return {
    ...state,
    status: "qr",
    connectMode: "qr",
    qrCode: auth.qrCode ?? null,
    pairingCode: null,
    phoneNumber: auth.phoneNumber ?? state.phoneNumber,
    pairingIssuedAt: null,
    warning: null,
  };
}

export async function getWhatsAppInboxState(): Promise<WhatsAppInboxState> {
  const provider = resolveProvider();
  const { config, schemaReady } = await readWhatsAppConfig(provider);

  if (provider === "demo") {
    activateDemoWhatsApp();
    return {
      configured: false,
      provider: "demo",
      status: "demo",
      instanceName: config.instance_name,
      phoneNumber: config.phone_number,
      profileName: config.profile_name ?? "Abelha & Mel",
      qrCode: null,
      pairingCode: null,
      connectMode: null,
      pairingIssuedAt: null,
      evolutionOwnerPhone: null,
      warning: schemaReady
        ? "Modo demonstracao ativo. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY para conectar o WhatsApp real."
        : "Migration WhatsApp pendente no Supabase. Usando demonstracao local.",
    };
  }

  let status = config.status as WhatsAppInboxState["status"];
  let qrCode = isPairingCodeStorage(config.qr_code) ? null : config.qr_code;
  let pairingCode = decodePairingCodeStorage(config.qr_code);
  const storedAuthMode = resolveStoredAuthMode(config.status, config.qr_code);
  let connectMode = storedAuthMode;
  let phoneNumber = config.phone_number;
  let profileName = config.profile_name;
  let warning: string | null = null;
  const explicitlyDisconnected = config.status === "disconnected";
  let pairingIssuedAt = storedAuthMode === "pairing" ? (config.updated_at ?? null) : null;
  let evolutionOwnerPhone: string | null = null;

  try {
    const instanceMeta = await fetchEvolutionInstanceMeta();
    evolutionOwnerPhone = instanceMeta.ownerPhoneDigits
      ? formatWhatsAppPhone(instanceMeta.ownerPhoneDigits)
      : null;

    const liveStatus = await fetchEvolutionConnectionState();

    if (explicitlyDisconnected) {
      status = "disconnected";
      qrCode = null;
      pairingCode = null;
      connectMode = null;
      pairingIssuedAt = null;
      phoneNumber = null;
      profileName = null;
      if (liveStatus === "connected" || liveStatus === "connecting") {
        warning =
          "Painel desconectado, mas a Evolution ainda reporta sessao ativa. Clique em Desconectar novamente.";
      }
    } else if (liveStatus === "connected") {
      status = "connected";
      qrCode = null;
      pairingCode = null;
      connectMode = null;
      pairingIssuedAt = null;
      const profile = await fetchEvolutionProfile();
      phoneNumber = profile.phoneNumber ?? phoneNumber;
      profileName = profile.profileName ?? profileName;
      await ensureEvolutionWebhookConfigured();
      await setWhatsAppStatus("connected", {
        phone_number: phoneNumber,
        profile_name: profileName,
        qr_code: null,
        provider: "evolution",
        connected_at: config.connected_at ?? new Date().toISOString(),
      });
    } else if (liveStatus === "connecting") {
      if (storedAuthMode === "pairing") {
        connectMode = "pairing";
        status = "pairing";
        if (!pairingCode) {
          const { config: latest } = await readWhatsAppConfig("evolution");
          pairingCode = decodePairingCodeStorage(latest.qr_code);
        }
        if (!pairingCode) {
          const fromEvo = await resolvePendingPairingCode(
            phoneNumber,
            pairingCode,
            config.updated_at,
          );
          if (fromEvo) {
            pairingCode = fromEvo;
            await setWhatsAppStatus("pairing", {
              qr_code: encodePairingCodeStorage(fromEvo),
              provider: "evolution",
              phone_number: phoneNumber,
            });
          }
        }
        if (!pairingCode && pairingPendingAgeMs(config.updated_at) > 90_000) {
          warning =
            "A Evolution nao devolveu o codigo de vinculo. Clique em Desconectar, aguarde 10 segundos e tente Gerar codigo de novo.";
        }
      } else if (storedAuthMode === "qr") {
        connectMode = "qr";
        if (qrCode) {
          status = "qr";
        } else {
          const qr = await fetchEvolutionQrCode();
          if (qr.qrCode) {
            qrCode = qr.qrCode;
            pairingCode = null;
            status = "qr";
            await setWhatsAppStatus("qr", { qr_code: qrCode, provider: "evolution" });
          } else {
            status = "connecting";
          }
        }
      } else {
        status = "connecting";
      }
    } else if (storedAuthMode === "pairing") {
      status = "pairing";
      connectMode = "pairing";
      if (!pairingCode) {
        const fromEvo = await resolvePendingPairingCode(
          phoneNumber,
          pairingCode,
          config.updated_at,
        );
        if (fromEvo) {
          pairingCode = fromEvo;
          await setWhatsAppStatus("pairing", {
            qr_code: encodePairingCodeStorage(fromEvo),
            provider: "evolution",
            phone_number: phoneNumber,
          });
        }
      }
      if (!pairingCode && pairingPendingAgeMs(config.updated_at) > 90_000) {
        warning =
          "A Evolution nao devolveu o codigo de vinculo. Clique em Desconectar, aguarde 10 segundos e tente Gerar codigo de novo.";
      }
    } else if (storedAuthMode === "qr") {
      status = "qr";
      if (!qrCode) {
        const qr = await fetchEvolutionQrCode();
        qrCode = qr.qrCode;
        if (qrCode) {
          await setWhatsAppStatus("qr", { qr_code: qrCode, provider: "evolution" });
        }
      }
    } else {
      status = config.status === "connected" ? "connected" : "disconnected";
      connectMode = null;
    }
  } catch (error) {
    warning = error instanceof Error ? error.message : "Falha ao consultar Evolution API.";
    if (explicitlyDisconnected) {
      status = "disconnected";
      qrCode = null;
      pairingCode = null;
      connectMode = null;
      pairingIssuedAt = null;
    } else if (storedAuthMode === "pairing") {
      status = "pairing";
      connectMode = "pairing";
    } else if (storedAuthMode === "qr" && qrCode) {
      status = "qr";
      connectMode = "qr";
    } else {
      status = config.status === "connected" ? "connected" : "disconnected";
    }
  }

  return {
    configured: true,
    provider: "evolution",
    status,
    instanceName: config.instance_name,
    phoneNumber,
    profileName,
    qrCode,
    pairingCode,
    connectMode,
    pairingIssuedAt,
    evolutionOwnerPhone,
    warning,
  };
}

export async function refreshWhatsAppPairingCode(phone: string) {
  if (!isEvolutionConfigured()) {
    throw new Error("Evolution API nao configurada.");
  }

  const digits = toEvolutionSendDigits(phone) || normalizeWhatsAppPhone(phone);
  if (!digits || !looksLikeWhatsAppPhoneDigits(digits)) {
    throw new Error("Informe o telefone com DDI e DDD (ex: 5587981582587).");
  }

  const result = await refreshEvolutionPairingCode(digits);
  if (!result.pairingCode) {
    throw new Error(
      "Nao foi possivel renovar o codigo de vinculo. Clique em Gerar codigo novamente.",
    );
  }

  await setWhatsAppStatus("pairing", {
    qr_code: encodePairingCodeStorage(result.pairingCode),
    provider: "evolution",
    phone_number: formatWhatsAppPhone(digits),
    profile_name: null,
  });
  const state = await getWhatsAppInboxState();
  return inboxStateWithFreshAuth(state, {
    status: "pairing",
    pairingCode: result.pairingCode,
    phoneNumber: formatWhatsAppPhone(digits),
  });
}

export async function startWhatsAppConnection() {
  if (!isEvolutionConfigured()) {
    activateDemoWhatsApp();
    return getWhatsAppInboxState();
  }

  const result = await startEvolutionQrSession();
  if (!result.qrCode) {
    throw new Error("Nao foi possivel gerar o QR Code. Tente novamente em alguns segundos.");
  }

  await setWhatsAppStatus("qr", {
    qr_code: result.qrCode,
    provider: "evolution",
    phone_number: null,
    profile_name: null,
  });
  const state = await getWhatsAppInboxState();
  return inboxStateWithFreshAuth(state, { status: "qr", qrCode: result.qrCode });
}

export async function startWhatsAppConnectionWithPhone(phone: string) {
  if (!isEvolutionConfigured()) {
    throw new Error("Evolution API nao configurada.");
  }

  const digits = toEvolutionSendDigits(phone) || normalizeWhatsAppPhone(phone);
  if (!digits || !looksLikeWhatsAppPhoneDigits(digits)) {
    throw new Error("Informe o telefone com DDI e DDD (ex: 5587981582587).");
  }

  const formattedPhone = formatWhatsAppPhone(digits);

  await setWhatsAppStatus("pairing", {
    qr_code: null,
    provider: "evolution",
    phone_number: formattedPhone,
    profile_name: null,
  });

  const result = await requestEvolutionPairingCode(digits);
  if (result.pairingCode) {
    await setWhatsAppStatus("pairing", {
      qr_code: encodePairingCodeStorage(result.pairingCode),
      provider: "evolution",
      phone_number: formattedPhone,
      profile_name: null,
    });
    const state = await getWhatsAppInboxState();
    return inboxStateWithFreshAuth(state, {
      status: "pairing",
      pairingCode: result.pairingCode,
      phoneNumber: formattedPhone,
    });
  }

  const liveStatus = await fetchEvolutionConnectionState();
  if (liveStatus === "connecting") {
    const state = await getWhatsAppInboxState();
    return {
      ...state,
      status: "pairing",
      connectMode: "pairing",
      phoneNumber: formattedPhone,
      pairingCode: state.pairingCode,
      warning: state.pairingCode
        ? null
        : "Gerando codigo de vinculo. O painel atualiza sozinho em alguns segundos.",
    };
  }

  const hint =
    liveStatus === "connected"
      ? "O WhatsApp ainda aparece conectado na Evolution. Use Desconectar e tente novamente."
      : "Confira o numero com DDI 55 + DDD e tente novamente. Se persistir, confira CONFIG_SESSION_PHONE_* na VPS.";
  throw new Error(`Nao foi possivel gerar o codigo de vinculo. ${hint}`);
}

export async function disconnectWhatsApp() {
  let evolutionWarning: string | null = null;

  if (isEvolutionConfigured()) {
    try {
      const liveAfter = await forceDisconnectEvolutionInstance();
      if (liveAfter === "connected" || liveAfter === "connecting") {
        evolutionWarning =
          "A Evolution ainda nao liberou a sessao. Aguarde 10 segundos e clique em Desconectar novamente.";
      }
    } catch (error) {
      console.error("[disconnectWhatsApp] Evolution force disconnect:", error);
      evolutionWarning =
        error instanceof Error ? error.message : "Falha ao desconectar na Evolution API.";
    }
  }

  await setWhatsAppStatus("disconnected", {
    qr_code: null,
    phone_number: null,
    profile_name: null,
    connected_at: null,
    provider: isEvolutionConfigured() ? "evolution" : "demo",
  });
  if (!isEvolutionConfigured()) activateDemoWhatsApp();

  const state = await getWhatsAppInboxState();
  if (evolutionWarning) {
    return { ...state, warning: evolutionWarning };
  }
  return state;
}

/** Busca leve na agenda (sem sync completo da Evolution). */
async function syncWhatsAppContactsSearchLight(term: string, contacts: unknown[]) {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return;

  const owner = await getInstanceOwner();
  const contactIndex = buildEvolutionContactIndex(contacts);
  const inputs: Parameters<typeof bulkUpsertWhatsAppChats>[0] = [];
  const seen = new Set<string>();

  const pushInput = (input: Parameters<typeof bulkUpsertWhatsAppChats>[0][number]) => {
    if (seen.has(input.remoteJid)) return;
    seen.add(input.remoteJid);
    inputs.push(input);
  };

  for (const raw of contacts) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const remoteJid = String(row.remoteJid ?? "");
    if (!remoteJid.endsWith("@s.whatsapp.net")) continue;
    if (isOwnerJid(remoteJid, owner)) continue;

    const pushName = typeof row.pushName === "string" ? row.pushName.trim() : "";
    const phone = jidToPhone(remoteJid);
    const haystack = [pushName, phone, remoteJid].join(" ").toLowerCase();
    if (!haystack.includes(normalized)) continue;

    pushInput({
      remoteJid,
      name: pushName || phone,
      phone,
      profilePicUrl: typeof row.profilePicUrl === "string" ? row.profilePicUrl : null,
      agendaImport: true,
    });
  }

  for (const [name, contact] of contactIndex) {
    if (!name.includes(normalized)) continue;
    if (isOwnerJid(contact.remoteJid, owner)) continue;
    pushInput({
      remoteJid: contact.remoteJid,
      name: contact.pushName,
      phone: jidToPhone(contact.remoteJid),
      profilePicUrl: contact.profilePicUrl,
      agendaImport: true,
    });
  }

  if (inputs.length > 0) {
    await bulkUpsertWhatsAppChats(inputs);
  }
}

/** Importa contatos da agenda Evolution (telefone e @lid sem duplicata). */
async function syncAllContactsFromAgenda(contacts: unknown[]) {
  const owner = await getInstanceOwner();
  const phoneNames = new Set<string>();

  for (const raw of contacts) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const remoteJid = String(row.remoteJid ?? "");
    const pushName = typeof row.pushName === "string" ? row.pushName.trim().toLowerCase() : "";
    if (remoteJid.endsWith("@s.whatsapp.net") && pushName) {
      phoneNames.add(pushName);
    }
  }

  const inputs: Parameters<typeof bulkUpsertWhatsAppChats>[0] = [];

  for (const raw of contacts) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const remoteJid = String(row.remoteJid ?? "");
    if (!remoteJid || remoteJid.endsWith("@g.us")) continue;
    if (!remoteJid.endsWith("@s.whatsapp.net") && !remoteJid.endsWith("@lid")) continue;
    if (isOwnerJid(remoteJid, owner)) continue;

    const pushName = typeof row.pushName === "string" ? row.pushName.trim() : "";
    if (remoteJid.endsWith("@lid") && pushName && phoneNames.has(pushName.toLowerCase())) continue;

    const phone = jidToPhone(remoteJid);
    if (!pushName && !phone) continue;

    inputs.push({
      remoteJid,
      name: pushName || phone,
      phone,
      profilePicUrl: typeof row.profilePicUrl === "string" ? row.profilePicUrl : null,
      agendaImport: true,
    });
  }

  for (let index = 0; index < inputs.length; index += 200) {
    await bulkUpsertWhatsAppChats(inputs.slice(index, index + 200));
  }
}

async function runFullEvolutionSync() {
  await ensureEvolutionWebhookConfigured();
  await cleanupExpiredWhatsAppData();
  lastRetentionCleanupAt = Date.now();
  await cleanupConversationPollution();
  await cleanupJunkWhatsAppChats();
  await repairOwnerCorruptedChats();
  await syncActiveChatsFromEvolution();
  await syncMessagesMirrorForRecentChats();
}

async function runFullAgendaSync(search: string) {
  clearEvolutionContactsCache();
  const contacts = await fetchEvolutionContactsCached(true);
  await syncAllContactsFromAgenda(contacts);
  if (search.trim().length >= 2) {
    await syncWhatsAppContactsSearchLight(search, contacts);
  }
}

async function runLightSearchSync(search: string) {
  const contacts = await fetchEvolutionContactsCached(false);
  await syncWhatsAppContactsSearchLight(search, contacts);
}

export type WhatsAppFetchOptions = {
  search?: string;
  mode?: WhatsAppListMode;
  sync?: WhatsAppSyncMode;
};

export async function fetchWhatsAppChats(options: WhatsAppFetchOptions = {}) {
  const { search = "", mode = "conversations", sync = "none" } = options;

  if (isEvolutionConfigured() && sync !== "none") {
    try {
      if (sync === "full") {
        if (mode === "agenda") {
          await runFullAgendaSync(search);
        } else {
          await runFullEvolutionSync();
        }
      } else if (sync === "search" && search.trim().length >= 2) {
        await runLightSearchSync(search);
      }
    } catch (error) {
      console.error("[fetchWhatsAppChats]", error);
    }
  } else if (sync === "none") {
    await maybeCleanupExpiredWhatsAppData();
  }

  return mode === "agenda" ? listWhatsAppAgenda(search) : listWhatsAppChats(search);
}

/** @deprecated Use fetchWhatsAppChats({ sync: "full" }) */
export async function syncWhatsAppChatsFromProvider(search = "", forceCleanup = false) {
  return fetchWhatsAppChats({
    search,
    mode: "conversations",
    sync: forceCleanup ? "full" : "none",
  });
}

/** Espelha findChats Evolution — remoteJid e nome exatos, sem remapear identidade. */
async function syncActiveChatsFromEvolution() {
  const rawChats = await fetchEvolutionChats();
  const cutoff = whatsappRetentionCutoff();
  const owner = await getInstanceOwner();
  const inputs: Parameters<typeof bulkUpsertWhatsAppChats>[0] = [];

  for (const raw of rawChats) {
    if (!raw || typeof raw !== "object") continue;
    const parsed = parseEvolutionChat(raw as Record<string, unknown>);
    if (!parsed.remoteJid || parsed.isGroup || !isValidWhatsAppChatJid(parsed.remoteJid)) continue;
    if (isOwnerJid(parsed.remoteJid, owner)) continue;

    const lastAt = parsed.lastMessageAt ? new Date(parsed.lastMessageAt) : null;
    if (!lastAt || lastAt < cutoff) continue;

    inputs.push({
      remoteJid: parsed.remoteJid,
      name: parsed.name,
      phone: parsed.phone,
      profilePicUrl: parsed.profilePicUrl,
      lastMessage: parsed.lastMessage,
      lastMessageAt: parsed.lastMessageAt,
      firstContactAt: parsed.lastMessageAt,
      mirrorName: true,
    });
  }

  if (inputs.length > 0) {
    for (let index = 0; index < inputs.length; index += 100) {
      await bulkUpsertWhatsAppChats(inputs.slice(index, index + 100));
    }
  }
}

/** Puxa mensagens da Evolution para cada chat espelhado (findMessages por remoteJid exato). */
async function syncMessagesMirrorForRecentChats() {
  const chats = await listWhatsAppChats();
  for (const chat of chats) {
    try {
      await syncRecentMessagesForChatMirror(chat.id, chat.remoteJid);
    } catch (error) {
      console.error("[syncMessagesMirror]", chat.remoteJid, error);
    }
  }
}

async function syncRecentMessagesForChatMirror(chatId: string, remoteJid: string) {
  const rawMessages = await fetchEvolutionMessages(remoteJid, 40);
  const retentionMs = whatsappRetentionCutoff().getTime();

  const toInsert: Parameters<typeof insertWhatsAppMessage>[0][] = [];
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== "object") continue;
    const parsed = parseEvolutionMessage(raw as Record<string, unknown>);
    const sentMs = new Date(parsed.sentAt).getTime();
    if (sentMs < retentionMs) continue;

    toInsert.push({
      chatId,
      remoteJid: parsed.remoteJid.endsWith("@s.whatsapp.net") ? parsed.remoteJid : remoteJid,
      waMessageId: parsed.waMessageId,
      direction: parsed.direction,
      messageType: parsed.messageType,
      body: parsed.body,
      mediaUrl: isWhatsAppEncryptedMediaUrl(parsed.mediaUrl) ? null : parsed.mediaUrl,
      mediaMime: parsed.mediaMime,
      fileName: parsed.fileName,
      sentAt: parsed.sentAt,
      status: parsed.direction === "outbound" ? "sent" : "delivered",
      replyToWaMessageId: parsed.replyToWaMessageId ?? null,
      replyToText: parsed.replyToText ?? null,
      replyToFromMe: parsed.replyToFromMe ?? null,
    });
  }

  if (toInsert.length === 0) return;

  toInsert.sort((a, b) => String(a.sentAt ?? "").localeCompare(String(b.sentAt ?? "")));

  for (const message of toInsert) {
    const saved = await insertWhatsAppMessage(message);
    const raw = rawMessages.find((item) => {
      if (!item || typeof item !== "object") return false;
      const parsed = parseEvolutionMessage(item as Record<string, unknown>);
      return parsed.waMessageId === message.waMessageId;
    }) as Record<string, unknown> | undefined;
    const key = (raw?.key ?? {}) as Record<string, unknown>;
    if (MEDIA_MESSAGE_TYPES.has(message.messageType)) {
      void ensureWhatsAppMessageMediaStored({
        messageId: saved.id,
        chatId,
        waMessageId: message.waMessageId,
        direction: message.direction,
        messageType: message.messageType,
        mediaUrl: message.mediaUrl ?? null,
        mediaMime: message.mediaMime ?? null,
        webhookKey: key,
        webhookRecord: raw,
      }).catch((error) => {
        console.error("[syncRecentMessagesForChatMirror] media", saved.id, error);
      });
    }
  }

  const { touchWhatsAppChatPreview } = await import("@/lib/api/whatsapp-store.server");
  const newest = toInsert[toInsert.length - 1];
  if (newest) {
    await touchWhatsAppChatPreview(chatId, {
      lastMessage: formatMessagePreview(newest.messageType, newest.body ?? null),
      lastMessageAt: newest.sentAt ?? new Date().toISOString(),
    });
  }

  const { syncAtendimentoSessionOnActivity, reconcileAtendimentoSessionFromRecentMessages } =
    await import("@/lib/atendimento/atendimento-hours.server");
  for (const message of toInsert) {
    if (message.sentAt) {
      await syncAtendimentoSessionOnActivity(chatId, message.sentAt);
    }
  }
  await reconcileAtendimentoSessionFromRecentMessages(chatId);
}

export async function searchWhatsAppChats(term: string) {
  return fetchWhatsAppChats({ search: term, mode: "conversations", sync: "full" });
}

export async function listActiveWhatsAppChats(search = "") {
  return fetchWhatsAppChats({ search, mode: "conversations", sync: "none" });
}

export async function getWhatsAppMessages(
  chatId: string,
  options?: { history?: boolean; since?: string; before?: string; markRead?: boolean },
) {
  const chat = await getWhatsAppChatById(chatId);
  if (!chat) return { messages: [], chatId };

  const messages = await listWhatsAppMessages(chatId, {
    since: options?.history ? undefined : options?.since,
    history: options?.history,
    before: options?.before ?? null,
  });

  void refreshWhatsAppMessagesInBackground(chatId, chat, options).catch((error) => {
    console.error("[getWhatsAppMessages] background", chatId, error);
  });

  return { messages, chatId };
}

async function refreshWhatsAppMessagesInBackground(
  chatId: string,
  chat: NonNullable<Awaited<ReturnType<typeof getWhatsAppChatById>>>,
  options?: { history?: boolean; since?: string; markRead?: boolean },
) {
  const lastResolveAt = messageFetchResolveAt.get(chatId) ?? 0;
  if (
    (!chat.phone || chat.remote_jid.endsWith("@lid")) &&
    Date.now() - lastResolveAt > MESSAGE_FETCH_RESOLVE_MS
  ) {
    messageFetchResolveAt.set(chatId, Date.now());
    await resolveAndPersistChatContact({
      chatId,
      chatRemoteJid: chat.remote_jid,
      name: chat.name,
    });
  }

  const refreshedChat = await getWhatsAppChatById(chatId);
  const remoteJid = refreshedChat?.remote_jid ?? chat.remote_jid;

  if (isEvolutionConfigured()) {
    const lastSync = messageSyncAt.get(chatId) ?? 0;
    if (Date.now() - lastSync > MESSAGE_SYNC_MS) {
      messageSyncAt.set(chatId, Date.now());
      await syncRecentMessagesForChatMirror(chatId, remoteJid);
    }
  }

  if (options?.markRead !== false) {
    await markChatAsRead(chatId);
  }
}

const messageFetchResolveAt = new Map<string, number>();
const messageSyncAt = new Map<string, number>();
const MESSAGE_FETCH_RESOLVE_MS = 30_000;
const MESSAGE_SYNC_MS = 12_000;

function evolutionNumberFromReady(ready: { digits: string | null; sendRemoteJid: string }) {
  if (ready.digits) return ready.digits;
  if (ready.sendRemoteJid.endsWith("@s.whatsapp.net")) {
    return ready.sendRemoteJid.split("@")[0] ?? "";
  }
  throw new Error("Telefone do contato nao identificado para envio.");
}

export async function sendWhatsAppTextMessage(
  chatId: string,
  text: string,
  options?: { quotedMessageId?: string },
) {
  const row = await getWhatsAppChatById(chatId);
  if (!row) throw new Error("Conversa nao encontrada.");

  const ready = await ensureChatReadyForSend({
    id: row.id,
    remoteJid: row.remote_jid,
    name: row.name,
    phone: row.phone,
    phoneVerifiedAt: row.phone_verified_at,
    profilePicUrl: row.profile_pic_url,
    firstContactAt: row.first_contact_at,
  });

  let quoted: import("@/lib/api/whatsapp-evolution.server").EvolutionQuotedMessage | undefined;
  let replyToWaMessageId: string | null = null;
  let replyToText: string | null = null;
  let replyToFromMe: boolean | null = null;

  if (options?.quotedMessageId) {
    const { getWhatsAppMessageRow } = await import("@/lib/api/whatsapp-store.server");
    const { buildEvolutionQuotedFromWhatsAppMessage } =
      await import("@/lib/atendimento/message-reply.server");
    const { mediaTypeLabel } = await import("@/lib/atendimento/message-reply");
    const quotedRow = await getWhatsAppMessageRow(options.quotedMessageId);
    if (quotedRow) {
      const quotedMessage = {
        waMessageId: quotedRow.wa_message_id,
        remoteJid: quotedRow.remote_jid,
        direction: quotedRow.direction,
        body: quotedRow.body,
        messageType: quotedRow.message_type as import("@/lib/whatsapp").WhatsAppMessageType,
        fileName: quotedRow.file_name,
      };
      const built = buildEvolutionQuotedFromWhatsAppMessage(quotedMessage);
      if (built) quoted = built;
      replyToWaMessageId = quotedRow.wa_message_id;
      replyToText =
        quotedRow.body?.trim() ||
        (quotedRow.message_type === "document" && quotedRow.file_name?.trim()
          ? quotedRow.file_name.trim()
          : null) ||
        mediaTypeLabel(quotedRow.message_type as import("@/lib/whatsapp").WhatsAppMessageType);
      replyToFromMe = quotedRow.direction === "outbound";
    }
  }

  if (isEvolutionConfigured()) {
    try {
      await sendEvolutionMessage(
        {
          digits: ready.digits,
          sendRemoteJid: ready.sendRemoteJid,
          sendViaLid: false,
        },
        text.trim(),
        quoted,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar via Evolution API.";
      throw new Error(message);
    }
  }

  const sentAt = new Date().toISOString();
  const { syncAtendimentoSessionOnActivity } =
    await import("@/lib/atendimento/atendimento-hours.server");
  await syncAtendimentoSessionOnActivity(ready.chatId, sentAt);

  return insertWhatsAppMessage({
    chatId: ready.chatId,
    remoteJid: ready.sendRemoteJid,
    waMessageId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    direction: "outbound",
    messageType: "text",
    body: text.trim(),
    status: isEvolutionConfigured() ? "sent" : "delivered",
    sentAt,
    replyToWaMessageId,
    replyToText,
    replyToFromMe,
  });
}

export async function sendWhatsAppMediaMessage(input: {
  chatId: string;
  mediatype: "image" | "document" | "audio" | "video";
  base64: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
}) {
  const row = await getWhatsAppChatById(input.chatId);
  if (!row) throw new Error("Conversa nao encontrada.");

  const ready = await ensureChatReadyForSend({
    id: row.id,
    remoteJid: row.remote_jid,
    name: row.name,
    phone: row.phone,
    phoneVerifiedAt: row.phone_verified_at,
    profilePicUrl: row.profile_pic_url,
    firstContactAt: row.first_contact_at,
  });

  if (isEvolutionConfigured()) {
    const number = evolutionNumberFromReady(ready);
    if (input.mediatype === "audio") {
      await sendEvolutionAudio(number, input.base64);
    } else {
      await sendEvolutionMedia({
        number,
        mediatype: input.mediatype,
        media: input.base64,
        mimetype: input.mimetype,
        caption: input.caption,
        fileName: input.fileName,
      });
    }
  }

  const sentAt = new Date().toISOString();
  const { syncAtendimentoSessionOnActivity } =
    await import("@/lib/atendimento/atendimento-hours.server");
  await syncAtendimentoSessionOnActivity(ready.chatId, sentAt);

  const dataUrl =
    input.mimetype && input.mediatype === "image"
      ? `data:${input.mimetype};base64,${input.base64}`
      : input.mediatype === "audio"
        ? `data:${input.mimetype ?? "audio/webm"};base64,${input.base64}`
        : null;

  return insertWhatsAppMessage({
    chatId: ready.chatId,
    remoteJid: ready.sendRemoteJid,
    waMessageId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    direction: "outbound",
    messageType: input.mediatype,
    body: input.caption ?? input.fileName ?? null,
    mediaUrl: dataUrl,
    mediaMime: input.mimetype ?? null,
    fileName: input.fileName ?? null,
    status: isEvolutionConfigured() ? "sent" : "delivered",
    sentAt,
  });
}

export async function resolveWhatsAppMessageMediaUrl(messageId: string) {
  const { getWhatsAppMessageRow } = await import("@/lib/api/whatsapp-store.server");
  const row = await getWhatsAppMessageRow(messageId);
  if (!row) return null;

  if (isDirectPlayableMediaUrl(row.media_url)) return row.media_url;

  if (!isEvolutionConfigured() || !row.wa_message_id || row.wa_message_id.startsWith("local-")) {
    return isWhatsAppEncryptedMediaUrl(row.media_url) ? null : row.media_url;
  }

  return ensureWhatsAppMessageMediaStored({
    messageId: row.id,
    chatId: row.chat_id,
    waMessageId: row.wa_message_id,
    direction: row.direction,
    messageType: row.message_type as WhatsAppMessageType,
    mediaUrl: row.media_url,
    mediaMime: row.media_mime,
  });
}

export async function getWhatsAppContact(remoteJid: string) {
  return enrichWhatsAppContactProfile(remoteJid);
}

function normalizeWebhookPayload(body: Record<string, unknown>) {
  if (body.webhook && typeof body.webhook === "object") {
    return body.webhook as Record<string, unknown>;
  }
  if (body.data && typeof body.data === "object") {
    const nested = body.data as Record<string, unknown>;
    if (nested.event || nested.type) return nested;
  }
  return body;
}

function extractWebhookMessageRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    );
  }
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (record.key && record.message) return [record];
  if (Array.isArray(record.messages)) {
    return record.messages.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    );
  }
  return [record];
}

export async function handleWhatsAppWebhook(body: Record<string, unknown>) {
  const payload = normalizeWebhookPayload(body);
  const event = String(payload.event ?? payload.type ?? "").toLowerCase();
  const data = payload.data ?? payload;

  if (event.includes("connection")) {
    const state = String((data as { state?: string }).state ?? "").toLowerCase();
    if (state === "open") {
      await ensureEvolutionWebhookConfigured();
      const { config } = await readWhatsAppConfig("evolution");
      await setWhatsAppStatus("connected", {
        qr_code: null,
        provider: "evolution",
        connected_at: config.connected_at ?? new Date().toISOString(),
      });
    } else if (state === "close") {
      const { config } = await readWhatsAppConfig("evolution");
      const authPending =
        config.status === "pairing" ||
        config.status === "qr" ||
        config.status === "connecting" ||
        Boolean(config.qr_code);
      if (authPending) {
        return { ok: true, handled: "connection_close_ignored_auth" };
      }
      await setWhatsAppStatus("disconnected", {
        provider: "evolution",
        qr_code: null,
        phone_number: null,
        profile_name: null,
      });
    }
    return { ok: true, handled: "connection" };
  }

  if (event.includes("qrcode")) {
    const dataRecord = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const nested = (dataRecord.qrcode ?? dataRecord.qrCode) as Record<string, unknown> | undefined;
    const pairingFromEvent =
      parseEvolutionPairingCode(dataRecord) ?? parseEvolutionPairingCode(nested);

    if (pairingFromEvent) {
      const { config } = await readWhatsAppConfig("evolution");
      await setWhatsAppStatus("pairing", {
        qr_code: encodePairingCodeStorage(pairingFromEvent),
        provider: "evolution",
        phone_number: config.phone_number,
      });
      return { ok: true, handled: "pairing_code" };
    }

    const { config } = await readWhatsAppConfig("evolution");
    if (isPairingCodeStorage(config.qr_code) || config.status === "pairing") {
      return { ok: true, handled: "qrcode_ignored_pairing" };
    }

    const qr = String(
      (data as { qrcode?: string; base64?: string }).qrcode ??
        (data as { base64?: string }).base64 ??
        "",
    );
    await setWhatsAppStatus("qr", {
      qr_code: qr.startsWith("data:") ? qr : qr ? `data:image/png;base64,${qr}` : null,
      provider: "evolution",
    });
    return { ok: true, handled: "qrcode" };
  }

  if (event.includes("messages")) {
    const records = extractWebhookMessageRecords(data);
    let processed = 0;
    for (const record of records) {
      const result = await processIncomingWhatsAppRecord(record);
      if (result) processed += 1;
    }
    return { ok: true, handled: "messages", count: processed };
  }

  if (event.includes("chats")) {
    const records = Array.isArray(data) ? data : [data];
    const owner = await getInstanceOwner();
    const chatCutoff = await getWhatsAppMessageCutoff();
    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      const parsed = parseEvolutionChat(record as Record<string, unknown>);
      if (!parsed.remoteJid || parsed.isGroup || !isValidWhatsAppChatJid(parsed.remoteJid))
        continue;
      if (isOwnerJid(parsed.remoteJid, owner)) continue;
      if (parsed.lastMessageAt && new Date(parsed.lastMessageAt).getTime() < chatCutoff.getTime()) {
        continue;
      }
      await persistChatMirror({
        remoteJid: parsed.remoteJid,
        name: parsed.name,
        phone: parsed.phone,
        profilePicUrl: parsed.profilePicUrl,
        lastMessage: parsed.lastMessage,
        lastMessageAt: parsed.lastMessageAt,
        firstContactAt: parsed.lastMessageAt ?? undefined,
      });
    }
    return { ok: true, handled: "chats", count: records.length };
  }

  return { ok: true, ignored: true, event };
}

export async function createWhatsAppChatByPhone(phone: string, name?: string) {
  const remoteJid = phoneToJid(phone);
  if (!remoteJid) throw new Error("Telefone invalido.");
  const formattedPhone = jidToPhone(remoteJid) ?? phone;
  const now = new Date().toISOString();
  return upsertWhatsAppChat({
    remoteJid,
    phone: formattedPhone,
    name: name ?? formattedPhone,
    firstContactAt: now,
    lastMessage: WHATSAPP_DRAFT_CONVERSATION_MARKER,
    lastMessageAt: now,
  });
}

export async function getWhatsAppSetupInfo() {
  const { getEvolutionPublicConfig } = await import("@/lib/api/whatsapp-evolution.server");
  const webhookStatus = isEvolutionConfigured() ? await fetchEvolutionWebhookStatus() : null;
  if (isEvolutionConfigured() && !webhookStatus?.configured) {
    await ensureEvolutionWebhookConfigured();
  }
  const refreshed = isEvolutionConfigured() ? await fetchEvolutionWebhookStatus() : null;
  return {
    evolutionConfigured: isEvolutionConfigured(),
    evolution: getEvolutionPublicConfig(),
    schemaReady: await isWhatsAppSchemaReady(),
    webhookUrl: (await import("@/lib/api/whatsapp-evolution.server")).getPublicWebhookUrl(),
    webhookConfigured: refreshed?.configured ?? false,
    retentionDays: 7,
  };
}
