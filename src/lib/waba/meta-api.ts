/**
 * Meta WhatsApp Cloud API — funções usadas pelo módulo Atendimento.
 */

import {
  isRecipientNotAllowedError,
  metaSendPhoneVariants,
  metaSendTargetPhone,
  sanitizePhoneForMeta,
} from "@/lib/waba/phone-utils";

const META_API_VERSION = "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaSendResult {
  messageId: string;
}

export const WABA_COEXISTENCE_WEBHOOK_FIELDS =
  "messages,history,smb_app_state_sync,smb_message_echoes";

export interface MetaPhoneInfo {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  is_on_biz_app?: boolean;
  platform_type?: string;
}

interface MetaErrorResponse {
  error?: { message?: string; code?: number; type?: string };
}

async function throwMetaError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const data = (await response.json()) as MetaErrorResponse;
    if (data.error?.message) message = data.error.message;
  } catch {
    /* keep fallback */
  }
  throw new Error(message);
}

export interface VerifyPhoneNumberArgs {
  phoneNumberId: string;
  accessToken: string;
}

export async function verifyPhoneNumber(args: VerifyPhoneNumberArgs): Promise<MetaPhoneInfo> {
  const { phoneNumberId, accessToken } = args;
  const url = `${META_API_BASE}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) await throwMetaError(response, `Meta API error: ${response.status}`);
  return response.json();
}

export interface RegisterPhoneNumberArgs {
  phoneNumberId: string;
  accessToken: string;
  pin: string;
}

export interface RegisterPhoneNumberResult {
  success: boolean;
  alreadyRegistered: boolean;
}

export async function registerPhoneNumber(
  args: RegisterPhoneNumberArgs,
): Promise<RegisterPhoneNumberResult> {
  const { phoneNumberId, accessToken, pin } = args;
  const url = `${META_API_BASE}/${phoneNumberId}/register`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });

  if (response.ok) return { success: true, alreadyRegistered: false };

  let data: { error?: { message?: string } } = {};
  try {
    data = await response.json();
  } catch {
    /* empty */
  }
  const message = data.error?.message ?? `Meta API error: ${response.status}`;
  if (/already.*registered/i.test(message)) {
    return { success: true, alreadyRegistered: true };
  }
  throw new Error(message);
}

export interface SubscribeWabaToAppArgs {
  wabaId: string;
  accessToken: string;
}

export async function subscribeWabaToApp(args: SubscribeWabaToAppArgs): Promise<void> {
  const { wabaId, accessToken } = args;
  const url = `${META_API_BASE}/${wabaId}/subscribed_apps`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) await throwMetaError(response, `Meta API error: ${response.status}`);
}

export interface SubscribeAppWebhookArgs {
  appId: string;
  appSecret: string;
  callbackUrl: string;
  verifyToken: string;
  fields?: string;
}

/** Inscreve callback URL no app Meta (campo messages do WhatsApp). */
export async function subscribeAppWebhook(args: SubscribeAppWebhookArgs): Promise<void> {
  const appToken = `${args.appId}|${args.appSecret}`;
  const params = new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: args.callbackUrl,
    verify_token: args.verifyToken,
    fields: args.fields ?? "messages",
    access_token: appToken,
  });
  const response = await fetch(`${META_API_BASE}/${args.appId}/subscriptions`, {
    method: "POST",
    body: params,
  });
  if (!response.ok) await throwMetaError(response, `Webhook subscribe failed: ${response.status}`);
}

export function isCoexistenceActive(info: Pick<MetaPhoneInfo, "is_on_biz_app" | "platform_type">) {
  return info.is_on_biz_app === true && info.platform_type === "CLOUD_API";
}

export type SmbAppDataSyncType = "smb_app_state_sync" | "history";

export async function requestSmbAppDataSync(args: {
  phoneNumberId: string;
  accessToken: string;
  syncType: SmbAppDataSyncType;
}): Promise<{ request_id?: string }> {
  const url = `${META_API_BASE}/${args.phoneNumberId}/smb_app_data`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      sync_type: args.syncType,
    }),
  });
  if (!response.ok) await throwMetaError(response, `SMB sync failed: ${response.status}`);
  return response.json();
}

export interface SendTextMessageArgs {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
  contextMessageId?: string;
}

export async function sendTextMessage(args: SendTextMessageArgs): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, text, contextMessageId } = args;
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text },
  };
  if (contextMessageId) body.context = { message_id: contextMessageId };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) await throwMetaError(response, `Meta API error: ${response.status}`);
  const data = await response.json();
  return { messageId: data.messages[0].id };
}

/** Envia texto tentando variantes do número (ex.: BR com/sem 9º dígito). */
export async function sendTextMessageToPhone(
  args: Omit<SendTextMessageArgs, "to"> & { phone: string },
): Promise<MetaSendResult> {
  const sanitized = sanitizePhoneForMeta(args.phone);
  const preferred = metaSendTargetPhone(sanitized);
  const variants = [preferred, ...metaSendPhoneVariants(sanitized).filter((v) => v !== preferred)];
  let lastError: Error | null = null;

  for (const to of variants) {
    try {
      return await sendTextMessage({
        phoneNumberId: args.phoneNumberId,
        accessToken: args.accessToken,
        to,
        text: args.text,
        contextMessageId: args.contextMessageId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(message);
      if (!isRecipientNotAllowedError(message)) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Não foi possível enviar — número fora da lista de teste Meta.");
}

export type MetaMessageTemplate = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: Array<{ type: string; text?: string; format?: string }>;
};

export async function fetchWabaMessageTemplatesFromMeta(args: {
  wabaId: string;
  accessToken: string;
}): Promise<MetaMessageTemplate[]> {
  const url = `${META_API_BASE}/${args.wabaId}/message_templates?limit=100&fields=id,name,status,category,language,components`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });
  if (!response.ok) await throwMetaError(response, `Meta templates error: ${response.status}`);
  const data = (await response.json()) as { data?: MetaMessageTemplate[] };
  return data.data ?? [];
}

export async function resolveMetaMediaDownloadUrl(args: {
  mediaId: string;
  accessToken: string;
}): Promise<{ url: string; mimeType: string | null }> {
  const response = await fetch(`${META_API_BASE}/${args.mediaId}`, {
    headers: { Authorization: `Bearer ${args.accessToken}` },
  });
  if (!response.ok) await throwMetaError(response, `Meta media error: ${response.status}`);
  const data = (await response.json()) as { url?: string; mime_type?: string };
  if (!data.url) throw new Error("Meta nao retornou URL de midia.");
  return { url: data.url, mimeType: data.mime_type ?? null };
}
