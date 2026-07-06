import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decrypt } from "@/lib/waba/encryption";
import { sendTextMessageToPhone } from "@/lib/waba/meta-api";
import { canonicalContactPhone } from "@/lib/waba/phone-utils";
import { WABA_WORKSPACE_ID } from "@/lib/waba/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface RunInput {
  triggerType: string;
  contactId: string;
  conversationId?: string;
  messageText?: string;
  inboundMessageId?: string;
}

async function sendAutomationReply(phone: string, message: string) {
  const { getActiveProvider } = await import("@/lib/atendimento/atendimento-provider.server");
  const provider = await getActiveProvider();
  const digits = canonicalContactPhone(phone).replace(/\D/g, "");

  if (provider === "baileys") {
    const { sendBaileysText } = await import("@/lib/api/whatsapp-baileys.server");
    await sendBaileysText(digits, message);
    return "baileys" as const;
  }

  const db = supabaseAdmin as Db;
  const { data: config } = await db
    .from("waba_config")
    .select("phone_number_id, access_token")
    .eq("workspace_id", WABA_WORKSPACE_ID)
    .maybeSingle();

  if (!config?.access_token || !config.phone_number_id) {
    throw new Error("Meta WhatsApp nao configurado para automacoes.");
  }

  await sendTextMessageToPhone({
    phoneNumberId: config.phone_number_id,
    accessToken: decrypt(config.access_token),
    phone,
    text: message,
  });
  return "meta" as const;
}

async function logAutomationReply(input: {
  channel: "baileys" | "evolution" | "meta";
  conversationId?: string;
  message: string;
}) {
  if (!input.conversationId) return;

  if (input.channel === "baileys" || input.channel === "evolution") {
    const { getWhatsAppChatById, insertWhatsAppMessage } =
      await import("@/lib/api/whatsapp-store.server");
    const chat = await getWhatsAppChatById(input.conversationId);
    if (!chat) return;
    await insertWhatsAppMessage({
      chatId: input.conversationId,
      remoteJid: chat.remote_jid,
      waMessageId: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      direction: "outbound",
      messageType: "text",
      body: input.message,
      status: "sent",
    });
    return;
  }

  const db = supabaseAdmin as Db;
  await db.from("waba_messages").insert({
    conversation_id: input.conversationId,
    sender_type: "bot",
    content_type: "text",
    content_text: input.message,
    status: "sent",
  });
}

function matchesKeywordTrigger(
  automation: { trigger_config?: Record<string, unknown> | null },
  messageText?: string,
) {
  const keyword = String(automation.trigger_config?.keyword ?? "")
    .trim()
    .toLowerCase();
  if (!keyword || !messageText) return false;
  return messageText.toLowerCase().includes(keyword);
}

async function shouldSkipAutomation(
  db: Db,
  automation: {
    id: string;
    trigger_type: string;
    trigger_config?: Record<string, unknown> | null;
  },
  contactId: string,
  inboundMessageId?: string,
) {
  if (inboundMessageId && automation.trigger_type === "first_inbound_message") {
    const dedupeKey = `${automation.trigger_type}:${inboundMessageId}`;
    const { data: prior } = await db
      .from("waba_automation_logs")
      .select("id")
      .eq("automation_id", automation.id)
      .eq("contact_id", contactId)
      .eq("trigger_event", dedupeKey)
      .eq("status", "success")
      .maybeSingle();
    if (prior) return true;
  }

  if (automation.trigger_type === "keyword_match") return false;
  if (automation.trigger_config?.repeat === true) return false;

  const { data: logs, error } = await db
    .from("waba_automation_logs")
    .select("created_at")
    .eq("automation_id", automation.id)
    .eq("contact_id", contactId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !logs?.length) return false;

  const lastAt = new Date(logs[0].created_at as string).getTime();
  const cooldownHours =
    typeof automation.trigger_config?.cooldown_hours === "number"
      ? automation.trigger_config.cooldown_hours
      : automation.trigger_type === "new_message_received"
        ? 24
        : null;

  if (cooldownHours != null) {
    return Date.now() - lastAt < cooldownHours * 60 * 60 * 1000;
  }

  return true;
}

export async function runAtendimentoAutomations(input: RunInput): Promise<void> {
  try {
    const db = supabaseAdmin as Db;
    const { isStoreOpenForAtendimento } =
      await import("@/lib/atendimento/atendimento-hours.server");
    const storeOpen = await isStoreOpenForAtendimento();

    const { data: automations, error } = await db
      .from("waba_automations")
      .select("*, steps:waba_automation_steps(*)")
      .eq("workspace_id", WABA_WORKSPACE_ID)
      .eq("is_active", true);

    if (error || !automations?.length) return;

    const { data: contact } = await db
      .from("waba_contacts")
      .select("phone")
      .eq("id", input.contactId)
      .maybeSingle();

    if (!contact?.phone) return;

    const eligible = automations.filter(
      (automation: { trigger_type: string; trigger_config?: Record<string, unknown> | null }) => {
        if (automation.trigger_type === "outside_store_hours") {
          return !storeOpen;
        }
        if (automation.trigger_type === "inside_store_hours") {
          return storeOpen;
        }
        if (automation.trigger_type === input.triggerType) return true;
        if (automation.trigger_type === "keyword_match") {
          return matchesKeywordTrigger(automation, input.messageText);
        }
        return false;
      },
    );

    if (!eligible.length) return;

    for (const automation of eligible) {
      if (await shouldSkipAutomation(db, automation, input.contactId, input.inboundMessageId))
        continue;

      const steps = (automation.steps ?? []).sort(
        (a: { position: number }, b: { position: number }) => a.position - b.position,
      );

      const logSteps: Array<{ step_type: string; ok: boolean }> = [];
      let failed = false;

      for (const step of steps) {
        if (step.step_type !== "send_message") continue;
        const message = String(step.step_config?.message ?? "").trim();
        if (!message) continue;

        try {
          const channel = await sendAutomationReply(contact.phone, message);
          logSteps.push({ step_type: "send_message", ok: true });
          await logAutomationReply({
            channel,
            conversationId: input.conversationId,
            message,
          });
        } catch (err) {
          failed = true;
          logSteps.push({ step_type: "send_message", ok: false });
          await db.from("waba_automation_logs").insert({
            automation_id: automation.id,
            contact_id: input.contactId,
            trigger_event: input.triggerType,
            steps_executed: logSteps,
            status: "failed",
            error_message: err instanceof Error ? err.message : "Erro ao enviar",
          });
          break;
        }
      }

      if (!failed) {
        const triggerEvent = input.inboundMessageId
          ? `${input.triggerType}:${input.inboundMessageId}`
          : input.triggerType;
        await db.from("waba_automation_logs").insert({
          automation_id: automation.id,
          contact_id: input.contactId,
          trigger_event: triggerEvent,
          steps_executed: logSteps,
          status: "success",
        });
        await db
          .from("waba_automations")
          .update({
            execution_count: (automation.execution_count ?? 0) + 1,
            last_executed_at: new Date().toISOString(),
          })
          .eq("id", automation.id);
      }
    }
  } catch (err) {
    console.error("[atendimento automations]", err);
  }
}

/** @deprecated Use runAtendimentoAutomations — mantido para chamadas Meta legadas. */
export async function runWabaAutomations(input: RunInput): Promise<void> {
  return runAtendimentoAutomations(input);
}
