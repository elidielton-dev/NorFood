import path from "node:path";
import fs from "node:fs";
import QRCode from "qrcode";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type WAMessage,
  type Chat,
  type Contact,
} from "@whiskeysockets/baileys";
import { useMultiFileAuthState } from "@whiskeysockets/baileys";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { emitWebhook } from "./webhook.js";

export type ConnectionState = "connected" | "connecting" | "disconnected";

type SessionSnapshot = {
  connectionState: ConnectionState;
  qrCode: string | null;
  pairingCode: string | null;
  profileName: string | null;
  phoneNumber: string | null;
  ownerJid: string | null;
  lastAuthError: string | null;
};

let socket: WASocket | null = null;
let chatStore = new Map<string, Chat>();
let contactStore = new Map<string, Contact>();
let connectionState: ConnectionState = "disconnected";
let currentQrCode: string | null = null;
let currentPairingCode: string | null = null;
let profileName: string | null = null;
let phoneNumber: string | null = null;
let ownerJid: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let starting = false;
let pendingPairingPhone: string | null = null;
let messageStore = new Map<string, WAMessage[]>();
let wasEverConnected = false;
let awaitingFreshAuth = false;
let lastAuthError: string | null = null;
const boundSockets = new WeakSet<WASocket>();

function setAuthError(error: unknown) {
  lastAuthError = error instanceof Error ? error.message : String(error);
}

function clearAuthError() {
  lastAuthError = null;
}

function ensureAuthDir(authDir: string) {
  fs.mkdirSync(authDir, { recursive: true });
}

function mapBaileysConnection(connection?: string): ConnectionState {
  if (connection === "open") return "connected";
  if (connection === "connecting") return "connecting";
  return "disconnected";
}

function serializeMessage(msg: WAMessage) {
  return {
    key: msg.key,
    message: msg.message,
    messageTimestamp: msg.messageTimestamp,
    pushName: msg.pushName,
    messageType: Object.keys(msg.message ?? {})[0] ?? "unknown",
  };
}

function serializeChat(chat: Chat) {
  const remoteJid = chat.id ?? "";
  return {
    id: remoteJid,
    remoteJid,
    name: chat.name ?? null,
    pushName: chat.name ?? null,
    profilePicUrl: null,
    lastMessage: null,
    updatedAt: chat.conversationTimestamp,
    conversationTimestamp: chat.conversationTimestamp,
    unreadCount: chat.unreadCount ?? 0,
  };
}

function serializeContact(contact: Contact) {
  return {
    id: contact.id,
    remoteJid: contact.id,
    pushName: contact.notify ?? contact.name ?? contact.verifiedName ?? "",
    profilePicUrl: null,
    name: contact.name ?? contact.notify ?? null,
  };
}

async function buildQrDataUrl(raw: string) {
  if (!raw) return null;
  if (raw.startsWith("data:")) return raw;
  return QRCode.toDataURL(raw);
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(delayMs = 5000) {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startSession({ reconnect: true }).catch((error) => {
      setAuthError(error);
      logger.error({ error }, "reconnect failed");
    });
  }, delayMs);
}

function getDisconnectStatusCode(lastDisconnect: { error?: unknown } | undefined) {
  return (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
    ?.statusCode;
}

function hasRegisteredCredsOnDisk() {
  const { authDir } = getConfig();
  const credsPath = path.join(authDir, "creds.json");
  if (!fs.existsSync(credsPath)) return false;
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, "utf8")) as { registered?: boolean };
    return Boolean(creds.registered);
  } catch {
    return false;
  }
}

function reconnectImmediately() {
  clearReconnectTimer();
  connectionState = "connecting";
  void startSession({ reconnect: true }).catch((error) => {
    setAuthError(error);
    logger.error({ error }, "immediate reconnect failed");
  });
}

async function bindSocketEvents(sock: WASocket) {
  if (boundSockets.has(sock)) return;
  boundSockets.add(sock);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQrCode = await buildQrDataUrl(qr);
      currentPairingCode = null;
      await emitWebhook("QRCODE_UPDATED", {
        qrcode: currentQrCode,
        base64: currentQrCode,
      });
    }

    if (connection) {
      connectionState = mapBaileysConnection(connection);
      const state =
        connectionState === "connected"
          ? "open"
          : connectionState === "connecting"
            ? "connecting"
            : "close";

      await emitWebhook("CONNECTION_UPDATE", { state });

      if (connectionState === "connected") {
        wasEverConnected = true;
        awaitingFreshAuth = false;
        clearAuthError();
        currentQrCode = null;
        currentPairingCode = null;
        pendingPairingPhone = null;
        const { webhookUrl } = getConfig();
        logger.info(
          { webhookUrl: webhookUrl || "(not configured)" },
          "whatsapp connected — webhook target",
        );
        const user = sock.user;
        if (user) {
          ownerJid = user.id;
          phoneNumber = user.id.split(":")[0]?.split("@")[0] ?? null;
          profileName = user.name ?? profileName;
        }
      }

      if (connection === "close") {
        const statusCode = getDisconnectStatusCode(lastDisconnect);
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const restartRequired = statusCode === DisconnectReason.restartRequired;
        const hasCreds = hasRegisteredCredsOnDisk();

        socket = null;
        currentQrCode = null;
        currentPairingCode = null;

        if (restartRequired) {
          awaitingFreshAuth = false;
          clearAuthError();
          reconnectImmediately();
          return;
        }

        if (lastDisconnect?.error && awaitingFreshAuth) {
          setAuthError(lastDisconnect.error);
        }

        connectionState = "disconnected";

        if (loggedOut) {
          wasEverConnected = false;
          return;
        }

        if (
          hasCreds &&
          (statusCode === DisconnectReason.timedOut ||
            statusCode === DisconnectReason.connectionClosed)
        ) {
          awaitingFreshAuth = false;
          clearAuthError();
          reconnectImmediately();
          return;
        }

        if (!awaitingFreshAuth && wasEverConnected) {
          scheduleReconnect();
          return;
        }

        if (awaitingFreshAuth && hasCreds) {
          awaitingFreshAuth = false;
          clearAuthError();
          reconnectImmediately();
          return;
        }

        if (awaitingFreshAuth) {
          wasEverConnected = false;
        }
      }
    }
  });

  sock.ev.on("creds.update", async () => {
    // creds persisted by useMultiFileAuthState
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (!messages?.length) return;
    const records = messages.map(serializeMessage);
    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!jid) continue;
      const list = messageStore.get(jid) ?? [];
      list.unshift(msg);
      messageStore.set(jid, list.slice(0, 200));
    }
    if (type === "notify" || !type) {
      await emitWebhook("MESSAGES_UPSERT", { messages: records, type: type ?? "notify" });
    }
  });

  sock.ev.on("messages.update", async (updates) => {
    await emitWebhook("MESSAGES_UPDATE", updates);
  });

  sock.ev.on("chats.upsert", async (chats) => {
    for (const chat of chats) {
      if (chat.id) chatStore.set(chat.id, chat);
    }
    const records = chats.map(serializeChat);
    await emitWebhook("CHATS_UPSERT", records);
  });

  sock.ev.on("chats.update", async (updates) => {
    for (const chat of updates) {
      const id = (chat as Chat).id;
      if (id) {
        const prev = chatStore.get(id);
        chatStore.set(id, { ...prev, ...chat } as Chat);
      }
    }
    const records = updates.map((chat) => serializeChat(chat as Chat));
    if (records.length) await emitWebhook("CHATS_UPSERT", records);
  });

  sock.ev.on("contacts.upsert", async (contacts) => {
    for (const contact of contacts) {
      if (contact.id) contactStore.set(contact.id, contact);
    }
  });

  sock.ev.on("contacts.update", async (updates) => {
    for (const contact of updates) {
      const id = (contact as Contact).id;
      if (id) {
        const prev = contactStore.get(id);
        contactStore.set(id, { ...prev, ...contact } as Contact);
      }
    }
  });

  sock.ev.on("messaging-history.set", async ({ chats, contacts, messages }) => {
    for (const chat of chats ?? []) {
      if (chat.id) chatStore.set(chat.id, chat);
    }
    for (const contact of contacts ?? []) {
      if (contact.id) contactStore.set(contact.id, contact);
    }
    for (const msg of messages ?? []) {
      const jid = msg.key?.remoteJid;
      if (!jid) continue;
      const list = messageStore.get(jid) ?? [];
      list.unshift(msg);
      messageStore.set(jid, list.slice(0, 200));
    }
  });
}

export async function startSession(options: { reconnect?: boolean; pairingPhone?: string } = {}) {
  if (starting) {
    const deadline = Date.now() + 15_000;
    while (starting && Date.now() < deadline) {
      await delay(200);
    }
    return getSnapshot();
  }
  starting = true;

  try {
    const { authDir } = getConfig();
    ensureAuthDir(authDir);

    if (socket && connectionState === "connected" && !options.pairingPhone) {
      return getSnapshot();
    }

    if (socket) {
      try {
        socket.end(undefined);
      } catch {
        /* ignore */
      }
      socket = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    socket = sock;
    await bindSocketEvents(sock);
    sock.ev.on("creds.update", saveCreds);

    const pairingPhone = options.pairingPhone ?? pendingPairingPhone;
    if (pairingPhone && !state.creds.registered) {
      const digits = pairingPhone.replace(/\D/g, "");
      try {
        const code = await sock.requestPairingCode(digits);
        currentPairingCode = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        currentQrCode = null;
        await emitWebhook("QRCODE_UPDATED", {
          pairingCode: currentPairingCode,
          pairing_code: currentPairingCode,
        });
      } catch (error) {
        logger.error({ error, digits }, "pairing code request failed");
      }
    }

    connectionState = "connecting";
    return getSnapshot();
  } finally {
    starting = false;
  }
}

export function getSocket(): WASocket | null {
  return socket;
}

export function getSnapshot(): SessionSnapshot {
  return {
    connectionState,
    qrCode: currentQrCode,
    pairingCode: currentPairingCode,
    profileName,
    phoneNumber,
    ownerJid,
    lastAuthError,
  };
}

async function waitForAuthSnapshot(timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = getSnapshot();
    if (snap.qrCode || snap.pairingCode) return snap;
    if (snap.connectionState === "connected") return snap;
    if (snap.lastAuthError && snap.connectionState === "disconnected") return snap;
    await delay(400);
  }
  return getSnapshot();
}

async function startSessionWithTimeout(
  options: { reconnect?: boolean; pairingPhone?: string } = {},
  timeoutMs = 20_000,
) {
  clearAuthError();
  await Promise.race([
    startSession(options),
    delay(timeoutMs).then(() => {
      throw new Error("Timeout ao iniciar sessao WhatsApp no gateway.");
    }),
  ]);
}

export async function connectWithQr() {
  clearReconnectTimer();
  wasEverConnected = false;
  pendingPairingPhone = null;
  currentPairingCode = null;
  currentQrCode = null;
  await resetSession();
  awaitingFreshAuth = true;
  await delay(800);
  clearAuthError();
  void startSession({ reconnect: false }).catch((error) => {
    setAuthError(error);
    logger.error({ error }, "qr session start failed");
  });
  connectionState = "connecting";
  return getSnapshot();
}

export async function connectWithPairing(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) throw new Error("Telefone invalido para pairing.");
  clearReconnectTimer();
  wasEverConnected = false;
  pendingPairingPhone = digits;
  currentQrCode = null;
  await resetSession();
  awaitingFreshAuth = true;
  await delay(800);
  try {
    await startSessionWithTimeout({ reconnect: false, pairingPhone: digits });
  } catch (error) {
    setAuthError(error);
    throw error;
  }
  const snap = await waitForAuthSnapshot(8_000);
  if (snap.lastAuthError && !snap.pairingCode && !snap.qrCode) {
    throw new Error(snap.lastAuthError);
  }
  return snap;
}

export function getConnectionState(): ConnectionState {
  return connectionState;
}

export async function refreshPairingCode(phone: string) {
  return connectWithPairing(phone);
}

export async function logoutSession() {
  clearReconnectTimer();
  pendingPairingPhone = null;
  currentQrCode = null;
  currentPairingCode = null;

  if (socket) {
    try {
      await socket.logout();
    } catch {
      /* ignore */
    }
    try {
      socket.end(undefined);
    } catch {
      /* ignore */
    }
    socket = null;
  }

  connectionState = "disconnected";
  phoneNumber = null;
  profileName = null;
  ownerJid = null;
}

function clearAuthDirContents(authDir: string) {
  if (!fs.existsSync(authDir)) {
    ensureAuthDir(authDir);
    return;
  }
  for (const entry of fs.readdirSync(authDir)) {
    fs.rmSync(path.join(authDir, entry), { recursive: true, force: true });
  }
}

export async function resetSession() {
  awaitingFreshAuth = false;
  wasEverConnected = false;
  clearAuthError();
  await logoutSession();
  const { authDir } = getConfig();
  clearAuthDirContents(authDir);
  messageStore.clear();
  chatStore.clear();
  contactStore.clear();
  return getSnapshot();
}

export async function ensureReady() {
  if (connectionState === "connected" && socket) return getSnapshot();

  if (!socket) {
    await startSession({ reconnect: true });
  }

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (connectionState === "connected" && socket) return getSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  if (!socket) throw new Error("WhatsApp nao conectado.");
  if (connectionState !== "connected") {
    throw new Error("WhatsApp ainda conectando. Aguarde alguns segundos e tente novamente.");
  }

  return getSnapshot();
}

export function getStoredMessages(remoteJid: string, limit = 80) {
  const list = messageStore.get(remoteJid) ?? [];
  return list.slice(0, limit).map(serializeMessage);
}

export function getAllStoredMessages(limit = 120) {
  const all: ReturnType<typeof serializeMessage>[] = [];
  for (const list of messageStore.values()) {
    all.push(...list.map(serializeMessage));
  }
  return all
    .sort((a, b) => Number(b.messageTimestamp ?? 0) - Number(a.messageTimestamp ?? 0))
    .slice(0, limit);
}

export async function fetchChatsFromSocket() {
  if (!getSocket()) return [];
  return [...chatStore.values()].map((c) => serializeChat(c));
}

export async function fetchContactsFromSocket() {
  if (!getSocket()) return [];
  return [...contactStore.values()].map(serializeContact);
}

export function findStoredMessages(remoteJid: string, waMessageId: string) {
  const list = messageStore.get(remoteJid) ?? [];
  return list.find((msg) => msg.key?.id === waMessageId);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
