import https from "node:https";
import http from "node:http";
import {
  jidToPhone,
  normalizeWhatsAppPhone,
  phoneJidFromPhone,
  phonesMatchLoosely,
  toWhatsAppSendDigits,
} from "@/lib/atendimento/whatsapp";

type GatewayRequestInit = {
  method?: string;
  body?: unknown;
};

type BaileysConfig = {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  enabled: boolean;
};

function getBaileysConfig(): BaileysConfig {
  const isDev = process.env.NODE_ENV !== "production";
  let baseUrl = (process.env.WHATSAPP_GATEWAY_URL ?? "").replace(/\/$/, "");
  let apiKey = process.env.WHATSAPP_GATEWAY_KEY ?? "";
  const instanceName = (
    process.env.WHATSAPP_INSTANCE_NAME ??
    process.env.EVOLUTION_INSTANCE_NAME ??
    "norfood"
  ).trim();

  if (!baseUrl && isDev) {
    baseUrl = "http://127.0.0.1:8090";
  }
  if (!apiKey && isDev) {
    apiKey = "norfood-dev-gateway";
  }

  return {
    baseUrl,
    apiKey,
    instanceName,
    enabled: Boolean(baseUrl && (isDev || Boolean(apiKey))),
  };
}

export function isBaileysConfigured() {
  return getBaileysConfig().enabled;
}

/** @deprecated use isBaileysConfigured */
export const isEvolutionConfigured = isBaileysConfigured;

export function getBaileysInstanceName() {
  return getBaileysConfig().instanceName;
}

export function getEvolutionInstanceName() {
  return getBaileysInstanceName();
}

export function getBaileysPublicConfig() {
  const config = getBaileysConfig();
  return {
    baseUrl: config.baseUrl,
    instanceName: config.instanceName,
    pathPrefix: "/",
    insecureSsl: false,
    skipCreate: false,
    configured: config.enabled,
  };
}

export function getEvolutionPublicConfig() {
  return getBaileysPublicConfig();
}

export function getPublicWebhookUrl() {
  const explicit = process.env.WHATSAPP_WEBHOOK_URL ?? process.env.PUBLIC_APP_URL ?? "";
  if (explicit) {
    return explicit.endsWith("/api/whatsapp/webhook")
      ? explicit
      : `${explicit.replace(/\/$/, "")}/api/whatsapp/webhook`;
  }
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}/api/whatsapp/webhook`;
  const port = process.env.PORT ?? process.env.VITE_DEV_PORT ?? "8083";
  return `http://localhost:${port}/api/whatsapp/webhook`;
}

function collectAllowedWebhookKeys() {
  const keys = new Set<string>();
  for (const raw of [
    process.env.WHATSAPP_GATEWAY_KEY,
    process.env.WHATSAPP_WEBHOOK_SECRET,
    process.env.EVOLUTION_WEBHOOK_SECRET,
    process.env.EVOLUTION_API_KEY,
  ]) {
    if (!raw?.trim()) continue;
    for (const part of raw.split(",")) {
      const key = part.trim();
      if (key) keys.add(key);
    }
  }
  return keys;
}

function getRequestApiKey(request: Request) {
  return (
    request.headers.get("apikey")?.trim() ??
    request.headers.get("x-api-key")?.trim() ??
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ??
    ""
  );
}

export function isBaileysWebhookAuthorized(request: Request, body?: Record<string, unknown>) {
  const allowed = collectAllowedWebhookKeys();
  const headerKey = getRequestApiKey(request);
  if (headerKey && allowed.has(headerKey)) return true;

  const record = body ?? {};
  const bodyKey = String(record.apikey ?? "").trim();
  if (bodyKey && allowed.has(bodyKey)) return true;

  if (allowed.size === 0) return process.env.NODE_ENV !== "production";
  return false;
}

export const isEvolutionWebhookAuthorized = isBaileysWebhookAuthorized;

function buildGatewayUrl(path: string) {
  const { baseUrl } = getBaileysConfig();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

function requestJson<T>(url: string, init: GatewayRequestInit, timeoutMs = 6000): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = init.body ? JSON.stringify(init.body) : "";
    const config = getBaileysConfig();
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method ?? (init.body ? "POST" : "GET"),
        headers: {
          "Content-Type": "application/json",
          apikey: config.apiKey,
          Authorization: `Bearer ${config.apiKey}`,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          clearTimeout(timer);
          const raw = Buffer.concat(chunks).toString("utf8");
          let body: unknown = {};
          if (raw) {
            try {
              body = JSON.parse(raw) as unknown;
            } catch {
              body = { error: raw };
            }
          }
          if (res.statusCode && res.statusCode >= 400) {
            const record = body as Record<string, unknown>;
            reject(new Error(String(record.error ?? raw ?? `HTTP ${res.statusCode}`)));
            return;
          }
          resolve(body as T);
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`WhatsApp gateway timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function gatewayFetch<T>(path: string, init: GatewayRequestInit = {}, timeoutMs = 6000) {
  return requestJson<T>(buildGatewayUrl(path), init, timeoutMs);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type BaileysConnectPayload = {
  qrCode: string | null;
  pairingCode: string | null;
};

export type EvolutionConnectPayload = BaileysConnectPayload;

function normalizePairingCodeValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return clean.length === 8 ? clean : null;
}

export function parseBaileysPairingCode(payload: unknown): string | null {
  return parseBaileysConnectPayload(payload).pairingCode;
}

export const parseEvolutionPairingCode = parseBaileysPairingCode;

function normalizeQrCodeValue(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (raw.startsWith("data:")) return raw;
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 80) {
    return `data:image/png;base64,${raw}`;
  }
  return null;
}

export function parseBaileysSnapshotError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const raw = row.lastAuthError ?? row.last_auth_error ?? row.error;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

function parseBaileysConnectPayload(payload: unknown): BaileysConnectPayload {
  if (!payload || typeof payload !== "object") {
    return { qrCode: null, pairingCode: null };
  }
  const row = payload as Record<string, unknown>;
  const pairingCode =
    normalizePairingCodeValue(row.pairingCode) ??
    normalizePairingCodeValue(row.pairing_code) ??
    null;
  const qrCode =
    normalizeQrCodeValue(row.qrcode) ??
    normalizeQrCodeValue(row.base64) ??
    normalizeQrCodeValue(row.qrCode) ??
    null;
  return { qrCode, pairingCode };
}

export async function ensureBaileysInstance() {
  await gatewayFetch("/session/start", { method: "POST" }).catch(() => undefined);
}

export const ensureEvolutionInstance = ensureBaileysInstance;

export async function ensureBaileysWebhookConfigured() {
  return { configured: Boolean(getPublicWebhookUrl()) };
}

export const ensureEvolutionWebhookConfigured = ensureBaileysWebhookConfigured;

export async function fetchBaileysWebhookStatus() {
  const url = getPublicWebhookUrl();
  return { configured: Boolean(url), url };
}

export const fetchEvolutionWebhookStatus = fetchBaileysWebhookStatus;

export async function fetchBaileysInstanceMeta() {
  const instanceName = getBaileysInstanceName();
  try {
    const [connection, profile] = await Promise.all([
      gatewayFetch<{ state?: string; instance?: { state?: string } }>("/connection"),
      gatewayFetch<{ profileName?: string; phoneNumber?: string; ownerJid?: string }>("/profile"),
    ]);
    const state = String(connection.instance?.state ?? connection.state ?? "").toLowerCase();
    const ownerRaw = String(profile.ownerJid ?? profile.phoneNumber ?? "").split("@")[0] ?? "";
    return {
      instanceName,
      state: state || null,
      ownerPhoneDigits: ownerRaw ? normalizeWhatsAppPhone(ownerRaw) : null,
      integration: "WHATSAPP-BAILEYS",
    };
  } catch {
    return {
      instanceName,
      state: null,
      ownerPhoneDigits: null,
      integration: "WHATSAPP-BAILEYS",
    };
  }
}

export const fetchEvolutionInstanceMeta = fetchBaileysInstanceMeta;

export async function deleteBaileysInstance() {
  await gatewayFetch("/reset", { method: "POST" });
}

export const deleteEvolutionInstance = deleteBaileysInstance;

export async function resetBaileysInstanceSession() {
  await gatewayFetch("/reset", { method: "POST" });
  await delay(1500);
  return fetchBaileysConnectionState();
}

export const resetEvolutionInstanceSession = resetBaileysInstanceSession;

export async function forceDisconnectBaileysInstance() {
  await gatewayFetch("/logout", { method: "POST" });
  await delay(1000);
  await gatewayFetch("/reset", { method: "POST" });
  await delay(1000);
  return fetchBaileysConnectionState();
}

export const forceDisconnectEvolutionInstance = forceDisconnectBaileysInstance;

export async function ensureBaileysReadyForAuth() {
  await ensureBaileysInstance();
  const state = await fetchBaileysConnectionState();
  if (state === "disconnected") return state;
  await gatewayFetch("/logout", { method: "POST" }).catch(() => undefined);
  await delay(2000);
  return fetchBaileysConnectionState();
}

export const ensureEvolutionReadyForAuth = ensureBaileysReadyForAuth;

export async function snapshotBaileysPairingCode() {
  const payload = await gatewayFetch<{ pairingCode?: string }>("/connect/pairing/snapshot");
  return parseBaileysPairingCode(payload);
}

export const snapshotEvolutionPairingCode = snapshotBaileysPairingCode;

let lastPairingNudgeAt = 0;

export async function nudgeBaileysPairingCode(digits: string): Promise<string | null> {
  const now = Date.now();
  if (now - lastPairingNudgeAt < 12_000) {
    return snapshotBaileysPairingCode();
  }
  lastPairingNudgeAt = now;
  const payload = await gatewayFetch<{ pairingCode?: string }>("/connect/pairing/refresh", {
    method: "POST",
    body: { phone: digits },
  });
  return parseBaileysPairingCode(payload);
}

export const nudgeEvolutionPairingCode = nudgeBaileysPairingCode;

export async function requestBaileysPairingCode(digits: string): Promise<BaileysConnectPayload> {
  const live = await fetchBaileysConnectionState();
  if (live === "connected") return { qrCode: null, pairingCode: null };

  if (live !== "disconnected") {
    await resetBaileysInstanceSession();
    await delay(1500);
  }

  const payload = await gatewayFetch<unknown>("/connect/pairing", {
    method: "POST",
    body: { phone: digits },
  }, 20_000);

  const parsed = parseBaileysConnectPayload(payload);
  if (parsed.pairingCode) return parsed;

  for (let i = 0; i < 6; i += 1) {
    await delay(2000);
    const code = await snapshotBaileysPairingCode();
    if (code) return { qrCode: null, pairingCode: code };
  }

  return { qrCode: null, pairingCode: null };
}

export const requestEvolutionPairingCode = requestBaileysPairingCode;

export async function fetchBaileysConnect(phone?: string | null): Promise<BaileysConnectPayload> {
  const digits = phone?.trim() ? toWhatsAppSendDigits(phone) || normalizeWhatsAppPhone(phone) : "";
  if (digits) return requestBaileysPairingCode(digits);

  const payload = await gatewayFetch<unknown>("/connect/qr", { method: "POST" }, 20_000);
  return parseBaileysConnectPayload(payload);
}

export const fetchEvolutionConnect = fetchBaileysConnect;

export async function triggerBaileysQrSession(): Promise<BaileysConnectPayload> {
  const live = await fetchBaileysConnectionState();
  if (live === "connected") {
    throw new Error("WhatsApp ja conectado. Clique em Desconectar antes de gerar um novo QR.");
  }

  try {
    await gatewayFetch<unknown>("/connect/qr", { method: "POST" }, 8_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao iniciar QR no gateway.";
    throw new Error(message);
  }

  return { qrCode: null, pairingCode: null };
}

export const triggerEvolutionQrSession = triggerBaileysQrSession;

export async function startBaileysQrSession(options?: { skipReset?: boolean }): Promise<BaileysConnectPayload> {
  const live = await fetchBaileysConnectionState();
  if (live === "connected") {
    throw new Error("WhatsApp ja conectado. Clique em Desconectar antes de gerar um novo QR.");
  }

  if (!options?.skipReset) {
    await resetBaileysInstanceSession();
    await delay(800);
  }

  try {
    await gatewayFetch<unknown>("/connect/qr", { method: "POST" }, 25_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao iniciar QR no gateway.";
    throw new Error(message);
  }

  for (let i = 0; i < 8; i += 1) {
    await delay(i === 0 ? 1200 : 1500);
    const snapshot = await gatewayFetch<unknown>("/connect/qr/snapshot", undefined, 6_000);
    const authError = parseBaileysSnapshotError(snapshot);
    if (authError) throw new Error(authError);
    const parsed = parseBaileysConnectPayload(snapshot);
    if (parsed.qrCode) return parsed;
    const state = String((snapshot as Record<string, unknown>).connection ?? "").toLowerCase();
    if (state === "connected") return parsed;
  }

  const finalSnapshot = await gatewayFetch<unknown>("/connect/qr/snapshot", undefined, 6_000);
  const finalError = parseBaileysSnapshotError(finalSnapshot);
  if (finalError) throw new Error(finalError);

  return parseBaileysConnectPayload(finalSnapshot);
}

export const startEvolutionQrSession = startBaileysQrSession;

export async function refreshBaileysPairingCode(phone: string): Promise<BaileysConnectPayload> {
  const live = await fetchBaileysConnectionState();
  if (live === "connected") return { qrCode: null, pairingCode: null };
  const payload = await gatewayFetch<unknown>("/connect/pairing/refresh", {
    method: "POST",
    body: { phone },
  }, 20_000);
  return parseBaileysConnectPayload(payload);
}

export const refreshEvolutionPairingCode = refreshBaileysPairingCode;

export async function fetchBaileysQrCode() {
  try {
    const snapshot = await gatewayFetch<unknown>("/connect/qr/snapshot");
    const authError = parseBaileysSnapshotError(snapshot);
    if (authError) {
      return { qrCode: null, authError };
    }
    const parsed = parseBaileysConnectPayload(snapshot);
    return { qrCode: parsed.qrCode, authError: null as string | null };
  } catch {
    return { qrCode: null, authError: null as string | null };
  }
}

export const fetchEvolutionQrCode = fetchBaileysQrCode;

export async function fetchBaileysConnectionState() {
  try {
    const payload = await gatewayFetch<{ state?: string; instance?: { state?: string } }>(
      "/connection",
    );
    const state = String(payload.instance?.state ?? payload.state ?? "").toLowerCase();
    if (state === "open") return "connected" as const;
    if (state === "connecting") return "connecting" as const;
    return "disconnected" as const;
  } catch {
    return "disconnected" as const;
  }
}

export const fetchEvolutionConnectionState = fetchBaileysConnectionState;

export async function assertBaileysReadyForSend() {
  const state = await fetchBaileysConnectionState();
  if (state === "connected") return;
  if (state === "connecting") {
    throw new Error("WhatsApp ainda conectando. Aguarde alguns segundos e tente novamente.");
  }
  throw new Error("WhatsApp nao conectado. Aguarde ou reconecte em Configuracoes.");
}

export function resolveBaileysSendAddress(
  target: Pick<BaileysSendTarget, "digits" | "sendRemoteJid" | "sendViaLid">,
): string {
  const jid = target.sendRemoteJid?.trim() ?? "";
  if (target.sendViaLid && jid.endsWith("@lid")) return jid;
  if (jid.endsWith("@lid")) return jid;
  if (jid.endsWith("@s.whatsapp.net")) return jid;
  if (target.digits) return target.digits;
  throw new Error(
    "Contato sem telefone real para envio. Aguarde uma mensagem com identificacao ou cadastre o numero no contato.",
  );
}

export async function logoutBaileysInstance() {
  await gatewayFetch("/logout", { method: "POST" });
}

export const logoutEvolutionInstance = logoutBaileysInstance;

export async function fetchBaileysProfile() {
  try {
    const profile = await gatewayFetch<{
      profileName?: string;
      phoneNumber?: string;
      ownerJid?: string;
      wuid?: string;
    }>("/profile");
    return {
      profileName: profile.profileName ?? null,
      phoneNumber:
        profile.phoneNumber ??
        profile.wuid?.split("@")[0] ??
        profile.ownerJid?.split("@")[0] ??
        null,
    };
  } catch {
    return { profileName: null, phoneNumber: null };
  }
}

export const fetchEvolutionProfile = fetchBaileysProfile;

export async function fetchBaileysChats() {
  const payload = await gatewayFetch<unknown[]>("/chats");
  return Array.isArray(payload) ? payload : [];
}

export const fetchEvolutionChats = fetchBaileysChats;

export async function fetchBaileysContacts() {
  const payload = await gatewayFetch<unknown[]>("/contacts");
  return Array.isArray(payload) ? payload : [];
}

export const fetchEvolutionContacts = fetchBaileysContacts;

export type BaileysContactIndex = Map<
  string,
  { remoteJid: string; pushName: string; profilePicUrl: string | null }
>;

export type EvolutionContactIndex = BaileysContactIndex;

export function buildBaileysContactIndex(contacts: unknown[]): BaileysContactIndex {
  const map: BaileysContactIndex = new Map();
  for (const raw of contacts) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const pushName = String(row.pushName ?? "").trim();
    const remoteJid = String(row.remoteJid ?? "");
    if (!pushName || !remoteJid.endsWith("@s.whatsapp.net")) continue;
    map.set(pushName.toLowerCase(), {
      remoteJid,
      pushName,
      profilePicUrl: typeof row.profilePicUrl === "string" ? row.profilePicUrl : null,
    });
  }
  return map;
}

export const buildEvolutionContactIndex = buildBaileysContactIndex;

export type BaileysSendTarget = {
  digits: string | null;
  sendRemoteJid: string;
  sendViaLid?: boolean;
  identity: {
    remoteJid: string;
    phone: string | null;
    name: string | null;
    profilePicUrl: string | null;
  };
};

export type EvolutionSendTarget = BaileysSendTarget;

export async function resolveBaileysTargetByExactName(name: string | null | undefined) {
  const { resolveAgendaPhoneContact, assertNotOwnerSendTarget } =
    await import("@/lib/api/atendimento/whatsapp-identity.server");
  const { resolveWhatsAppSendNumber } = await import("@/lib/atendimento/whatsapp");

  const contact = await resolveAgendaPhoneContact(name);
  if (!contact?.remoteJid.endsWith("@s.whatsapp.net")) return null;

  const digits = resolveWhatsAppSendNumber(contact.remoteJid, contact.phone);
  if (!digits) return null;

  await assertNotOwnerSendTarget(digits);
  return {
    digits,
    sendRemoteJid: contact.remoteJid,
    identity: {
      remoteJid: contact.remoteJid,
      phone: contact.phone,
      name: contact.name,
      profilePicUrl: contact.profilePicUrl,
    },
  } satisfies Omit<BaileysSendTarget, "sendViaLid">;
}

export const resolveEvolutionTargetByExactName = resolveBaileysTargetByExactName;

export async function resolveBaileysSendTarget(chat: {
  id?: string;
  remoteJid: string;
  phone?: string | null;
  name?: string | null;
  phoneVerifiedAt?: string | null;
}): Promise<BaileysSendTarget> {
  const { assertNotOwnerSendTarget, resolveRealPhoneJid } =
    await import("@/lib/api/atendimento/whatsapp-identity.server");
  const { resolveWhatsAppSendNumber, toWhatsAppSendDigits, jidToPhone, normalizeWhatsAppPhone } =
    await import("@/lib/atendimento/whatsapp");

  if (chat.remoteJid.endsWith("@s.whatsapp.net")) {
    const digits = resolveWhatsAppSendNumber(chat.remoteJid, chat.phone);
    if (!digits) throw new Error("Numero invalido para este contato.");
    await assertNotOwnerSendTarget(digits);
    return {
      digits,
      sendRemoteJid: chat.remoteJid,
      identity: {
        remoteJid: chat.remoteJid,
        phone: jidToPhone(chat.remoteJid),
        name: chat.name ?? null,
        profilePicUrl: null,
      },
    };
  }

  if (chat.remoteJid.endsWith("@lid") || !chat.remoteJid) {
    const lidDigits = chat.remoteJid.endsWith("@lid") ? (chat.remoteJid.split("@")[0] ?? "") : "";

    if (chat.phone?.trim()) {
      const savedDigits = toWhatsAppSendDigits(normalizeWhatsAppPhone(chat.phone));
      const phoneJid = phoneJidFromPhone(chat.phone);
      const promoted = Boolean(phoneJid && chat.remoteJid === phoneJid);
      const verified = Boolean(chat.phoneVerifiedAt) || promoted;
      if (savedDigits && savedDigits !== lidDigits && verified) {
        await assertNotOwnerSendTarget(savedDigits);
        const targetJid = phoneJid ?? `${savedDigits}@s.whatsapp.net`;
        return {
          digits: savedDigits,
          sendRemoteJid: targetJid,
          identity: {
            remoteJid: targetJid,
            phone: jidToPhone(targetJid),
            name: chat.name ?? null,
            profilePicUrl: null,
          },
        };
      }
    }

    const resolved = await resolveRealPhoneJid({
      remoteJid: chat.remoteJid,
      phone: chat.phoneVerifiedAt ? chat.phone : null,
      chatId: chat.id,
      preferredName: chat.name,
    });

    const unsafeSources = new Set(["lidContactPair", "contactName", "contactNameLoose"]);
    if (
      !resolved.sendViaLid &&
      resolved.remoteJid.endsWith("@s.whatsapp.net") &&
      !(unsafeSources.has(resolved.source) && !chat.phoneVerifiedAt)
    ) {
      const digits = resolveWhatsAppSendNumber(resolved.remoteJid, resolved.phone);
      if (digits) {
        await assertNotOwnerSendTarget(digits);
        return {
          digits,
          sendRemoteJid: resolved.remoteJid,
          identity: {
            remoteJid: resolved.remoteJid,
            phone: resolved.phone,
            name: chat.name ?? null,
            profilePicUrl: null,
          },
        };
      }
    }

    return {
      digits: null,
      sendRemoteJid: chat.remoteJid,
      sendViaLid: true,
      identity: {
        remoteJid: chat.remoteJid,
        phone: chat.phone ?? null,
        name: chat.name ?? null,
        profilePicUrl: null,
      },
    };
  }

  const fromPhone = toWhatsAppSendDigits(normalizeWhatsAppPhone(chat.phone ?? ""));
  if (fromPhone) {
    await assertNotOwnerSendTarget(fromPhone);
    const phoneJid = `${fromPhone}@s.whatsapp.net`;
    return {
      digits: fromPhone,
      sendRemoteJid: phoneJid,
      identity: {
        remoteJid: phoneJid,
        phone: jidToPhone(phoneJid),
        name: chat.name ?? null,
        profilePicUrl: null,
      },
    };
  }

  const byName = await resolveBaileysTargetByExactName(chat.name);
  if (byName) return byName;

  throw new Error(
    `Contato sem numero valido. Informe o telefone com DDD no campo "Novo numero" ou busque o contato na agenda.`,
  );
}

export const resolveEvolutionSendTarget = resolveBaileysSendTarget;

export async function fetchBaileysMessages(remoteJid: string, limit = 80) {
  const payload = await gatewayFetch<{ messages?: { records?: unknown[] } }>(
    `/messages?jid=${encodeURIComponent(remoteJid)}&limit=${limit}`,
  );
  return payload.messages?.records ?? [];
}

export const fetchEvolutionMessages = fetchBaileysMessages;

export async function fetchBaileysRecentMessages(limit = 120) {
  const payload = await gatewayFetch<{ messages?: { records?: unknown[] } }>(
    `/messages?limit=${limit}`,
  );
  return payload.messages?.records ?? [];
}

export const fetchEvolutionRecentMessages = fetchBaileysRecentMessages;

export async function fetchBaileysContactsQuery(where: Record<string, unknown>) {
  const contacts = await fetchBaileysContacts();
  const remoteJid = String(where.remoteJid ?? "");
  if (!remoteJid) return contacts;
  return contacts.filter((row) => {
    if (!row || typeof row !== "object") return false;
    return String((row as Record<string, unknown>).remoteJid ?? "") === remoteJid;
  });
}

export const fetchEvolutionContactsQuery = fetchBaileysContactsQuery;

export type BaileysQuotedMessage = {
  key: { id: string; remoteJid: string; fromMe: boolean };
  message: Record<string, unknown>;
};

export type EvolutionQuotedMessage = BaileysQuotedMessage;

type GatewaySendResponse = {
  ok?: boolean;
  result?: {
    key?: { id?: string; remoteJid?: string };
  };
  key?: { id?: string };
};

export type BaileysSendResult = {
  waMessageId: string;
};

export function parseGatewaySentMessageId(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Resposta invalida do gateway WhatsApp.");
  }
  const row = payload as GatewaySendResponse;
  const id = row.result?.key?.id ?? row.key?.id;
  if (id) return id;
  throw new Error("WhatsApp nao confirmou o envio da mensagem.");
}

export async function sendBaileysText(
  numberOrJid: string,
  text: string,
  quoted?: BaileysQuotedMessage,
): Promise<BaileysSendResult> {
  await assertBaileysReadyForSend();
  const payload = await gatewayFetch<GatewaySendResponse>(
    "/message/text",
    {
      method: "POST",
      body: { number: numberOrJid, text, quoted },
    },
    20_000,
  );
  return { waMessageId: parseGatewaySentMessageId(payload) };
}

export const sendEvolutionText = sendBaileysText;

export async function sendBaileysMessage(
  target: Pick<BaileysSendTarget, "digits" | "sendRemoteJid" | "sendViaLid">,
  text: string,
  quoted?: BaileysQuotedMessage,
): Promise<BaileysSendResult> {
  const address = resolveBaileysSendAddress(target);
  return sendBaileysText(address, text, quoted);
}

export const sendEvolutionMessage = sendBaileysMessage;

export async function sendBaileysMedia(input: {
  number: string;
  mediatype: "image" | "document" | "audio" | "video";
  media: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
}): Promise<BaileysSendResult> {
  await assertBaileysReadyForSend();
  const payload = await gatewayFetch<GatewaySendResponse>("/message/media", { method: "POST", body: input }, 45_000);
  return { waMessageId: parseGatewaySentMessageId(payload) };
}

export const sendEvolutionMedia = sendBaileysMedia;

export async function sendBaileysAudio(
  number: string,
  audioBase64: string,
  mimetype?: string,
): Promise<BaileysSendResult> {
  await assertBaileysReadyForSend();
  const payload = await gatewayFetch<GatewaySendResponse>(
    "/message/audio",
    {
      method: "POST",
      body: { number, audio: audioBase64, mimetype },
    },
    45_000,
  );
  return { waMessageId: parseGatewaySentMessageId(payload) };
}

export const sendEvolutionAudio = sendBaileysAudio;

export async function fetchBaileysMediaBase64(input: {
  remoteJid?: string;
  waMessageId: string;
  fromMe?: boolean;
  webhookRecord?: Record<string, unknown>;
}) {
  try {
    const payload = await gatewayFetch<{ base64?: string; mimetype?: string }>(
      "/media/download",
      {
        method: "POST",
        body: {
          remoteJid: input.remoteJid,
          waMessageId: input.waMessageId,
          fromMe: input.fromMe,
          webhookRecord: input.webhookRecord,
        },
      },
      45_000,
    );
    if (!payload?.base64) return null;
    return {
      base64: payload.base64,
      mimetype: payload.mimetype ?? "application/octet-stream",
    };
  } catch (error) {
    console.error("[fetchBaileysMediaBase64]", error);
    return null;
  }
}

export const fetchEvolutionMediaBase64 = fetchBaileysMediaBase64;

export async function fetchBaileysProfilePicture(numberOrJid: string) {
  const raw = numberOrJid.trim();
  if (!raw) return null;

  const candidates = new Set<string>();
  candidates.add(raw);
  if (raw.includes("@")) {
    const base = raw.split("@")[0] ?? "";
    const digits = toWhatsAppSendDigits(normalizeWhatsAppPhone(base));
    if (digits) {
      candidates.add(digits);
      candidates.add(`${digits}@s.whatsapp.net`);
    }
  } else {
    const digits = toWhatsAppSendDigits(normalizeWhatsAppPhone(raw));
    if (digits) {
      candidates.add(digits);
      candidates.add(`${digits}@s.whatsapp.net`);
    }
  }

  for (const number of candidates) {
    try {
      const payload = await gatewayFetch<{ profilePictureUrl?: string; url?: string }>(
        "/profile-picture",
        { method: "POST", body: { number } },
      );
      const url = payload.profilePictureUrl ?? payload.url ?? null;
      if (url?.trim()) return url.trim();
    } catch {
      // tenta proximo
    }
  }
  return null;
}

export const fetchEvolutionProfilePicture = fetchBaileysProfilePicture;

// Aliases Baileys-first exports
export {
  fetchBaileysChats as fetchWhatsAppWebChats,
  fetchBaileysContacts as fetchWhatsAppWebContacts,
  sendBaileysText as sendWhatsAppWebText,
  isBaileysConfigured as isWhatsAppWebConfigured,
};
