import {
  fetchEvolutionChats,
  fetchEvolutionContacts,
  fetchEvolutionContactsQuery,
  fetchEvolutionMessages,
  fetchEvolutionProfile,
  fetchEvolutionRecentMessages,
} from "@/lib/api/atendimento/whatsapp-baileys.server";
import {
  extractPhoneJidFromMessageKey,
  jidToPhone,
  normalizeWhatsAppPhone,
  phoneToJid,
  toEvolutionSendDigits,
} from "@/lib/atendimento/whatsapp";

export type CustomerIdentity = {
  remoteJid: string;
  phone: string | null;
  name: string | null;
  profilePicUrl: string | null;
};

type InstanceOwner = {
  digits: string;
  jid: string;
  name: string | null;
};

let ownerCache: InstanceOwner | null = null;
let contactsCache: { data: unknown[]; fetchedAt: number } | null = null;
const CONTACTS_CACHE_TTL_MS = 60_000;

export async function fetchEvolutionContactsCached(force = false) {
  if (!force && contactsCache && Date.now() - contactsCache.fetchedAt < CONTACTS_CACHE_TTL_MS) {
    return contactsCache.data;
  }
  const data = await fetchEvolutionContacts();
  contactsCache = { data, fetchedAt: Date.now() };
  return data;
}

export function clearEvolutionContactsCache() {
  contactsCache = null;
}

export async function getInstanceOwner(): Promise<InstanceOwner | null> {
  if (ownerCache) return ownerCache;
  const profile = await fetchEvolutionProfile();
  const digits = normalizeWhatsAppPhone(profile.phoneNumber ?? "");
  if (!digits) return null;
  ownerCache = {
    digits,
    jid: `${digits}@s.whatsapp.net`,
    name: profile.profileName ?? null,
  };
  return ownerCache;
}

export function isOwnerJid(remoteJid: string, owner: InstanceOwner | null) {
  if (!owner || !remoteJid) return false;
  const digits = normalizeWhatsAppPhone(remoteJid.split("@")[0] ?? "");
  return digits === owner.digits;
}

export function isOwnerName(name: string | null | undefined, owner: InstanceOwner | null) {
  if (!name?.trim() || !owner?.name?.trim()) return false;
  return name.trim().toLowerCase() === owner.name.trim().toLowerCase();
}

/** Remove nomes invalidos (loja, telefone cru, vazio). */
export function sanitizeCustomerName(
  name: string | null | undefined,
  owner: InstanceOwner | null,
  phone?: string | null,
) {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.toLowerCase() === "contato") return null;
  if (isOwnerName(trimmed, owner)) return null;
  const phoneDigits = phone ? normalizeWhatsAppPhone(phone) : "";
  if (phoneDigits && normalizeWhatsAppPhone(trimmed) === phoneDigits) return null;
  return trimmed;
}

/** Escolhe o melhor nome para exibir/gravar no chat. */
export function pickChatDisplayName(input: {
  existing?: string | null;
  incoming?: string | null;
  phone?: string | null;
  owner?: InstanceOwner | null;
}) {
  const owner = input.owner ?? null;
  const phone = input.phone ?? null;
  const existing = sanitizeCustomerName(input.existing, owner, phone);
  const incoming = sanitizeCustomerName(input.incoming, owner, phone);

  if (existing && incoming) {
    const existingIsPhone =
      phone && normalizeWhatsAppPhone(existing) === normalizeWhatsAppPhone(phone);
    const incomingIsPhone =
      phone && normalizeWhatsAppPhone(incoming) === normalizeWhatsAppPhone(phone);
    if (existingIsPhone && !incomingIsPhone) return incoming;
    if (incomingIsPhone && !existingIsPhone) return existing;
    return existing.length >= incoming.length ? existing : incoming;
  }

  return existing ?? incoming ?? phone;
}

function pickCustomerName(
  owner: InstanceOwner | null,
  contacts: unknown[],
  jid: string,
  options: {
    inboundPushName?: string | null;
    preferredName?: string | null;
    phone?: string | null;
  },
) {
  const phone = options.phone ?? jidToPhone(jid);
  const fromAgenda = sanitizeCustomerName(findContactByJid(contacts, jid)?.pushName, owner, phone);
  if (fromAgenda) return fromAgenda;

  const fromInbound = sanitizeCustomerName(options.inboundPushName, owner, phone);
  if (fromInbound) return fromInbound;

  if (jid.endsWith("@lid")) {
    return sanitizeCustomerName(options.preferredName, owner, phone);
  }

  return null;
}

function findContactByJid(
  contacts: unknown[],
  remoteJid: string,
): { pushName: string; profilePicUrl: string | null } | null {
  for (const raw of contacts) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (String(row.remoteJid ?? "") !== remoteJid) continue;
    return {
      pushName: String(row.pushName ?? "").trim(),
      profilePicUrl: typeof row.profilePicUrl === "string" ? row.profilePicUrl : null,
    };
  }
  return null;
}

export async function findCustomerJidFromLidMessages(lidJid: string, owner: InstanceOwner | null) {
  const lidId = lidJid.split("@")[0] ?? "";

  const scan = (messages: unknown[]) => {
    for (const raw of messages) {
      if (!raw || typeof raw !== "object") continue;
      const key = ((raw as Record<string, unknown>).key ?? {}) as Record<string, unknown>;
      const primary = String(key.remoteJid ?? "");
      const alt = String(key.remoteJidAlt ?? "");
      if (
        lidId &&
        !primary.includes(lidId) &&
        !alt.includes(lidId) &&
        primary !== lidJid &&
        alt !== lidJid
      ) {
        continue;
      }
      const phoneJid = extractPhoneJidFromMessageKey(key);
      if (phoneJid && !isOwnerJid(phoneJid, owner)) return phoneJid;
    }
    return null;
  };

  try {
    const direct = await fetchEvolutionMessages(lidJid, 120);
    return scan(direct);
  } catch {
    // ignore
  }

  return null;
}

function findPhoneJidInRecord(record: Record<string, unknown>): string | null {
  for (const value of Object.values(record)) {
    if (typeof value === "string" && value.endsWith("@s.whatsapp.net")) {
      return value;
    }
  }

  for (const value of Object.values(record)) {
    if (typeof value !== "string") continue;
    const digits = toEvolutionSendDigits(value);
    if (digits && value.replace(/\D/g, "").length >= 10 && value.length <= 20) {
      return `${digits}@s.whatsapp.net`;
    }
  }

  return null;
}

export async function findCustomerJidFromLidContactQuery(
  lidJid: string,
  owner: InstanceOwner | null,
) {
  try {
    const rows = await fetchEvolutionContactsQuery({ remoteJid: lidJid });
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") continue;
      const phoneJid = findPhoneJidInRecord(raw as Record<string, unknown>);
      if (phoneJid && !isOwnerJid(phoneJid, owner)) return phoneJid;
    }
  } catch {
    // ignore
  }
  return null;
}

function normalizeContactName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function namesMatchLoosely(a: string, b: string) {
  const left = normalizeContactName(a);
  const right = normalizeContactName(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftParts = left.split(/\s+/).filter((part) => part.length >= 2);
  const rightParts = right.split(/\s+/).filter((part) => part.length >= 2);
  if (leftParts.length === 0 || rightParts.length === 0) return false;

  const [shorter, longer] =
    leftParts.length <= rightParts.length ? [leftParts, rightParts] : [rightParts, leftParts];
  return shorter.every((part) =>
    longer.some((candidate) => candidate.includes(part) || part.includes(candidate)),
  );
}

/** Match exato de nome na agenda Evolution — evita vincular @lid ao telefone de homonimo. */
export function findPhoneContactByDisplayName(
  contacts: unknown[],
  name: string,
  owner: InstanceOwner | null,
): CustomerIdentity | null {
  return findContactByNameExact(contacts, name, owner);
}

function findPhoneJidByLidContactPair(
  contacts: unknown[],
  lidJid: string,
  owner: InstanceOwner | null,
): string | null {
  let lidName: string | null = null;
  for (const raw of contacts) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (String(row.remoteJid ?? "") !== lidJid) continue;
    lidName = String(row.pushName ?? "").trim() || null;
    break;
  }
  if (!lidName) return null;

  const match = findPhoneContactByDisplayName(contacts, lidName, owner);
  return match?.remoteJid ?? null;
}

/** Nome salvo na agenda Evolution para um JID @lid. */
export function resolveLidContactPushName(contacts: unknown[], lidJid: string) {
  for (const raw of contacts) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (String(row.remoteJid ?? "") !== lidJid) continue;
    return String(row.pushName ?? "").trim() || null;
  }
  return null;
}

export { findPhoneJidByLidContactPair };

export async function findEvolutionChatIdentityForLid(lidJid: string) {
  if (!lidJid.endsWith("@lid")) return null;
  try {
    const chats = await fetchEvolutionChats();
    const lidId = lidJid.split("@")[0] ?? "";

    for (const raw of chats) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const remoteJid = String(row.remoteJid ?? row.id ?? "");
      if (remoteJid !== lidJid && !(lidId && remoteJid.includes(lidId))) continue;

      let phoneJid: string | null = null;
      for (const value of Object.values(row)) {
        if (typeof value === "string" && value.endsWith("@s.whatsapp.net")) {
          phoneJid = value;
          break;
        }
      }

      const pushName = String(row.name ?? row.pushName ?? "").trim() || null;
      return { phoneJid, pushName };
    }
  } catch {
    // ignore
  }
  return null;
}

/** Resolve telefone vinculado a um @lid na lista de chats Evolution (somente match pelo lid). */
export async function findPhoneJidFromEvolutionChats(lidJid: string, _name?: string | null) {
  const identity = await findEvolutionChatIdentityForLid(lidJid);
  return identity?.phoneJid ?? null;
}

/** Puxa telefone real de contato @lid na Evolution e grava no chat. */
export async function pullRealPhoneForLidChat(
  chatId: string,
  lidJid: string,
  name?: string | null,
): Promise<RealPhoneResolution | null> {
  const { getWhatsAppChatById, updateChatIdentityInPlace } =
    await import("@/lib/api/atendimento/whatsapp-store.server");
  const existing = await getWhatsAppChatById(chatId);
  const lidDigits = lidJid.split("@")[0] ?? "";
  if (existing?.phone && lidDigits && normalizeWhatsAppPhone(existing.phone) === lidDigits) {
    await updateChatIdentityInPlace(chatId, { phone: null });
  }

  clearEvolutionContactsCache();
  const resolved = await resolveRealPhoneJid({
    remoteJid: lidJid,
    chatId,
    preferredName: name,
    forceRefresh: true,
  });

  if (!resolved.sendViaLid && resolved.phone) {
    await updateChatIdentityInPlace(chatId, { phone: resolved.phone });
    return resolved;
  }

  return null;
}

/** Busca contato com telefone real na agenda Evolution (somente nome exato). */
export async function resolveAgendaPhoneContact(name: string | null | undefined) {
  const term = name?.trim();
  if (!term || term.length < 2) return null;

  const owner = await getInstanceOwner();
  const contacts = await fetchEvolutionContactsCached(true);
  return findContactByNameExact(contacts, term, owner);
}

function findContactByNameExact(
  contacts: unknown[],
  name: string,
  owner: InstanceOwner | null,
): CustomerIdentity | null {
  const term = name.trim().toLowerCase();
  if (!term || term === "contato") return null;
  if (isOwnerName(name, owner)) return null;

  for (const raw of contacts) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const remoteJid = String(row.remoteJid ?? "");
    const pushName = String(row.pushName ?? "").trim();
    if (!remoteJid.endsWith("@s.whatsapp.net") || !pushName) continue;
    if (isOwnerJid(remoteJid, owner)) continue;
    if (pushName.toLowerCase() === term) {
      return {
        remoteJid,
        phone: jidToPhone(remoteJid),
        name: pushName,
        profilePicUrl: typeof row.profilePicUrl === "string" ? row.profilePicUrl : null,
      };
    }
  }
  return null;
}

export type RealPhoneResolution = {
  remoteJid: string;
  phone: string | null;
  sendViaLid: boolean;
  source:
    | "direct"
    | "remoteJidAlt"
    | "senderPn"
    | "chatMessages"
    | "savedPhone"
    | "contactName"
    | "contactNameLoose"
    | "lidContactPair"
    | "evolutionChats"
    | "unresolved";
};

/** Resolve telefone real via Evolution — nunca por nome parcial. */
export async function resolveRealPhoneJid(input: {
  remoteJid: string;
  phone?: string | null;
  chatId?: string;
  contacts?: unknown[];
  preferredName?: string | null;
  forceRefresh?: boolean;
}): Promise<RealPhoneResolution> {
  const owner = await getInstanceOwner();

  if (input.remoteJid.endsWith("@s.whatsapp.net") && !isOwnerJid(input.remoteJid, owner)) {
    return {
      remoteJid: input.remoteJid,
      phone: jidToPhone(input.remoteJid),
      sendViaLid: false,
      source: "direct",
    };
  }

  if (input.remoteJid.endsWith("@lid")) {
    const fromEvolution = await findCustomerJidFromLidMessages(input.remoteJid, owner);
    if (fromEvolution) {
      return {
        remoteJid: fromEvolution,
        phone: jidToPhone(fromEvolution),
        sendViaLid: false,
        source: "remoteJidAlt",
      };
    }

    const fromContactQuery = await findCustomerJidFromLidContactQuery(input.remoteJid, owner);
    if (fromContactQuery) {
      return {
        remoteJid: fromContactQuery,
        phone: jidToPhone(fromContactQuery),
        sendViaLid: false,
        source: "remoteJidAlt",
      };
    }

    if (input.chatId) {
      const { resolvePhoneFromChatMessages } = await import("@/lib/api/atendimento/whatsapp-store.server");
      const digits = await resolvePhoneFromChatMessages(input.chatId);
      if (digits) {
        const jid = `${digits}@s.whatsapp.net`;
        if (!isOwnerJid(jid, owner)) {
          return {
            remoteJid: jid,
            phone: jidToPhone(jid),
            sendViaLid: false,
            source: "chatMessages",
          };
        }
      }
    }

    if (input.phone) {
      const phoneDigits = normalizeWhatsAppPhone(input.phone);
      const lidDigits = input.remoteJid.split("@")[0] ?? "";
      if (!phoneDigits || phoneDigits === lidDigits) {
        // ignora telefone salvo que na verdade e o ID @lid
      } else {
        const jid = phoneToJid(input.phone);
        if (jid && !isOwnerJid(jid, owner)) {
          return {
            remoteJid: jid,
            phone: jidToPhone(jid),
            sendViaLid: false,
            source: "savedPhone",
          };
        }
      }
    }

    const fromChats = await findPhoneJidFromEvolutionChats(input.remoteJid, input.preferredName);
    if (fromChats && !isOwnerJid(fromChats, owner)) {
      return {
        remoteJid: fromChats,
        phone: jidToPhone(fromChats),
        sendViaLid: false,
        source: "evolutionChats",
      };
    }

    return {
      remoteJid: input.remoteJid,
      phone: null,
      sendViaLid: false,
      source: "unresolved",
    };
  }

  if (input.phone) {
    const jid = phoneToJid(input.phone);
    if (jid && !isOwnerJid(jid, owner)) {
      return {
        remoteJid: jid,
        phone: jidToPhone(jid),
        sendViaLid: false,
        source: "savedPhone",
      };
    }
  }

  return {
    remoteJid: input.remoteJid,
    phone: jidToPhone(input.remoteJid),
    sendViaLid: false,
    source: "unresolved",
  };
}

/** Resolve o JID/telefone real do CLIENTE — nunca o numero da instancia conectada. */
export async function resolveCustomerIdentity(input: {
  remoteJid: string;
  remoteJidAlt?: string | null;
  pushName?: string | null;
  isInbound?: boolean;
  preferredName?: string | null;
  phone?: string | null;
  contacts?: unknown[];
}): Promise<CustomerIdentity> {
  const owner = await getInstanceOwner();
  const contacts = input.contacts ?? (await fetchEvolutionContactsCached());
  const preferredName = sanitizeCustomerName(input.preferredName, owner);

  const alt = input.remoteJidAlt?.endsWith("@s.whatsapp.net") ? input.remoteJidAlt : null;
  if (alt && !isOwnerJid(alt, owner)) {
    const contact = findContactByJid(contacts, alt);
    return {
      remoteJid: alt,
      phone: jidToPhone(alt),
      name: pickCustomerName(owner, contacts, alt, {
        inboundPushName: input.isInbound ? input.pushName : null,
        preferredName,
        phone: jidToPhone(alt),
      }),
      profilePicUrl: contact?.profilePicUrl ?? null,
    };
  }

  if (input.remoteJid.endsWith("@s.whatsapp.net") && !isOwnerJid(input.remoteJid, owner)) {
    const contact = findContactByJid(contacts, input.remoteJid);
    return {
      remoteJid: input.remoteJid,
      phone: jidToPhone(input.remoteJid),
      name: pickCustomerName(owner, contacts, input.remoteJid, {
        inboundPushName: input.isInbound ? input.pushName : null,
        preferredName: null,
        phone: jidToPhone(input.remoteJid),
      }),
      profilePicUrl: contact?.profilePicUrl ?? null,
    };
  }

  if (input.remoteJid.endsWith("@lid")) {
    const lidContact = findContactByJid(contacts, input.remoteJid);
    const nameHint =
      preferredName ??
      sanitizeCustomerName(lidContact?.pushName, owner) ??
      (input.isInbound ? sanitizeCustomerName(input.pushName, owner) : null);

    const resolved = await resolveRealPhoneJid({
      remoteJid: input.remoteJid,
      phone: input.phone,
      contacts,
    });

    if (!resolved.sendViaLid && resolved.remoteJid.endsWith("@s.whatsapp.net")) {
      const contact = findContactByJid(contacts, resolved.remoteJid);
      return {
        remoteJid: resolved.remoteJid,
        phone: resolved.phone,
        name: pickCustomerName(owner, contacts, resolved.remoteJid, {
          inboundPushName: input.isInbound ? input.pushName : null,
          preferredName: nameHint,
          phone: resolved.phone,
        }),
        profilePicUrl: contact?.profilePicUrl ?? null,
      };
    }
  }

  if (preferredName) {
    const byName = findContactByNameExact(contacts, preferredName, owner);
    if (byName) return byName;
  }

  return {
    remoteJid: input.remoteJid,
    phone: jidToPhone(input.remoteJid),
    name: pickCustomerName(owner, contacts, input.remoteJid, {
      inboundPushName: input.isInbound ? input.pushName : null,
      preferredName,
      phone: jidToPhone(input.remoteJid),
    }),
    profilePicUrl: null,
  };
}

export async function resolveCustomerIdentityForChat(
  chat: {
    remoteJid: string;
    name?: string | null;
    phone?: string | null;
  },
  contacts?: unknown[],
): Promise<CustomerIdentity> {
  const owner = await getInstanceOwner();
  const safePreferred =
    chat.remoteJid.endsWith("@s.whatsapp.net") && !isOwnerJid(chat.remoteJid, owner)
      ? null
      : sanitizeCustomerName(chat.name, owner, chat.phone);

  if (chat.remoteJid.endsWith("@s.whatsapp.net") && !isOwnerJid(chat.remoteJid, owner)) {
    return resolveCustomerIdentity({
      remoteJid: chat.remoteJid,
      phone: chat.phone,
      isInbound: true,
      contacts,
    });
  }

  if (isOwnerJid(chat.remoteJid, owner)) {
    if (safePreferred) {
      const byName = await resolveCustomerIdentity({
        remoteJid: chat.remoteJid,
        preferredName: safePreferred,
        phone: chat.phone,
        isInbound: true,
        contacts,
      });
      if (!isOwnerJid(byName.remoteJid, owner)) return byName;
    }
    throw new Error(
      "Conversa vinculada ao numero da loja. Busque o cliente pelo nome ou telefone.",
    );
  }

  return resolveCustomerIdentity({
    remoteJid: chat.remoteJid,
    preferredName: safePreferred,
    phone: chat.phone,
    isInbound: true,
    contacts,
  });
}

export async function assertNotOwnerSendTarget(number: string) {
  const owner = await getInstanceOwner();
  const digits = normalizeWhatsAppPhone(number);
  if (owner && digits === owner.digits) {
    throw new Error("Destino invalido: nao e possivel enviar para o proprio numero da loja.");
  }
}
