import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decrypt, encrypt } from "@/lib/waba/encryption";
import {
  registerPhoneNumber,
  sendTextMessage,
  sendTextMessageToPhone,
  subscribeAppWebhook,
  subscribeWabaToApp,
  verifyPhoneNumber,
  isCoexistenceActive,
  WABA_COEXISTENCE_WEBHOOK_FIELDS,
  fetchWabaMessageTemplatesFromMeta,
} from "@/lib/waba/meta-api";
import { mediaTypeLabel } from "@/lib/atendimento/message-reply";
import {
  ingestWabaConversationMessage,
  triggerCoexistenceSync,
} from "@/lib/waba/coexistence.server";
import {
  canonicalContactPhone,
  isRecipientNotAllowedError,
  metaSendPhoneVariants,
  metaSendTargetPhone,
  sanitizePhoneForMeta,
} from "@/lib/waba/phone-utils";
import { normalizeWhatsAppPhone, phonesMatchLoosely } from "@/lib/whatsapp";
import { runWabaAutomations } from "@/lib/waba/automations-engine.server";
import { DEFAULT_WABA_VERIFY_TOKEN, META_DEVELOPER_APP } from "@/lib/meta/developer-app";
import {
  WABA_WORKSPACE_ID,
  type WabaAutomation,
  type WabaConfigPublic,
  type WabaContact,
  type WabaConversation,
  type WabaMessage,
} from "@/lib/waba/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function db(): Db {
  return supabaseAdmin;
}

const DEFAULT_WABA_PHONE_NUMBER_ID = "1177941225399615";
const DEFAULT_WABA_ID = "1323860869938811";
const DEFAULT_VERIFY_TOKEN = DEFAULT_WABA_VERIFY_TOKEN;

function formVerifyTokenFromRow(verifyTokenEncrypted: string | null | undefined): string {
  if (!verifyTokenEncrypted) return DEFAULT_VERIFY_TOKEN;
  try {
    return decrypt(verifyTokenEncrypted);
  } catch {
    return DEFAULT_VERIFY_TOKEN;
  }
}

export async function getWabaConfigStatus(): Promise<WabaConfigPublic> {
  const { data, error } = await db()
    .from("waba_config")
    .select(
      "phone_number_id, waba_id, access_token, verify_token, status, display_phone_number, coexistence_mode, is_on_biz_app, platform_type, active_provider",
    )
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();

  const formVerifyToken = formVerifyTokenFromRow(data?.verify_token);
  const phoneNumberId = data?.phone_number_id ?? DEFAULT_WABA_PHONE_NUMBER_ID;
  const wabaId = data?.waba_id ?? DEFAULT_WABA_ID;
  const activeProvider =
    data?.active_provider === "baileys" || data?.active_provider === "evolution"
      ? "baileys"
      : "meta";

  if (
    activeProvider === "baileys" &&
    data?.phone_number_id &&
    data?.access_token
  ) {
    return {
      connected: false,
      status: "disconnected",
      phone_number_id: data.phone_number_id,
      display_phone_number: data.display_phone_number ?? null,
      waba_id: data.waba_id ?? wabaId,
      form_verify_token: formVerifyToken,
      coexistence_mode: Boolean(data.coexistence_mode),
      is_on_biz_app: data.is_on_biz_app ?? undefined,
      platform_type: data.platform_type ?? null,
      active_provider: "baileys",
      reason: "baileys_active",
      message: "WhatsApp Web (Baileys) ativo. Conexao Meta nao e verificada neste modo.",
    };
  }

  if (error || !data?.phone_number_id || !data?.access_token) {
    return {
      connected: false,
      status: "disconnected",
      phone_number_id: phoneNumberId,
      display_phone_number: data?.display_phone_number ?? null,
      waba_id: wabaId,
      form_verify_token: formVerifyToken,
      active_provider: activeProvider,
      reason: "no_config",
      message: "Configure a API Meta em Atendimento → Configurações.",
    };
  }

  try {
    const token = decrypt(data.access_token);
    const info = await verifyPhoneNumber({
      phoneNumberId: data.phone_number_id,
      accessToken: token,
    });
    return {
      connected: true,
      status: "connected",
      phone_number_id: data.phone_number_id,
      display_phone_number: info.display_phone_number ?? data.display_phone_number,
      waba_id: data.waba_id,
      form_verify_token: formVerifyToken,
      coexistence_mode: Boolean(data.coexistence_mode),
      is_on_biz_app: info.is_on_biz_app,
      platform_type: info.platform_type ?? null,
      coexistence_active: isCoexistenceActive(info),
      active_provider: activeProvider,
    };
  } catch (err) {
    return {
      connected: false,
      status: "disconnected",
      phone_number_id: data.phone_number_id,
      display_phone_number: data.display_phone_number,
      waba_id: data.waba_id,
      form_verify_token: formVerifyToken,
      coexistence_mode: Boolean(data.coexistence_mode),
      is_on_biz_app: data.is_on_biz_app ?? undefined,
      platform_type: data.platform_type ?? null,
      active_provider: activeProvider,
      reason: "meta_api_error",
      message: err instanceof Error ? err.message : "Falha ao validar token Meta",
    };
  }
}

export async function saveWabaConfig(input: {
  phone_number_id: string;
  waba_id?: string;
  access_token: string;
  verify_token: string;
  pin?: string;
  coexistence_mode?: boolean;
}) {
  let displayPhone: string | null = null;
  const info = await verifyPhoneNumber({
    phoneNumberId: input.phone_number_id,
    accessToken: input.access_token,
  });
  displayPhone = info.display_phone_number ?? null;
  const coexistenceActive = isCoexistenceActive(info);
  const coexistenceMode = Boolean(input.coexistence_mode);

  if (input.waba_id) {
    await subscribeWabaToApp({ wabaId: input.waba_id, accessToken: input.access_token });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const webhookUrl = process.env.WABA_WEBHOOK_URL ?? META_DEVELOPER_APP.webhookUrl;
  const webhookFields = coexistenceMode
    ? WABA_COEXISTENCE_WEBHOOK_FIELDS
    : (process.env.WABA_WEBHOOK_FIELDS ?? "messages");

  if (appId && appSecret) {
    try {
      await subscribeAppWebhook({
        appId,
        appSecret,
        callbackUrl: webhookUrl,
        verifyToken: input.verify_token,
        fields: webhookFields,
      });
    } catch (err) {
      console.error("[waba] Falha ao inscrever webhook Meta:", err);
    }
  }

  // Coexistence: número já registrado no fluxo Meta — NÃO chamar /register (desconecta o app).
  const shouldRegister = Boolean(input.pin) && !coexistenceActive && !coexistenceMode;
  if (shouldRegister) {
    await registerPhoneNumber({
      phoneNumberId: input.phone_number_id,
      accessToken: input.access_token,
      pin: input.pin!,
    });
  }

  const row = {
    workspace_id: WABA_WORKSPACE_ID,
    phone_number_id: input.phone_number_id,
    waba_id: input.waba_id ?? null,
    access_token: encrypt(input.access_token),
    verify_token: encrypt(input.verify_token),
    display_phone_number: displayPhone,
    status: "connected",
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    coexistence_mode: coexistenceMode,
    active_provider: "meta",
    is_on_biz_app: info.is_on_biz_app ?? null,
    platform_type: info.platform_type ?? null,
  };

  const { error } = await db().from("waba_config").upsert(row, { onConflict: "workspace_id" });
  if (error) throw new Error(error.message);

  if (coexistenceMode && coexistenceActive) {
    try {
      await triggerCoexistenceSync("contacts");
    } catch (err) {
      console.error("[waba] Falha ao iniciar sync coexistência:", err);
    }
  }

  if (input.waba_id) {
    try {
      await syncWabaMessageTemplatesFromMeta();
    } catch (err) {
      console.error("[waba] Falha ao sincronizar templates Meta:", err);
    }
  }

  return getWabaConfigStatus();
}

export async function listWabaConversations(): Promise<WabaConversation[]> {
  const { data, error } = await db()
    .from("waba_conversations")
    .select("*, contact:waba_contacts(*)")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as WabaConversation[];
}

export async function listWabaMessages(
  conversationId: string,
  options?: { history?: boolean },
): Promise<WabaMessage[]> {
  const history = options?.history ?? false;
  const SESSION_LIMIT = 100;
  const HISTORY_LIMIT = 400;
  let sessionAt: string | null = null;

  if (!history) {
    const { data: conv } = await db()
      .from("waba_conversations")
      .select("attendance_opened_at")
      .eq("id", conversationId)
      .maybeSingle();
    sessionAt = conv?.attendance_opened_at ?? null;
  }

  let query = db().from("waba_messages").select("*").eq("conversation_id", conversationId);

  if (!history && sessionAt) {
    query = query.gte("created_at", sessionAt);
  }

  const limit = history ? HISTORY_LIMIT : SESSION_LIMIT;
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

  if (error) throw new Error(error.message);
  return ([...(data ?? [])] as WabaMessage[]).reverse();
}

export async function getWabaMessageHistoryMeta(
  conversationId: string,
  options: {
    history?: boolean;
    fetchedCount: number;
    sessionAt?: string | null;
  },
): Promise<import("@/lib/waba/types").AtendimentoMessagesMeta> {
  const sessionAt = options.sessionAt ?? null;
  const base = {
    hasOlderBeforeSession: false,
    hasMoreInSession: false,
    hasMoreInHistory: false,
    sessionAt,
  };

  if (sessionAt) {
    const { count, error } = await db()
      .from("waba_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .lt("created_at", sessionAt);
    if (!error) base.hasOlderBeforeSession = (count ?? 0) > 0;
  }

  const { count: totalCount, error: totalError } = await db()
    .from("waba_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  const total = totalError ? options.fetchedCount : (totalCount ?? 0);

  if (!sessionAt && !options.history) {
    base.hasOlderBeforeSession = total > options.fetchedCount;
    base.hasMoreInSession = total > 100;
  }

  if (!options.history && sessionAt) {
    const { count, error } = await db()
      .from("waba_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .gte("created_at", sessionAt);
    if (!error) {
      base.hasMoreInSession = (count ?? 0) > 100 || options.fetchedCount >= 100;
    }
  }

  if (options.history) {
    base.hasMoreInHistory = total > 400 || options.fetchedCount >= 400;
  }

  return base;
}

export async function markConversationRead(conversationId: string) {
  await db()
    .from("waba_conversations")
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

async function getConnectedConfig() {
  const { data } = await db()
    .from("waba_config")
    .select("*")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();
  if (!data?.access_token || !data.phone_number_id) {
    throw new Error("WhatsApp Meta não configurado.");
  }
  return {
    phoneNumberId: data.phone_number_id as string,
    accessToken: decrypt(data.access_token as string),
  };
}

export async function sendWabaTextMessage(input: {
  conversationId: string;
  text: string;
  agentUserId: string;
  quotedMessageId?: string;
}) {
  const { data: conv, error: convErr } = await db()
    .from("waba_conversations")
    .select("id, contact_id, contact:waba_contacts(id, phone)")
    .eq("id", input.conversationId)
    .maybeSingle();

  if (convErr || !conv) throw new Error("Conversa não encontrada.");
  const contact = conv.contact as { id: string; phone?: string } | null;
  const phone = contact?.phone;
  if (!phone) throw new Error("Contato sem telefone.");

  let contextMessageId: string | undefined;
  let replyToWaMessageId: string | null = null;
  let replyToText: string | null = null;
  let replyToFromMe: boolean | null = null;

  if (input.quotedMessageId) {
    const { data: quoted } = await db()
      .from("waba_messages")
      .select("wa_message_id, content_text, content_type, sender_type")
      .eq("id", input.quotedMessageId)
      .maybeSingle();
    if (quoted?.wa_message_id) {
      contextMessageId = quoted.wa_message_id;
      replyToWaMessageId = quoted.wa_message_id;
      replyToText =
        quoted.content_text?.trim() ||
        mediaTypeLabel(quoted.content_type as WabaMessage["content_type"]);
      replyToFromMe = quoted.sender_type !== "customer";
    }
  }

  if (!contextMessageId) {
    const { data: lastInbound } = await db()
      .from("waba_messages")
      .select("wa_message_id")
      .eq("conversation_id", input.conversationId)
      .eq("sender_type", "customer")
      .not("wa_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    contextMessageId =
      lastInbound?.wa_message_id && !String(lastInbound.wa_message_id).includes("validation")
        ? lastInbound.wa_message_id
        : undefined;
  }

  const cfg = await getConnectedConfig();
  const sanitized = sanitizePhoneForMeta(phone);
  const preferred = metaSendTargetPhone(sanitized);
  const variants = [preferred, ...metaSendPhoneVariants(sanitized).filter((v) => v !== preferred)];

  let result: Awaited<ReturnType<typeof sendTextMessageToPhone>> | null = null;
  let workingPhone = sanitized;
  let lastError: Error | null = null;

  for (const to of variants) {
    try {
      result = await sendTextMessage({
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
        to,
        text: input.text,
        contextMessageId,
      });
      workingPhone = to;
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = err instanceof Error ? err : new Error(message);
      if (!isRecipientNotAllowedError(message)) {
        throw lastError;
      }
    }
  }

  if (!result) {
    throw lastError ?? new Error("Não foi possível enviar — número fora da lista de teste Meta.");
  }

  if (contact?.id && workingPhone !== sanitized) {
    await db()
      .from("waba_contacts")
      .update({ phone: workingPhone, updated_at: new Date().toISOString() })
      .eq("id", contact.id);
  }

  const { data: msg, error } = await db()
    .from("waba_messages")
    .insert({
      conversation_id: input.conversationId,
      sender_type: "agent",
      sender_id: input.agentUserId || null,
      content_type: "text",
      content_text: input.text,
      wa_message_id: result.messageId,
      status: "sent",
      reply_to_wa_message_id: replyToWaMessageId,
      reply_to_text: replyToText,
      reply_to_from_me: replyToFromMe,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await db()
    .from("waba_conversations")
    .update({
      last_message_text: input.text,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(input.agentUserId ? { assigned_agent_id: input.agentUserId } : {}),
    })
    .eq("id", input.conversationId);

  return msg as WabaMessage;
}

export async function listWabaContacts(search?: string): Promise<WabaContact[]> {
  let q = db()
    .from("waba_contacts")
    .select("*")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .order("updated_at", { ascending: false });

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    q = q.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as WabaContact[];
}

function isValidAutoContactPhone(phone: string, lidJid?: string | null) {
  const digits = normalizeWhatsAppPhone(phone);
  if (digits.length < 10 || digits.length > 15) return false;
  if (lidJid?.endsWith("@lid")) {
    const lidDigits = lidJid.split("@")[0] ?? "";
    if (digits === lidDigits) return false;
  }
  return true;
}

function pickAutoContactName(
  existing: string | null | undefined,
  incoming: string | null | undefined,
  phone: string,
) {
  const current = existing?.trim();
  const next = incoming?.trim();
  if (!current) return next || phone;
  if (!next) return current;
  if (normalizeWhatsAppPhone(current) === normalizeWhatsAppPhone(next)) return current;
  if (current.length >= next.length) return current;
  return next;
}

function normalizeWabaDisplayName(name: string | null | undefined) {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function findWabaContactByPhone(phone: string): Promise<WabaContact | null> {
  const canonical = canonicalContactPhone(phone);
  const digits = canonical.replace(/\D/g, "");
  if (!digits) return null;

  const { data, error } = await db()
    .from("waba_contacts")
    .select("*")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .eq("phone_normalized", digits)
    .maybeSingle();
  if (!error && data) return data as WabaContact;

  const { data: rows, error: listError } = await db()
    .from("waba_contacts")
    .select("*")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .ilike("phone", `%${digits.slice(-8)}%`)
    .limit(12);
  if (listError) return null;

  return ((rows ?? []).find((row) => phonesMatchLoosely((row as WabaContact).phone, canonical)) ??
    null) as WabaContact | null;
}

/** Busca contato na agenda pelo nome exato (sem acentos / caixa). */
export async function findWabaContactByDisplayName(
  name: string | null | undefined,
): Promise<WabaContact | null> {
  const term = normalizeWabaDisplayName(name);
  if (!term || term.length < 2) return null;

  const contacts = await listWabaContacts();
  const matches = contacts.filter((contact) => normalizeWabaDisplayName(contact.name) === term);
  if (matches.length !== 1) return null;
  return matches[0] ?? null;
}

/** Cria ou atualiza contato na agenda quando alguem manda mensagem. */
export async function ensureWabaContactFromMessage(input: {
  phone: string;
  name?: string | null;
  lidJid?: string | null;
}): Promise<WabaContact | null> {
  if (!isValidAutoContactPhone(input.phone, input.lidJid)) return null;

  const phone = canonicalContactPhone(input.phone);
  const existing = await findWabaContactByPhone(phone);
  const name = pickAutoContactName(existing?.name, input.name, phone);

  const { data, error } = await db()
    .from("waba_contacts")
    .upsert(
      {
        workspace_id: WABA_WORKSPACE_ID,
        phone,
        name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,phone_normalized" },
    )
    .select("*")
    .single();

  if (error) {
    console.error("[ensureWabaContactFromMessage]", error);
    return null;
  }

  const contact = data as WabaContact;
  if (!existing) {
    void runWabaAutomations({
      triggerType: "new_contact_created",
      contactId: contact.id,
    }).catch(console.error);
  }

  return contact;
}

export async function upsertWabaContact(input: {
  id?: string;
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  userId: string;
}) {
  const phone = canonicalContactPhone(input.phone);
  const payload = {
    workspace_id: WABA_WORKSPACE_ID,
    phone,
    name: input.name ?? null,
    email: input.email ?? null,
    company: input.company ?? null,
    updated_at: new Date().toISOString(),
    ...(input.id ? {} : { created_by: input.userId }),
  };

  if (input.id) {
    const { data, error } = await db()
      .from("waba_contacts")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const contact = data as WabaContact;
    if (input.name?.trim()) {
      void import("@/lib/api/whatsapp-store.server")
        .then(({ syncAgendaNameToWhatsAppChats }) =>
          syncAgendaNameToWhatsAppChats(phone, input.name!.trim()),
        )
        .catch(console.error);
    }
    void import("@/lib/api/whatsapp-store.server")
      .then(({ syncAgendaPhoneToWhatsAppChats }) => syncAgendaPhoneToWhatsAppChats(phone))
      .catch(console.error);
    return contact;
  }

  const { data, error } = await db()
    .from("waba_contacts")
    .upsert(payload, { onConflict: "workspace_id,phone_normalized" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  void runWabaAutomations({
    triggerType: "new_contact_created",
    contactId: (data as WabaContact).id,
  }).catch(console.error);

  const contact = data as WabaContact;
  if (input.name?.trim()) {
    void import("@/lib/api/whatsapp-store.server")
      .then(({ syncAgendaNameToWhatsAppChats }) =>
        syncAgendaNameToWhatsAppChats(phone, input.name!.trim()),
      )
      .catch(console.error);
  }

  return contact;
}

export async function deleteWabaContact(id: string) {
  const { error } = await db().from("waba_contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function listWabaAutomations(): Promise<WabaAutomation[]> {
  const { data, error } = await db()
    .from("waba_automations")
    .select("*")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WabaAutomation[];
}

export async function setWabaAutomationActive(id: string, isActive: boolean) {
  const { data, error } = await db()
    .from("waba_automations")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as WabaAutomation;
}

export async function createWabaAutomation(input: {
  name: string;
  description?: string;
  trigger_type: string;
  reply_text: string;
  userId: string;
  keyword?: string;
}) {
  const trigger_config: Record<string, unknown> = {};
  if (input.keyword?.trim()) {
    trigger_config.keyword = input.keyword.trim();
  }

  const { data: automation, error: autoErr } = await db()
    .from("waba_automations")
    .insert({
      workspace_id: WABA_WORKSPACE_ID,
      name: input.name,
      description: input.description ?? null,
      trigger_type: input.trigger_type,
      trigger_config,
      is_active: false,
      created_by: input.userId,
    })
    .select("*")
    .single();
  if (autoErr) throw new Error(autoErr.message);

  const { error: stepErr } = await db()
    .from("waba_automation_steps")
    .insert({
      automation_id: automation.id,
      step_type: "send_message",
      step_config: { message: input.reply_text },
      position: 0,
    });
  if (stepErr) throw new Error(stepErr.message);

  return automation as WabaAutomation;
}

export async function deleteWabaAutomation(id: string) {
  const { error } = await db().from("waba_automations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function getWabaAutomationForEdit(id: string) {
  const { data: automation, error } = await db()
    .from("waba_automations")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!automation) throw new Error("Automação não encontrada.");

  const { data: steps, error: stepsError } = await db()
    .from("waba_automation_steps")
    .select("step_type, step_config, position")
    .eq("automation_id", id)
    .order("position", { ascending: true });
  if (stepsError) throw new Error(stepsError.message);

  const replyStep = steps?.find((step) => step.step_type === "send_message") ?? steps?.[0];
  const reply_text = String(replyStep?.step_config?.message ?? "").trim();

  return {
    ...(automation as WabaAutomation),
    reply_text,
    keyword: String((automation as WabaAutomation).trigger_config?.keyword ?? "").trim(),
  };
}

export async function updateWabaAutomation(input: {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  reply_text: string;
  keyword?: string;
}) {
  const trigger_config: Record<string, unknown> = {};
  if (input.keyword?.trim()) {
    trigger_config.keyword = input.keyword.trim();
  }

  const { data: automation, error } = await db()
    .from("waba_automations")
    .update({
      name: input.name,
      description: input.description ?? null,
      trigger_type: input.trigger_type,
      trigger_config,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const { data: steps, error: stepsError } = await db()
    .from("waba_automation_steps")
    .select("id, position")
    .eq("automation_id", input.id)
    .order("position", { ascending: true });
  if (stepsError) throw new Error(stepsError.message);

  const replyStep = steps?.[0];
  if (replyStep?.id) {
    const { error: updateStepError } = await db()
      .from("waba_automation_steps")
      .update({ step_config: { message: input.reply_text } })
      .eq("id", replyStep.id);
    if (updateStepError) throw new Error(updateStepError.message);
  } else {
    const { error: insertStepError } = await db()
      .from("waba_automation_steps")
      .insert({
        automation_id: input.id,
        step_type: "send_message",
        step_config: { message: input.reply_text },
        position: 0,
      });
    if (insertStepError) throw new Error(insertStepError.message);
  }

  return automation as WabaAutomation;
}

export async function listWabaTemplates() {
  const { data, error } = await db()
    .from("waba_message_templates")
    .select("*")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function syncWabaMessageTemplatesFromMeta() {
  const { data: cfg } = await db()
    .from("waba_config")
    .select("waba_id, access_token")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();
  if (!cfg?.waba_id || !cfg.access_token) {
    throw new Error("Configure WABA ID e token Meta antes de sincronizar templates.");
  }

  const templates = await fetchWabaMessageTemplatesFromMeta({
    wabaId: cfg.waba_id as string,
    accessToken: decrypt(cfg.access_token as string),
  });

  const now = new Date().toISOString();
  for (const template of templates) {
    const bodyComponent = template.components?.find((item) => item.type === "BODY");
    const headerComponent = template.components?.find((item) => item.type === "HEADER");
    const footerComponent = template.components?.find((item) => item.type === "FOOTER");
    await db()
      .from("waba_message_templates")
      .upsert(
        {
          workspace_id: WABA_WORKSPACE_ID,
          name: template.name,
          category: template.category ?? "UTILITY",
          language: template.language ?? "pt_BR",
          body_text: bodyComponent?.text ?? template.name,
          header_type: headerComponent?.format ?? null,
          header_content: headerComponent?.text ?? null,
          footer_text: footerComponent?.text ?? null,
          status: template.status ?? "Draft",
          meta_template_id: template.id,
          updated_at: now,
        },
        { onConflict: "workspace_id,name,language" },
      );
  }

  return listWabaTemplates();
}

export async function listWabaTags() {
  const { data, error } = await db()
    .from("waba_tags")
    .select("*")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertWabaTag(input: { id?: string; name: string; color?: string }) {
  const row = {
    workspace_id: WABA_WORKSPACE_ID,
    name: input.name.trim(),
    color: input.color ?? "#9f6c53",
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data, error } = await db()
      .from("waba_tags")
      .update(row)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await db()
    .from("waba_tags")
    .upsert(row, { onConflict: "workspace_id,name" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listContactTagIds(contactId: string) {
  const { data, error } = await db()
    .from("waba_contact_tags")
    .select("tag_id")
    .eq("contact_id", contactId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.tag_id as string);
}

/** Mapa contact_id -> tag_ids para filtros na inbox. */
export async function listContactTagsIndex(): Promise<Record<string, string[]>> {
  const { data, error } = await db().from("waba_contact_tags").select("contact_id, tag_id");
  if (error) throw new Error(error.message);
  const index: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const contactId = String(row.contact_id);
    if (!index[contactId]) index[contactId] = [];
    index[contactId].push(String(row.tag_id));
  }
  return index;
}

export async function setContactTags(contactId: string, tagIds: string[]) {
  await db().from("waba_contact_tags").delete().eq("contact_id", contactId);
  if (tagIds.length === 0) return;
  const { error } = await db()
    .from("waba_contact_tags")
    .insert(tagIds.map((tagId) => ({ contact_id: contactId, tag_id: tagId })));
  if (error) throw new Error(error.message);
}

export async function listWabaAutomationLogs(limit = 50) {
  const { data, error } = await db()
    .from("waba_automation_logs")
    .select("*, automation:waba_automations(name), contact:waba_contacts(name, phone)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Usado pelo webhook Meta — resolve verify_token em texto plano */
export async function findWabaVerifyTokenMatch(plainToken: string): Promise<boolean> {
  const envToken = process.env.WABA_VERIFY_TOKEN?.trim();
  if (envToken && envToken === plainToken) return true;

  const { data } = await db()
    .from("waba_config")
    .select("verify_token")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();

  if (!data?.verify_token) {
    return plainToken === DEFAULT_VERIFY_TOKEN;
  }

  try {
    return decrypt(data.verify_token) === plainToken;
  } catch {
    return plainToken === DEFAULT_VERIFY_TOKEN;
  }
}

export async function processInboundWabaMessage(input: {
  phoneNumberId: string;
  from: string;
  waMessageId: string;
  type: string;
  text?: string;
  contactName?: string;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  fileName?: string | null;
  replyToWaMessageId?: string | null;
  replyToText?: string | null;
  replyToFromMe?: boolean | null;
}) {
  await ingestWabaConversationMessage({
    customerPhone: input.from,
    customerName: input.contactName,
    waMessageId: input.waMessageId,
    senderType: "customer",
    type: input.type,
    text: input.text,
    mediaUrl: input.mediaUrl,
    mediaMime: input.mediaMime,
    fileName: input.fileName,
    replyToWaMessageId: input.replyToWaMessageId,
    replyToText: input.replyToText,
    replyToFromMe: input.replyToFromMe,
    status: "delivered",
    bumpUnread: true,
    runAutomations: true,
  });
}

export async function updateWabaMessageStatus(
  waMessageId: string,
  status: string,
  errorDetail?: string,
) {
  const mapped =
    status === "read"
      ? "read"
      : status === "delivered"
        ? "delivered"
        : status === "failed"
          ? "failed"
          : "sent";

  const { data: existing } = await db()
    .from("waba_messages")
    .select("status")
    .eq("wa_message_id", waMessageId)
    .maybeSingle();

  if (!existing) return;

  if ((existing.status === "delivered" || existing.status === "read") && mapped === "failed") {
    console.warn("[waba] status failed ignorado após entrega", waMessageId);
    return;
  }

  const patch: Record<string, string> = { status: mapped };
  if (errorDetail && mapped === "failed") {
    patch.error_detail = errorDetail.slice(0, 500);
  }

  let { error: updErr } = await db()
    .from("waba_messages")
    .update(patch)
    .eq("wa_message_id", waMessageId);
  if (updErr?.message?.includes("error_detail")) {
    await db().from("waba_messages").update({ status: mapped }).eq("wa_message_id", waMessageId);
  }
}
