import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decrypt } from "@/lib/waba/encryption";
import {
  isCoexistenceActive,
  requestSmbAppDataSync,
  verifyPhoneNumber,
  WABA_COEXISTENCE_WEBHOOK_FIELDS,
} from "@/lib/waba/meta-api";
import { canonicalContactPhone } from "@/lib/waba/phone-utils";
import { runWabaAutomations } from "@/lib/waba/automations-engine.server";
import {
  WABA_WORKSPACE_ID,
  type WabaContact,
  type WabaConversation,
  type WabaMessage,
} from "@/lib/waba/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function db(): Db {
  return supabaseAdmin;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function extractTextFromMetaMessage(msg: Record<string, unknown>): string | undefined {
  const type = String(msg.type ?? "text");
  if (type === "text" && msg.text && typeof msg.text === "object") {
    const body = (msg.text as { body?: string }).body;
    return body ?? undefined;
  }
  return undefined;
}

async function getWorkspaceCredentials() {
  const { data } = await db()
    .from("waba_config")
    .select("phone_number_id, access_token, display_phone_number")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();

  if (!data?.phone_number_id || !data?.access_token) return null;

  return {
    phoneNumberId: data.phone_number_id as string,
    accessToken: decrypt(data.access_token as string),
    displayPhone: digitsOnly((data.display_phone_number as string) ?? ""),
  };
}

/** Grava mensagem na conversa (inbound, echo do celular ou histórico). */
export async function ingestWabaConversationMessage(input: {
  customerPhone: string;
  customerName?: string;
  waMessageId: string;
  senderType: WabaMessage["sender_type"];
  type: string;
  text?: string;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  fileName?: string | null;
  replyToWaMessageId?: string | null;
  replyToText?: string | null;
  replyToFromMe?: boolean | null;
  status?: WabaMessage["status"];
  bumpUnread?: boolean;
  runAutomations?: boolean;
  createdAt?: string;
}) {
  const phone = canonicalContactPhone(input.customerPhone);
  const displayName = input.customerName?.trim() || phone;
  const contentText = input.text ?? input.fileName ?? `[${input.type}]`;
  const createdAt = input.createdAt ?? new Date().toISOString();
  const contentType =
    input.type === "text"
      ? "text"
      : input.type === "sticker"
        ? "image"
        : (input.type as WabaMessage["content_type"]);

  const { data: cfgRow } = await db()
    .from("waba_config")
    .select("connected_at")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();

  if (cfgRow?.connected_at) {
    const connMs = new Date(String(cfgRow.connected_at)).getTime();
    if (new Date(createdAt).getTime() < connMs - 2_000) {
      return;
    }
  }

  const { data: contactRow } = await db()
    .from("waba_contacts")
    .upsert(
      {
        workspace_id: WABA_WORKSPACE_ID,
        phone,
        name: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,phone_normalized" },
    )
    .select("*")
    .single();

  const contact = contactRow as WabaContact;

  const { data: existingConv } = await db()
    .from("waba_conversations")
    .select("id, status, attendance_opened_at, unread_count")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .eq("contact_id", contact.id)
    .maybeSingle();

  const wasClosed = existingConv?.status === "closed";
  const { isStoreOpenForAtendimento } = await import("@/lib/atendimento/atendimento-hours.server");
  const storeOpen = await isStoreOpenForAtendimento(new Date(createdAt));
  const afterHoursCustomerInbound = input.senderType === "customer" && !storeOpen;
  const newSessionAt =
    input.senderType === "customer" && (wasClosed || afterHoursCustomerInbound)
      ? createdAt
      : (existingConv?.attendance_opened_at ?? createdAt);

  const { data: convRow } = await db()
    .from("waba_conversations")
    .upsert(
      {
        workspace_id: WABA_WORKSPACE_ID,
        contact_id: contact.id,
        status: input.senderType === "customer" ? "open" : (existingConv?.status ?? "open"),
        attendance_opened_at: newSessionAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,contact_id" },
    )
    .select("*")
    .single();

  const conversation = convRow as WabaConversation;

  const { data: existing } = await db()
    .from("waba_messages")
    .select("id")
    .eq("wa_message_id", input.waMessageId)
    .maybeSingle();

  const { error: insertError } = await db()
    .from("waba_messages")
    .upsert(
      {
        conversation_id: conversation.id,
        sender_type: input.senderType,
        content_type: contentType,
        content_text: contentText,
        media_url: input.mediaUrl ?? null,
        wa_message_id: input.waMessageId,
        status: input.status ?? "delivered",
        created_at: createdAt,
        reply_to_wa_message_id: input.replyToWaMessageId ?? null,
        reply_to_text: input.replyToText ?? null,
        reply_to_from_me: input.replyToFromMe ?? null,
      },
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    );
  if (insertError && !existing) throw insertError;

  if (input.senderType === "customer" && (wasClosed || afterHoursCustomerInbound)) {
    await db()
      .from("waba_conversations")
      .update({
        status: "open",
        attendance_opened_at: createdAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
  }

  const unreadDelta = input.bumpUnread ? 1 : 0;

  await db()
    .from("waba_conversations")
    .update({
      last_message_text: contentText,
      last_message_at: createdAt,
      unread_count: input.bumpUnread
        ? (conversation.unread_count ?? 0) + unreadDelta
        : conversation.unread_count,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  if (input.runAutomations && input.senderType === "customer") {
    const { count: priorCount } = await db()
      .from("waba_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversation.id)
      .eq("sender_type", "customer");

    void runWabaAutomations({
      triggerType: (priorCount ?? 0) <= 1 ? "first_inbound_message" : "new_message_received",
      contactId: contact.id,
      conversationId: conversation.id,
      messageText: contentText,
    }).catch(console.error);
  }
}

export async function processSmbMessageEchoes(
  echoes: Array<Record<string, unknown>>,
  metadata?: { display_phone_number?: string },
) {
  const creds = await getWorkspaceCredentials();
  const businessDigits = digitsOnly(metadata?.display_phone_number ?? creds?.displayPhone ?? "");

  for (const raw of echoes) {
    const to = String(raw.to ?? "");
    const waMessageId = String(raw.id ?? "");
    if (!to || !waMessageId) continue;

    const fromDigits = digitsOnly(String(raw.from ?? ""));
    const senderType: WabaMessage["sender_type"] =
      businessDigits && fromDigits === businessDigits ? "agent" : "customer";
    const customerPhone = senderType === "agent" ? to : String(raw.from ?? to);
    const text = extractTextFromMetaMessage(raw);
    const ts = raw.timestamp ? new Date(Number(raw.timestamp) * 1000).toISOString() : undefined;

    await ingestWabaConversationMessage({
      customerPhone,
      waMessageId,
      senderType,
      type: String(raw.type ?? "text"),
      text,
      status: "delivered",
      bumpUnread: false,
      runAutomations: false,
      createdAt: ts,
    });
  }
}

export async function processSmbAppStateSync(
  contacts: Array<{
    type?: string;
    contact?: { full_name?: string; first_name?: string; phone_number?: string };
    action?: string;
  }>,
) {
  for (const item of contacts) {
    if (item.type !== "contact" || item.action === "delete") continue;
    const c = item.contact;
    const phoneRaw = c?.phone_number;
    if (!phoneRaw) continue;
    const phone = canonicalContactPhone(phoneRaw);
    const name = c?.full_name?.trim() || c?.first_name?.trim() || phone;

    await db().from("waba_contacts").upsert(
      {
        workspace_id: WABA_WORKSPACE_ID,
        phone,
        name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,phone_normalized" },
    );
  }
}

export async function processHistoryWebhook(
  historyChunks: Array<{
    metadata?: { progress?: number };
    threads?: Array<{
      id?: string;
      messages?: Array<Record<string, unknown>>;
    }>;
    errors?: Array<{ code?: number }>;
  }>,
  _metadata?: { display_phone_number?: string },
) {
  // Histórico desativado — painel só recebe mensagens novas após a conexão.
  console.info("[waba/coexistence] webhook history ignorado (sem importar histórico)");
  void historyChunks;
  return;
}

export async function getCoexistenceStatus() {
  const { data } = await db()
    .from("waba_config")
    .select(
      "coexistence_mode, is_on_biz_app, platform_type, coexistence_contacts_synced_at, coexistence_history_synced_at, phone_number_id, access_token",
    )
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();

  if (!data?.phone_number_id || !data?.access_token) {
    return {
      active: false,
      coexistence_mode: false,
      message: "Configure a API Meta primeiro.",
    };
  }

  try {
    const info = await verifyPhoneNumber({
      phoneNumberId: data.phone_number_id,
      accessToken: decrypt(data.access_token),
    });
    const active = isCoexistenceActive(info);

    await db()
      .from("waba_config")
      .update({
        is_on_biz_app: info.is_on_biz_app ?? null,
        platform_type: info.platform_type ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", WABA_WORKSPACE_ID);

    return {
      active,
      coexistence_mode: Boolean(data.coexistence_mode),
      is_on_biz_app: info.is_on_biz_app ?? false,
      platform_type: info.platform_type ?? null,
      contacts_synced_at: data.coexistence_contacts_synced_at,
      history_synced_at: data.coexistence_history_synced_at,
      message: active
        ? "Celular e API ativos no mesmo número (Coexistence)."
        : "Número ainda não está em modo Coexistence. Siga o guia de conexão no Meta.",
    };
  } catch (err) {
    return {
      active: false,
      coexistence_mode: Boolean(data.coexistence_mode),
      message: err instanceof Error ? err.message : "Falha ao verificar coexistência",
    };
  }
}

export async function triggerCoexistenceSync(which: "contacts" | "history" | "both" = "both") {
  const { data } = await db()
    .from("waba_config")
    .select(
      "phone_number_id, access_token, coexistence_contacts_synced_at, coexistence_history_synced_at",
    )
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();

  if (!data?.phone_number_id || !data?.access_token) {
    throw new Error("Configure a API Meta antes de sincronizar.");
  }

  const accessToken = decrypt(data.access_token);
  const results: string[] = [];

  if ((which === "contacts" || which === "both") && !data.coexistence_contacts_synced_at) {
    const res = await requestSmbAppDataSync({
      phoneNumberId: data.phone_number_id,
      accessToken,
      syncType: "smb_app_state_sync",
    });
    await db()
      .from("waba_config")
      .update({
        coexistence_contacts_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", WABA_WORKSPACE_ID);
    results.push(`Contatos: solicitação enviada (${res.request_id ?? "ok"})`);
  } else if (which === "contacts" || which === "both") {
    results.push("Contatos: já sincronizados anteriormente");
  }

  if ((which === "history" || which === "both") && !data.coexistence_history_synced_at) {
    const res = await requestSmbAppDataSync({
      phoneNumberId: data.phone_number_id,
      accessToken,
      syncType: "history",
    });
    results.push(`Histórico: solicitação enviada (${res.request_id ?? "ok"})`);
  } else if (which === "history" || which === "both") {
    results.push("Histórico: já solicitado anteriormente");
  }

  return { ok: true, messages: results };
}
