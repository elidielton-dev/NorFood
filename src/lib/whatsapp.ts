export type WhatsAppConnectionStatus =
  | "disconnected"
  | "qr"
  | "pairing"
  | "connecting"
  | "connected"
  | "demo";

export type WhatsAppConnectAuthMode = "qr" | "pairing";

export type WhatsAppMessageType = "text" | "image" | "audio" | "document" | "video" | "sticker";

export type WhatsAppMessageDirection = "inbound" | "outbound";

export type WhatsAppChat = {
  id: string;
  remoteJid: string;
  phone: string | null;
  name: string | null;
  profilePicUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  clienteId: string | null;
  isGroup: boolean;
  firstContactAt: string | null;
  inboxStatus: "open" | "pending" | "closed";
  attendanceOpenedAt: string | null;
  assignedAgentId: string | null;
  phoneVerifiedAt: string | null;
  profilePicPhoneDigits: string | null;
};

/** Dias de historico mantidos no painel (conversas e mensagens). */
export const WHATSAPP_RETENTION_DAYS = 7;

/** Marcador interno para conversa aberta pelo painel sem mensagens ainda. */
export const WHATSAPP_DRAFT_CONVERSATION_MARKER = "__draft_conversation__";

export function isWhatsAppDraftConversationPreview(message: string | null | undefined) {
  return message === WHATSAPP_DRAFT_CONVERSATION_MARKER;
}

export function whatsappRetentionCutoff() {
  return new Date(Date.now() - WHATSAPP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export type WhatsAppMessage = {
  id: string;
  chatId: string;
  remoteJid: string;
  waMessageId: string;
  direction: WhatsAppMessageDirection;
  messageType: WhatsAppMessageType;
  body: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  fileName: string | null;
  status: string;
  sentAt: string;
  replyToWaMessageId?: string | null;
  replyToText?: string | null;
  replyToFromMe?: boolean | null;
};

export type WhatsAppMessagesPayload = {
  messages: WhatsAppMessage[];
  chatId: string;
};

/** Modo da lista lateral: conversas recentes ou agenda completa. */
export type WhatsAppListMode = "conversations" | "agenda";

/** Tipo de sincronizacao com o gateway WhatsApp Web (Baileys). */
export type WhatsAppSyncMode = "none" | "search" | "full";

export type WhatsAppContactProfile = {
  remoteJid: string;
  phone: string | null;
  name: string | null;
  profilePicUrl: string | null;
  clienteId: string | null;
  clienteNome: string | null;
  clientePontos: number | null;
};

export type WhatsAppInboxState = {
  configured: boolean;
  provider: "baileys" | "evolution" | "demo";
  status: WhatsAppConnectionStatus;
  instanceName: string;
  phoneNumber: string | null;
  profileName: string | null;
  qrCode: string | null;
  /** Codigo de 8 caracteres para vincular pelo celular (WhatsApp Web). */
  pairingCode: string | null;
  /** Modo de autenticacao em andamento (QR ou codigo de vinculo). */
  connectMode: WhatsAppConnectAuthMode | null;
  /** Quando o codigo de vinculo foi gerado (ISO). */
  pairingIssuedAt: string | null;
  /** Telefone que estava na instancia WhatsApp Web antes do pairing (se houver). */
  evolutionOwnerPhone: string | null;
  /** Alias de evolutionOwnerPhone para gateway Baileys. */
  baileysOwnerPhone?: string | null;
  warning: string | null;
};

const PAIRING_STORAGE_PREFIX = "pairing:";

export const PAIRING_CODE_TTL_SECONDS = 55;

export function formatPairingCodeDisplay(code: string) {
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return code.trim().toUpperCase();
}

export function formatPairingCodePlain(code: string) {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function encodePairingCodeStorage(code: string) {
  return `${PAIRING_STORAGE_PREFIX}${code.trim()}`;
}

export function decodePairingCodeStorage(value: string | null | undefined) {
  if (!value?.startsWith(PAIRING_STORAGE_PREFIX)) return null;
  const code = value.slice(PAIRING_STORAGE_PREFIX.length).trim();
  return code || null;
}

export function isPairingCodeStorage(value: string | null | undefined) {
  return Boolean(decodePairingCodeStorage(value));
}

export function resolveConnectAuthMode(
  qrCodeStorage: string | null | undefined,
): WhatsAppConnectAuthMode | null {
  if (isPairingCodeStorage(qrCodeStorage)) return "pairing";
  if (qrCodeStorage?.trim()) return "qr";
  return null;
}

export function normalizeWhatsAppPhone(value: string) {
  return value.replace(/\D/g, "");
}

/** Limiar para considerar dois telefones como o mesmo contato. */
export const PHONE_SIMILARITY_THRESHOLD = 0.95;

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );

  for (let i = 0; i <= a.length; i += 1) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0]![j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

/** Normaliza celular BR (55 + DDD + 9 digitos) para comparar variantes com/sem nono digito. */
export function canonicalBrazilWhatsAppDigits(value: string) {
  let digits = normalizeWhatsAppPhone(value);
  if (!digits) return "";

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  if (!digits.startsWith("55") || digits.length < 12) return digits;

  const ddd = digits.slice(2, 4);
  let local = digits.slice(4);

  if (local.length === 8 && /^[6-9]/.test(local)) {
    local = `9${local}`;
  }

  return `55${ddd}${local}`;
}

export function phoneSimilarityScore(a: string, b: string) {
  const ca = canonicalBrazilWhatsAppDigits(a) || normalizeWhatsAppPhone(a);
  const cb = canonicalBrazilWhatsAppDigits(b) || normalizeWhatsAppPhone(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;

  const maxLen = Math.max(ca.length, cb.length);
  if (maxLen === 0) return 0;

  const dist = levenshteinDistance(ca, cb);
  return 1 - dist / maxLen;
}

export function phonesMatchLoosely(a: string, b: string, threshold = PHONE_SIMILARITY_THRESHOLD) {
  if (phoneSimilarityScore(a, b) >= threshold) return true;

  const da = normalizeWhatsAppPhone(a);
  const db = normalizeWhatsAppPhone(b);
  if (da.length >= 8 && db.length >= 8 && da.slice(-8) === db.slice(-8)) return true;

  return false;
}

export function formatWhatsAppPhone(value: string) {
  let digits = normalizeWhatsAppPhone(value);
  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/** Mascara enquanto digita: (87) 99999-9999 */
export function formatPhoneInput(value: string) {
  const digits = normalizeWhatsAppPhone(value).slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function jidToPhone(remoteJid: string) {
  if (remoteJid.endsWith("@lid")) return null;
  const base = remoteJid.split("@")[0] ?? "";
  if (!base || base.includes("-")) return null;
  return formatWhatsAppPhone(base);
}

export function phoneToJid(phone: string) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits || !looksLikeWhatsAppPhoneDigits(digits)) return "";
  const canonical = canonicalBrazilWhatsAppDigits(digits) || digits;
  return `${canonical}@s.whatsapp.net`;
}

/** Dígitos parecem telefone WhatsApp BR — nunca ID interno @lid (15+ dígitos). */
export function looksLikeWhatsAppPhoneDigits(value: string): boolean {
  const digits = normalizeWhatsAppPhone(value);
  if (!digits || digits.length < 10) return false;
  if (digits.length > 13) return false;
  if (digits.startsWith("55")) {
    return digits.length >= 12 && digits.length <= 13;
  }
  return digits.length >= 10 && digits.length <= 11;
}

/** JID @s.whatsapp.net canonico a partir de telefone formatado ou digitos. */
export function phoneJidFromPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const jid = phoneToJid(phone);
  return jid || null;
}

/** Telefone salvo nao pode ser o mesmo numero do ID @lid. */
export function isPhoneSameAsLidId(
  phone: string | null | undefined,
  lidJid: string | null | undefined,
) {
  if (!phone?.trim() || !lidJid?.endsWith("@lid")) return false;
  const lidDigits = lidJid.split("@")[0] ?? "";
  return normalizeWhatsAppPhone(phone) === lidDigits;
}

/** Extrai JID @s.whatsapp.net de uma message key (remoteJidAlt, senderPn, participant). */
export function extractPhoneJidFromMessageKey(key: Record<string, unknown>): string | null {
  const alt = String(key.remoteJidAlt ?? "");
  if (alt.endsWith("@s.whatsapp.net")) return alt;

  const participant = String(key.participant ?? "");
  if (participant.endsWith("@s.whatsapp.net")) return participant;

  const primary = String(key.remoteJid ?? "");
  if (primary.endsWith("@lid") && key.senderPn != null && String(key.senderPn).trim()) {
    const digits = normalizeWhatsAppPhone(String(key.senderPn));
    if (digits.length >= 10) return `${digits}@s.whatsapp.net`;
  }

  if (primary.endsWith("@s.whatsapp.net")) return primary;
  return null;
}

export function pickMessageRemoteJid(key: Record<string, unknown>) {
  const phoneJid = extractPhoneJidFromMessageKey(key);
  if (phoneJid) return phoneJid;

  const primary = String(key.remoteJid ?? "");
  const alt = String(key.remoteJidAlt ?? key.participant ?? "");
  return primary || alt;
}

export function toWhatsAppSendDigits(value: string) {
  const digits = normalizeWhatsAppPhone(value);
  if (digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

/** @deprecated use toWhatsAppSendDigits */
export const toEvolutionSendDigits = toWhatsAppSendDigits;

/** WhatsApp Web send: nunca usar digitos de @lid como telefone. */
export function resolveWhatsAppSendNumber(remoteJid: string, phone?: string | null) {
  if (remoteJid.endsWith("@s.whatsapp.net")) {
    return toWhatsAppSendDigits(remoteJid.split("@")[0] ?? "");
  }
  if (remoteJid.endsWith("@lid")) {
    return toWhatsAppSendDigits(phone ?? "");
  }
  return toWhatsAppSendDigits(phone ?? "");
}

/** @deprecated use resolveWhatsAppSendNumber */
export const resolveEvolutionSendNumber = resolveWhatsAppSendNumber;

/** Telefone confirmado manualmente ou via JID real @s.whatsapp.net. */
export function isChatPhoneTrusted(chat: {
  remoteJid: string;
  phone?: string | null;
  phoneVerifiedAt?: string | null;
}) {
  if (chat.phoneVerifiedAt) return true;
  if (!chat.phone?.trim()) return false;
  const phoneDigits = normalizeWhatsAppPhone(chat.phone);
  if (!looksLikeWhatsAppPhoneDigits(phoneDigits)) return false;
  if (chat.remoteJid.endsWith("@s.whatsapp.net")) {
    const jidDigits = normalizeWhatsAppPhone(chat.remoteJid.split("@")[0] ?? "");
    return Boolean(jidDigits && phonesMatchLoosely(jidDigits, phoneDigits));
  }
  return false;
}

export function isValidWhatsAppChatJid(remoteJid: string) {
  if (!remoteJid || remoteJid.endsWith("@g.us")) return false;
  if (remoteJid.endsWith("@broadcast") || remoteJid === "status@broadcast") return false;
  const base = remoteJid.split("@")[0] ?? "";
  if (!base || base === "0") return false;
  return remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
}

export function formatMessagePreview(type: WhatsAppMessageType, body: string | null) {
  if (type === "image") return body?.trim() ? `📷 ${body}` : "📷 Imagem";
  if (type === "audio") return "🎤 Audio";
  if (type === "document") return body?.trim() ? `📎 ${body}` : "📎 Arquivo";
  if (type === "video") return "🎬 Video";
  if (type === "sticker") return "📷 Imagem";
  return body?.trim() || "Mensagem";
}

/** URL criptografada do CDN WhatsApp — nao abre direto no navegador. */
export function isWhatsAppEncryptedMediaUrl(url: string | null | undefined) {
  if (!url) return false;
  return /mmg\.whatsapp\.net|\.enc(?:\?|$)|whatsapp\.net\/v\//i.test(url);
}

/** URL utilizavel em img/audio/video no painel (data URL ou HTTP publico). */
export function isDirectPlayableMediaUrl(url: string | null | undefined) {
  if (!url) return false;
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  if (!url.startsWith("http")) return false;
  return !isWhatsAppEncryptedMediaUrl(url);
}

export function formatChatTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
