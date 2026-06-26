import https from "node:https";
import http from "node:http";
import QRCode from "qrcode";
import {
  jidToPhone,
  normalizeWhatsAppPhone,
  phoneJidFromPhone,
  phonesMatchLoosely,
  toEvolutionSendDigits,
} from "@/lib/whatsapp";

type EvolutionRequestInit = {
  method?: string;
  body?: unknown;
};

type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  pathPrefix: string;
  insecureSsl: boolean;
  skipCreate: boolean;
  enabled: boolean;
};

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

/** Remove /manager e normaliza base v1/v2 da Evolution. */
function parseEvolutionServerUrl(raw: string, envPrefix: string) {
  let baseUrl = normalizeBaseUrl(raw);
  baseUrl = baseUrl.replace(/\/manager\/?$/i, "");

  let pathPrefix = envPrefix.replace(/\/$/, "");

  if (!pathPrefix && /\/api\/v1$/i.test(baseUrl)) {
    baseUrl = baseUrl.replace(/\/api\/v1$/i, "");
    pathPrefix = "/api/v1";
  }

  return { baseUrl, pathPrefix };
}

function stringifyEvolutionErrorValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(stringifyEvolutionErrorValue).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.message != null) return stringifyEvolutionErrorValue(record.message);
    if (record.error != null) return stringifyEvolutionErrorValue(record.error);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function extractEvolutionError(body: unknown, raw: string, statusCode: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const nested = record.response as Record<string, unknown> | undefined;
    if (nested?.message) {
      const msg = stringifyEvolutionErrorValue(nested.message);
      if (msg) return `${msg} (HTTP ${statusCode})`;
    }
    if (record.message) {
      const msg = stringifyEvolutionErrorValue(record.message);
      if (msg) return `${msg} (HTTP ${statusCode})`;
    }
    if (record.error) {
      const msg = stringifyEvolutionErrorValue(record.error);
      if (msg) return `${msg} (HTTP ${statusCode})`;
    }
  }
  return raw || `HTTP ${statusCode}`;
}

function deriveApiKeyFromUrl(baseUrl: string) {
  const match = baseUrl.match(/\/apsess_([A-Za-z0-9]+)$/i);
  return match?.[1] ?? "";
}

function getEvolutionConfig(): EvolutionConfig {
  const rawUrl = process.env.EVOLUTION_API_URL ?? "";
  const { baseUrl, pathPrefix } = parseEvolutionServerUrl(
    rawUrl,
    process.env.EVOLUTION_API_PREFIX ?? "",
  );
  const derivedKey = deriveApiKeyFromUrl(rawUrl);
  const apiKey = process.env.EVOLUTION_API_KEY ?? derivedKey;
  const instanceName = (process.env.EVOLUTION_INSTANCE_NAME ?? "abelha-mel").trim();
  const insecureSsl = process.env.EVOLUTION_INSECURE_SSL === "true";
  const skipCreate =
    process.env.EVOLUTION_SKIP_CREATE === "true" || /\/apsess_[A-Za-z0-9]+$/i.test(rawUrl);

  return {
    baseUrl,
    apiKey,
    instanceName,
    pathPrefix,
    insecureSsl,
    skipCreate,
    enabled: Boolean(baseUrl && apiKey),
  };
}

export function isEvolutionConfigured() {
  return getEvolutionConfig().enabled;
}

export function getEvolutionInstanceName() {
  return getEvolutionConfig().instanceName;
}

export function getEvolutionPublicConfig() {
  const config = getEvolutionConfig();
  return {
    baseUrl: config.baseUrl,
    instanceName: config.instanceName,
    pathPrefix: config.pathPrefix || "/",
    insecureSsl: config.insecureSsl,
    skipCreate: config.skipCreate,
    configured: config.enabled,
  };
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

function collectAllowedWebhookKeys() {
  const keys = new Set<string>();
  for (const raw of [
    process.env.EVOLUTION_WEBHOOK_SECRET,
    process.env.EVOLUTION_API_KEY,
    process.env.EVOLUTION_WEBHOOK_KEYS,
  ]) {
    if (!raw?.trim()) continue;
    for (const part of raw.split(",")) {
      const key = part.trim();
      if (key) keys.add(key);
    }
  }
  return keys;
}

function isEvolutionInstanceWebhookPayload(body: Record<string, unknown>) {
  const event = String(body.event ?? body.type ?? "").toLowerCase();
  if (!event) return false;
  return Boolean(body.instance ?? body.data);
}

/** Valida apikey do webhook Evolution (producao). Em dev sem secret configurado, aceita. */
export function isEvolutionWebhookAuthorized(request: Request, body?: Record<string, unknown>) {
  const allowed = collectAllowedWebhookKeys();
  const headerKey = getRequestApiKey(request);
  if (headerKey && allowed.has(headerKey)) return true;

  const record = body ?? {};
  const bodyKey = String(record.apikey ?? "").trim();
  if (bodyKey && allowed.has(bodyKey)) return true;

  // Evolution v2.1.x envia o token/hash da instancia no corpo (nao o AUTHENTICATION_API_KEY).
  if (bodyKey && isEvolutionInstanceWebhookPayload(record)) return true;

  if (allowed.size === 0) return process.env.NODE_ENV !== "production";
  return false;
}

function buildEvolutionUrl(path: string) {
  const { baseUrl, pathPrefix } = getEvolutionConfig();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${pathPrefix}${normalizedPath}`;
}

function requestJson<T>(
  url: string,
  init: EvolutionRequestInit,
  insecureSsl: boolean,
  timeoutMs = 6000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = init.body ? JSON.stringify(init.body) : "";
    const config = getEvolutionConfig();
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
        ...(parsed.protocol === "https:" && insecureSsl ? { rejectUnauthorized: false } : {}),
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
            reject(new Error(extractEvolutionError(body, raw, res.statusCode)));
            return;
          }
          resolve(body as T);
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`Evolution API timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    req.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function evolutionFetch<T>(
  path: string,
  init: EvolutionRequestInit = {},
  timeoutMs = 6000,
): Promise<T> {
  const config = getEvolutionConfig();
  return requestJson<T>(buildEvolutionUrl(path), init, config.insecureSsl, timeoutMs);
}

async function evolutionFetchWithFallback<T>(
  paths: string[],
  init: EvolutionRequestInit = {},
  timeoutMs = 6000,
): Promise<T> {
  let lastError: Error | null = null;
  const tried: string[] = [];
  for (const path of paths) {
    const url = buildEvolutionUrl(path);
    tried.push(url);
    try {
      return await evolutionFetch<T>(path, init, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  const hint =
    tried.length > 0
      ? ` Verifique EVOLUTION_API_URL (sem /manager) e EVOLUTION_INSTANCE_NAME. Tentativas: ${tried.join(" | ")}`
      : "";
  throw new Error((lastError?.message ?? "Evolution API indisponivel.") + hint);
}

function messageSendPaths(instanceName: string) {
  const { pathPrefix } = getEvolutionConfig();
  const paths = [`/message/sendText/${instanceName}`];
  if (pathPrefix === "/api/v1") {
    paths.push(`/api/v1/message/sendText/${instanceName}`);
  }
  return paths;
}

function mediaSendPaths(instanceName: string, kind: "media" | "audio") {
  const { pathPrefix } = getEvolutionConfig();
  const base =
    kind === "audio"
      ? `/message/sendWhatsAppAudio/${instanceName}`
      : `/message/sendMedia/${instanceName}`;
  const paths = [base];
  if (pathPrefix === "/api/v1") {
    paths.push(
      kind === "audio"
        ? `/api/v1/message/sendWhatsAppAudio/${instanceName}`
        : `/api/v1/message/sendMedia/${instanceName}`,
    );
  }
  return paths;
}

async function resolveInstanceName() {
  const config = getEvolutionConfig();
  try {
    const payload =
      await evolutionFetch<
        Array<{ name?: string; instanceName?: string; connectionStatus?: string }>
      >(`/instance/fetchInstances`);
    const rows = Array.isArray(payload) ? payload : [];
    const wanted = config.instanceName.toLowerCase();
    const exact = rows.find((row) => {
      const name = String(row.name ?? row.instanceName ?? "").trim();
      return name.toLowerCase() === wanted;
    });
    const open = rows.find((row) => String(row.connectionStatus ?? "").toLowerCase() === "open");
    const picked = exact ?? open ?? rows[0];
    const name = String(picked?.name ?? picked?.instanceName ?? "").trim();
    if (name) return name;
  } catch {
    /* usa env */
  }
  return config.instanceName;
}

export async function ensureEvolutionInstance() {
  const config = getEvolutionConfig();
  if (config.skipCreate) return;
  try {
    await evolutionFetch("/instance/create", {
      body: {
        instanceName: config.instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      },
    });
  } catch {
    // instancia pode ja existir
  }
}

export async function ensureEvolutionWebhookConfigured() {
  const instanceName = await resolveInstanceName();
  const webhookUrl = getPublicWebhookUrl();
  const events = [
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "CONNECTION_UPDATE",
    "QRCODE_UPDATED",
    "CHATS_UPSERT",
  ];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await evolutionFetchWithFallback(
        [`/webhook/set/${instanceName}`, `/api/v1/webhook/set/${instanceName}`],
        {
          body: {
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              events,
            },
          },
        },
      );
      const status = await fetchEvolutionWebhookStatus();
      if (status.configured) return;
    } catch (error) {
      console.error("[ensureEvolutionWebhookConfigured]", error);
    }
  }

  const status = await fetchEvolutionWebhookStatus();
  if (!status.configured) {
    throw new Error("Nao foi possivel configurar webhook na Evolution API.");
  }
}

export async function fetchEvolutionWebhookStatus() {
  const instanceName = await resolveInstanceName();
  try {
    const payload = await evolutionFetchWithFallback<{
      webhook?: { enabled?: boolean; url?: string };
    }>([`/webhook/find/${instanceName}`, `/api/v1/webhook/find/${instanceName}`]);
    const webhook = payload.webhook ?? payload;
    return {
      configured: Boolean(
        (webhook as { enabled?: boolean }).enabled && (webhook as { url?: string }).url,
      ),
      url: (webhook as { url?: string }).url ?? null,
    };
  } catch {
    return { configured: false, url: null };
  }
}

export type EvolutionConnectPayload = {
  qrCode: string | null;
  pairingCode: string | null;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizePairingCodeValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return clean.length === 8 ? clean : null;
}

function readPairingCodeFromRow(row: Record<string, unknown>): string | null {
  const nested = (row.qrcode ?? row.qrCode ?? row.data) as Record<string, unknown> | undefined;
  for (const source of [row, nested]) {
    if (!source || typeof source !== "object") continue;
    const record = source as Record<string, unknown>;
    for (const key of ["pairingCode", "pairing_code", "pairing", "code", "linkCode", "link_code"]) {
      const normalized = normalizePairingCodeValue(record[key]);
      if (normalized) return normalized;
    }
  }
  return null;
}

/** Extrai codigo de vinculo de qualquer payload Evolution (connect, webhook, fetchInstances). */
export function parseEvolutionPairingCode(payload: unknown): string | null {
  return parseEvolutionConnectPayload(payload).pairingCode;
}

function parseEvolutionConnectPayload(payload: unknown): EvolutionConnectPayload {
  const queue: unknown[] = [payload];
  const seen = new Set<unknown>();
  let pairingCode: string | null = null;

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }

    const row = node as Record<string, unknown>;
    if (!pairingCode) pairingCode = readPairingCodeFromRow(row);

    for (const value of Object.values(row)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return { qrCode: null, pairingCode };
}

async function buildQrDataUrl(raw: string) {
  if (!raw) return null;
  return raw.startsWith("data:") ? raw : await QRCode.toDataURL(raw);
}

async function connectEvolutionWithPhoneNumber(
  instanceName: string,
  digits: string,
): Promise<EvolutionConnectPayload> {
  const attempts: Array<{ paths: string[]; init?: EvolutionRequestInit }> = [
    {
      paths: [
        `/instance/connect/${instanceName}?number=${encodeURIComponent(digits)}`,
        `/api/v1/instance/connect/${instanceName}?number=${encodeURIComponent(digits)}`,
      ],
    },
    {
      paths: [`/instance/connect/${instanceName}`, `/api/v1/instance/connect/${instanceName}`],
      init: { body: { number: digits } },
    },
  ];

  for (const attempt of attempts) {
    for (const path of attempt.paths) {
      try {
        const payload = await evolutionFetchWithFallback<unknown>(
          [path],
          attempt.init ?? {},
          15_000,
        );
        const parsed = parseEvolutionConnectPayload(payload);
        if (parsed.pairingCode) return parsed;
      } catch {
        // tenta proximo path
      }
    }
  }

  return { qrCode: null, pairingCode: null };
}

export async function fetchEvolutionInstanceMeta() {
  const instanceName = await resolveInstanceName();
  try {
    const rows = await evolutionFetchWithFallback<
      Array<{
        name?: string;
        instanceName?: string;
        connectionStatus?: string;
        ownerJid?: string;
        number?: string | null;
        integration?: string;
      }>
    >([`/instance/fetchInstances?instanceName=${instanceName}`]);
    const list = Array.isArray(rows) ? rows : [rows];
    const row =
      list.find((item) => String(item?.name ?? item?.instanceName ?? "") === instanceName) ??
      list[0];
    const ownerRaw = String(row?.ownerJid ?? row?.number ?? "").split("@")[0] ?? "";
    const ownerDigits = ownerRaw ? normalizeWhatsAppPhone(ownerRaw) : null;
    return {
      instanceName,
      state: String(row?.connectionStatus ?? "").toLowerCase() || null,
      ownerPhoneDigits: ownerDigits,
      integration: row?.integration ?? null,
    };
  } catch {
    return {
      instanceName,
      state: null,
      ownerPhoneDigits: null,
      integration: null,
    };
  }
}

function pairingPhoneMatchesOwner(requestedDigits: string, ownerDigits: string | null) {
  if (!ownerDigits) return true;
  const requested = normalizeWhatsAppPhone(requestedDigits);
  if (!requested) return true;
  if (requested === ownerDigits) return true;
  return phonesMatchLoosely(requested, ownerDigits);
}

export async function deleteEvolutionInstance(instanceName?: string) {
  const name = instanceName ?? (await resolveInstanceName());
  const paths = [`/instance/delete/${name}`, `/api/v1/instance/delete/${name}`];
  let lastError: Error | null = null;
  for (const path of paths) {
    try {
      await evolutionFetch(path, { method: "DELETE" });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (lastError) throw lastError;
}

/** Limpa sessao presa em connecting/open antes de pairing ou apos desconectar. */
export async function resetEvolutionInstanceSession() {
  try {
    await logoutEvolutionInstance();
  } catch (error) {
    console.error("[resetEvolutionInstanceSession] logout:", error);
  }

  await delay(2000);

  let state = await fetchEvolutionConnectionState();
  if (state === "disconnected") return state;

  try {
    await deleteEvolutionInstance();
  } catch (error) {
    console.error("[resetEvolutionInstanceSession] delete:", error);
  }

  await delay(1000);
  await ensureEvolutionInstance();
  await delay(1500);

  state = await fetchEvolutionConnectionState();
  return state;
}

/** Desconexao forcada: logout + apaga instancia + recria vazia. */
export async function forceDisconnectEvolutionInstance() {
  try {
    await logoutEvolutionInstance();
  } catch (error) {
    console.error("[forceDisconnectEvolutionInstance] logout:", error);
  }

  await delay(2000);

  try {
    await deleteEvolutionInstance();
  } catch (error) {
    console.error("[forceDisconnectEvolutionInstance] delete:", error);
  }

  await delay(1000);
  await ensureEvolutionInstance();
  await delay(1000);
  return fetchEvolutionConnectionState();
}

/** Garante instancia em close/disconnected antes de QR ou pairing. */
export async function ensureEvolutionReadyForAuth() {
  await ensureEvolutionInstance();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await fetchEvolutionConnectionState();
    if (state === "disconnected") return state;

    try {
      await logoutEvolutionInstance();
    } catch (error) {
      console.error("[ensureEvolutionReadyForAuth] logout:", error);
    }
    await delay(2000);

    if ((await fetchEvolutionConnectionState()) === "disconnected") {
      return "disconnected" as const;
    }
  }

  try {
    await deleteEvolutionInstance();
  } catch (error) {
    console.error("[ensureEvolutionReadyForAuth] delete:", error);
  }

  await delay(1000);
  await ensureEvolutionInstance();
  await delay(1500);
  return fetchEvolutionConnectionState();
}

async function fetchPairingCodeFromInstance(instanceName: string): Promise<string | null> {
  try {
    const rows = await evolutionFetchWithFallback<unknown>([
      `/instance/fetchInstances?instanceName=${instanceName}`,
    ]);
    return parseEvolutionPairingCode(rows);
  } catch {
    return null;
  }
}

async function pollEvolutionPairingCode(
  instanceName: string,
  digits: string,
  maxAttempts = 12,
  intervalMs = 2000,
): Promise<EvolutionConnectPayload> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await delay(intervalMs);

    const fromInstance = await fetchPairingCodeFromInstance(instanceName);
    if (fromInstance) return { qrCode: null, pairingCode: fromInstance };

    const connect = await connectEvolutionWithPhoneNumber(instanceName, digits);
    if (connect.pairingCode) return connect;

    const state = await fetchEvolutionConnectionState();
    if (state === "connected") break;
  }

  return { qrCode: null, pairingCode: null };
}

export async function snapshotEvolutionPairingCode() {
  const instanceName = await resolveInstanceName();
  return fetchPairingCodeFromInstance(instanceName);
}

let lastPairingNudgeAt = 0;

/** Poll leve durante pairing pendente — no maximo 1x a cada 12s. */
export async function nudgeEvolutionPairingCode(digits: string): Promise<string | null> {
  const now = Date.now();
  if (now - lastPairingNudgeAt < 12_000) {
    return snapshotEvolutionPairingCode();
  }
  lastPairingNudgeAt = now;

  const instanceName = await resolveInstanceName();
  const cached = await fetchPairingCodeFromInstance(instanceName);
  if (cached) return cached;

  const connect = await connectEvolutionWithPhoneNumber(instanceName, digits);
  return connect.pairingCode;
}

export async function requestEvolutionPairingCode(
  digits: string,
): Promise<EvolutionConnectPayload> {
  const instanceName = await resolveInstanceName();
  const live = await fetchEvolutionConnectionState();

  if (live === "connected") {
    return { qrCode: null, pairingCode: null };
  }

  try {
    await ensureEvolutionWebhookConfigured();
  } catch (error) {
    console.error("[requestEvolutionPairingCode] webhook:", error);
  }

  if (live !== "disconnected") {
    await resetEvolutionInstanceSession();
    await delay(1500);
  } else {
    await ensureEvolutionInstance();
    await delay(800);
  }

  const first = await connectEvolutionWithPhoneNumber(instanceName, digits);
  if (first.pairingCode) return first;

  return pollEvolutionPairingCode(instanceName, digits, 6, 2000);
}

export async function fetchEvolutionConnect(
  phone?: string | null,
): Promise<EvolutionConnectPayload> {
  const instanceName = await resolveInstanceName();
  const digits = phone?.trim() ? toEvolutionSendDigits(phone) || normalizeWhatsAppPhone(phone) : "";

  if (digits) {
    return requestEvolutionPairingCode(digits);
  }

  await ensureEvolutionInstance();
  return fetchEvolutionConnectPayload(instanceName);
}

/** Inicia sessao QR do zero. Nao usar no polling. */
export async function startEvolutionQrSession(): Promise<EvolutionConnectPayload> {
  const instanceName = await resolveInstanceName();
  await ensureEvolutionReadyForAuth();
  return fetchEvolutionConnectPayload(instanceName);
}

async function fetchEvolutionConnectPayload(
  instanceName: string,
): Promise<EvolutionConnectPayload> {
  try {
    const payload = await evolutionFetchWithFallback<unknown>(
      [`/instance/connect/${instanceName}`, `/api/v1/instance/connect/${instanceName}`],
      {},
      15_000,
    );

    const parsed = parseEvolutionConnectPayload(payload);
    if (parsed.pairingCode) {
      return { qrCode: null, pairingCode: parsed.pairingCode };
    }

    const rows = Array.isArray(payload) ? payload : [payload];
    for (const item of rows) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const nested = (row.qrcode ?? row.qrCode) as Record<string, unknown> | undefined;
      const raw = String(row.base64 ?? nested?.base64 ?? "");
      const qrCode = await buildQrDataUrl(raw);
      if (qrCode) return { qrCode, pairingCode: null };
    }

    return { qrCode: null, pairingCode: null };
  } catch {
    return { qrCode: null, pairingCode: null };
  }
}

export async function refreshEvolutionPairingCode(phone: string): Promise<EvolutionConnectPayload> {
  const instanceName = await resolveInstanceName();
  const digits = toEvolutionSendDigits(phone) || normalizeWhatsAppPhone(phone);
  if (!digits) return { qrCode: null, pairingCode: null };

  const live = await fetchEvolutionConnectionState();
  if (live === "connected") return { qrCode: null, pairingCode: null };

  let result = await connectEvolutionWithPhoneNumber(instanceName, digits);
  if (result.pairingCode) return result;

  return pollEvolutionPairingCode(instanceName, digits, 12, 2000);
}

export async function fetchEvolutionQrCode() {
  const instanceName = await resolveInstanceName();
  const result = await fetchEvolutionConnectPayload(instanceName);
  return { qrCode: result.qrCode };
}

export async function fetchEvolutionConnectionState() {
  const instanceName = await resolveInstanceName();
  try {
    const payload = await evolutionFetchWithFallback<{
      instance?: { state?: string };
      state?: string;
    }>([
      `/instance/connectionState/${instanceName}`,
      `/api/v1/instance/connectionState/${instanceName}`,
    ]);
    const state = String(payload.instance?.state ?? payload.state ?? "").toLowerCase();
    if (state === "open") return "connected" as const;
    if (state === "connecting") return "connecting" as const;
    return "disconnected" as const;
  } catch {
    return "disconnected" as const;
  }
}

export async function logoutEvolutionInstance() {
  const instanceName = await resolveInstanceName();
  const paths = [`/instance/logout/${instanceName}`, `/api/v1/instance/logout/${instanceName}`];
  let lastError: Error | null = null;
  for (const path of paths) {
    for (const method of ["DELETE", "GET"] as const) {
      try {
        await evolutionFetch(path, { method });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }
  if (lastError) throw lastError;
}

export async function fetchEvolutionProfile() {
  const instanceName = await resolveInstanceName();
  try {
    const profile = await evolutionFetchWithFallback<{
      profileName?: string;
      wuid?: string;
      ownerJid?: string;
    }>([`/instance/fetchInstances?instanceName=${instanceName}`]);
    const row = Array.isArray(profile) ? profile[0] : profile;
    return {
      profileName: row?.profileName ?? null,
      phoneNumber: row?.wuid?.split("@")[0] ?? row?.ownerJid?.split("@")[0] ?? null,
    };
  } catch {
    return { profileName: null, phoneNumber: null };
  }
}

export async function fetchEvolutionChats() {
  const instanceName = await resolveInstanceName();
  const payload = await evolutionFetchWithFallback<unknown[]>(
    [`/chat/findChats/${instanceName}`, `/api/v1/chat/findChats/${instanceName}`],
    { body: {} },
  );
  return Array.isArray(payload) ? payload : [];
}

export async function fetchEvolutionContacts() {
  const instanceName = await resolveInstanceName();
  const payload = await evolutionFetchWithFallback<unknown[]>(
    [`/chat/findContacts/${instanceName}`, `/api/v1/chat/findContacts/${instanceName}`],
    { body: {} },
  );
  return Array.isArray(payload) ? payload : [];
}

export type EvolutionContactIndex = Map<
  string,
  { remoteJid: string; pushName: string; profilePicUrl: string | null }
>;

/** Match de nome na agenda Evolution — retorna destino de envio ou null. */
export async function resolveEvolutionTargetByExactName(name: string | null | undefined) {
  const { resolveAgendaPhoneContact, assertNotOwnerSendTarget } =
    await import("@/lib/api/whatsapp-identity.server");
  const { resolveEvolutionSendNumber } = await import("@/lib/whatsapp");

  const contact = await resolveAgendaPhoneContact(name);
  if (!contact?.remoteJid.endsWith("@s.whatsapp.net")) return null;

  const digits = resolveEvolutionSendNumber(contact.remoteJid, contact.phone);
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
  } satisfies Omit<EvolutionSendTarget, "sendViaLid">;
}

export function buildEvolutionContactIndex(contacts: unknown[]): EvolutionContactIndex {
  const map: EvolutionContactIndex = new Map();
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

export type EvolutionSendTarget = {
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

function buildIdentityFromChat(chat: {
  remoteJid: string;
  phone?: string | null;
  name?: string | null;
}) {
  return {
    remoteJid: chat.remoteJid,
    phone: chat.phone ?? null,
    name: chat.name ?? null,
    profilePicUrl: null,
  };
}

/**
 * Resolve destino de envio SEM redirecionar para outro contato.
 * Regra: conversa aberta = envia para o remoteJid dessa conversa.
 */
export async function resolveEvolutionSendTarget(chat: {
  id?: string;
  remoteJid: string;
  phone?: string | null;
  name?: string | null;
  phoneVerifiedAt?: string | null;
}): Promise<EvolutionSendTarget> {
  const { assertNotOwnerSendTarget, resolveRealPhoneJid } =
    await import("@/lib/api/whatsapp-identity.server");
  const { resolveEvolutionSendNumber, toEvolutionSendDigits, jidToPhone, normalizeWhatsAppPhone } =
    await import("@/lib/whatsapp");

  // 1) Conversa @s.whatsapp.net — envia EXATAMENTE para este numero
  if (chat.remoteJid.endsWith("@s.whatsapp.net")) {
    const digits = resolveEvolutionSendNumber(chat.remoteJid, chat.phone);
    if (!digits) {
      throw new Error("Numero invalido para este contato.");
    }
    await assertNotOwnerSendTarget(digits);
    const identity = {
      remoteJid: chat.remoteJid,
      phone: jidToPhone(chat.remoteJid),
      name: chat.name ?? null,
      profilePicUrl: null,
    };
    console.info(
      "[resolveEvolutionSendTarget]",
      JSON.stringify({
        chatId: chat.id,
        openRemoteJid: chat.remoteJid,
        resolvedRemoteJid: chat.remoteJid,
        sendTarget: digits,
        sendViaLid: false,
        source: "direct",
      }),
    );
    return { digits, sendRemoteJid: chat.remoteJid, identity };
  }

  // 2) @lid ou sem JID — resolve telefone real via Evolution antes de sendViaLid
  if (chat.remoteJid.endsWith("@lid") || !chat.remoteJid) {
    const lidDigits = chat.remoteJid.endsWith("@lid") ? (chat.remoteJid.split("@")[0] ?? "") : "";

    if (chat.phone?.trim()) {
      const savedDigits = toEvolutionSendDigits(normalizeWhatsAppPhone(chat.phone));
      const phoneJid = phoneJidFromPhone(chat.phone);
      const promoted = Boolean(phoneJid && chat.remoteJid === phoneJid);
      const verified = Boolean(chat.phoneVerifiedAt) || promoted;
      if (savedDigits && savedDigits !== lidDigits && verified) {
        await assertNotOwnerSendTarget(savedDigits);
        const targetJid = phoneJid ?? `${savedDigits}@s.whatsapp.net`;
        console.info(
          "[resolveEvolutionSendTarget]",
          JSON.stringify({
            chatId: chat.id,
            openRemoteJid: chat.remoteJid,
            resolvedRemoteJid: targetJid,
            sendTarget: savedDigits,
            sendViaLid: false,
            source: "savedPhone",
          }),
        );
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
      const digits = resolveEvolutionSendNumber(resolved.remoteJid, resolved.phone);
      if (digits) {
        await assertNotOwnerSendTarget(digits);
        console.info(
          "[resolveEvolutionSendTarget]",
          JSON.stringify({
            chatId: chat.id,
            openRemoteJid: chat.remoteJid,
            resolvedRemoteJid: resolved.remoteJid,
            sendTarget: digits,
            sendViaLid: false,
            source: resolved.source,
          }),
        );
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

    throw new Error(
      "Telefone do contato nao identificado. Cadastre o numero na agenda ou aguarde uma mensagem com telefone.",
    );
  }

  // 3) Telefone salvo no chat (sem @lid)
  const fromPhone = toEvolutionSendDigits(normalizeWhatsAppPhone(chat.phone ?? ""));
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

  // 4) Match de nome na agenda Evolution
  const byName = await resolveEvolutionTargetByExactName(chat.name);
  if (byName) return byName;

  throw new Error(
    `Contato sem numero valido. Informe o telefone com DDD no campo "Novo numero" ou busque o contato na agenda.`,
  );
}

export async function fetchEvolutionMessages(remoteJid: string, limit = 80) {
  const instanceName = await resolveInstanceName();
  const payload = await evolutionFetchWithFallback<
    { messages?: { records?: unknown[] } } | unknown[]
  >([`/chat/findMessages/${instanceName}`, `/api/v1/chat/findMessages/${instanceName}`], {
    body: {
      where: { key: { remoteJid } },
      limit,
    },
  });

  if (Array.isArray(payload)) return payload;
  return payload.messages?.records ?? [];
}

/** Busca mensagens recentes sem filtro de JID — util para achar telefone de @lid. */
export async function fetchEvolutionRecentMessages(limit = 120) {
  const instanceName = await resolveInstanceName();
  const payload = await evolutionFetchWithFallback<
    { messages?: { records?: unknown[] } } | unknown[]
  >([`/chat/findMessages/${instanceName}`, `/api/v1/chat/findMessages/${instanceName}`], {
    body: { limit },
  });

  if (Array.isArray(payload)) return payload;
  return payload.messages?.records ?? [];
}

export async function fetchEvolutionContactsQuery(where: Record<string, unknown>) {
  const instanceName = await resolveInstanceName();
  const payload = await evolutionFetchWithFallback<unknown[]>(
    [`/chat/findContacts/${instanceName}`, `/api/v1/chat/findContacts/${instanceName}`],
    { body: { where } },
  );
  return Array.isArray(payload) ? payload : [];
}

export type EvolutionQuotedMessage = {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  message: Record<string, unknown>;
};

export async function sendEvolutionText(
  numberOrJid: string,
  text: string,
  quoted?: EvolutionQuotedMessage,
) {
  const instanceName = await resolveInstanceName();
  const body: Record<string, unknown> = { number: numberOrJid, text };
  if (quoted) body.quoted = quoted;
  return evolutionFetchWithFallback(messageSendPaths(instanceName), { body });
}

/** Envia para o destino resolvido — prioriza o JID da conversa aberta. */
export async function sendEvolutionMessage(
  target: Pick<EvolutionSendTarget, "digits" | "sendRemoteJid" | "sendViaLid">,
  text: string,
  quoted?: EvolutionQuotedMessage,
) {
  if (target.digits) {
    return sendEvolutionText(target.digits, text, quoted);
  }

  if (target.sendRemoteJid.endsWith("@s.whatsapp.net")) {
    const digits = target.sendRemoteJid.split("@")[0] ?? "";
    return sendEvolutionText(digits, text, quoted);
  }

  throw new Error(
    "Contato sem telefone real para envio. Aguarde uma mensagem com identificacao ou cadastre o numero no contato.",
  );
}

export async function sendEvolutionMedia(input: {
  number: string;
  mediatype: "image" | "document" | "audio" | "video";
  media: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
}) {
  const instanceName = await resolveInstanceName();
  return evolutionFetchWithFallback(mediaSendPaths(instanceName, "media"), {
    body: {
      number: input.number,
      mediatype: input.mediatype,
      media: input.media,
      mimetype: input.mimetype,
      caption: input.caption,
      fileName: input.fileName,
    },
  });
}

export async function sendEvolutionAudio(number: string, audioBase64: string) {
  const instanceName = await resolveInstanceName();
  return evolutionFetchWithFallback(mediaSendPaths(instanceName, "audio"), {
    body: { number, audio: audioBase64 },
  });
}

/** Baixa midia criptografada do WhatsApp como base64 (audio, imagem, etc.). */
function parseEvolutionMediaPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const nested =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : record.response && typeof record.response === "object"
        ? (record.response as Record<string, unknown>)
        : record;

  const base64 = String(nested.base64 ?? record.base64 ?? "").trim();
  if (!base64) return null;
  const mimetype =
    String(nested.mimetype ?? record.mimetype ?? "image/jpeg").trim() || "image/jpeg";
  return { base64, mimetype };
}

export async function fetchEvolutionMediaBase64(input: {
  remoteJid?: string;
  waMessageId: string;
  fromMe?: boolean;
  webhookRecord?: Record<string, unknown>;
}) {
  const instanceName = await resolveInstanceName();
  const paths = [
    `/chat/getBase64FromMediaMessage/${instanceName}`,
    `/message/getBase64FromMediaMessage/${instanceName}`,
    `/api/v1/chat/getBase64FromMediaMessage/${instanceName}`,
  ];

  const bodies: Record<string, unknown>[] = [];

  if (input.webhookRecord?.key && input.webhookRecord?.message) {
    bodies.push({
      message: input.webhookRecord,
      convertToMp4: false,
    });
  }

  bodies.push({
    message: { key: { id: input.waMessageId } },
    convertToMp4: false,
  });

  if (input.remoteJid) {
    bodies.push({
      message: {
        key: {
          remoteJid: input.remoteJid,
          fromMe: input.fromMe ?? false,
          id: input.waMessageId,
        },
      },
      convertToMp4: false,
    });
  }

  for (const body of bodies) {
    try {
      const payload = await evolutionFetchWithFallback<unknown>(paths, { body }, 45_000);
      const parsed = parseEvolutionMediaPayload(payload);
      if (parsed) return parsed;
    } catch (error) {
      console.error("[fetchEvolutionMediaBase64]", error);
    }
  }

  return null;
}

export async function fetchEvolutionProfilePicture(numberOrJid: string) {
  const instanceName = await resolveInstanceName();
  const raw = numberOrJid.trim();
  if (!raw) return null;

  const candidates = new Set<string>();
  candidates.add(raw);

  if (raw.includes("@")) {
    const base = raw.split("@")[0] ?? "";
    const digits = toEvolutionSendDigits(normalizeWhatsAppPhone(base));
    if (digits) {
      candidates.add(digits);
      candidates.add(`${digits}@s.whatsapp.net`);
    }
  } else {
    const digits = toEvolutionSendDigits(normalizeWhatsAppPhone(raw));
    if (digits) {
      candidates.add(digits);
      candidates.add(`${digits}@s.whatsapp.net`);
    }
  }

  for (const number of candidates) {
    try {
      const payload = await evolutionFetchWithFallback<{
        profilePictureUrl?: string;
        url?: string;
      }>(
        [
          `/chat/fetchProfilePictureUrl/${instanceName}`,
          `/api/v1/chat/fetchProfilePictureUrl/${instanceName}`,
        ],
        { body: { number } },
      );
      const url = payload.profilePictureUrl ?? payload.url ?? null;
      if (url?.trim()) return url.trim();
    } catch {
      // tenta proximo formato
    }
  }

  return null;
}
