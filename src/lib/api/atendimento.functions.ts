import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";
import {
  connectAtendimentoBaileys,
  connectAtendimentoEvolution,
  disconnectAtendimentoBaileys,
  disconnectAtendimentoEvolution,
  hardResetAtendimentoBaileys,
  hardResetAtendimentoEvolution,
  getAtendimentoConfigStatus,
  listAtendimentoConversations,
  listAtendimentoMessages,
  markAtendimentoConversationRead,
  openAtendimentoConversationFromContact,
  resolveAtendimentoMessageMediaUrl,
  saveAtendimentoMetaConfig,
  sendAtendimentoMediaMessage,
  sendAtendimentoTextMessage,
  setActiveProvider,
  updateAtendimentoConversationStatus,
  assignAtendimentoConversationAgent,
  consolidateBaileysInbox,
  consolidateEvolutionInbox,
  syncAtendimentoInbox,
  linkAtendimentoConversationPhone,
  saveAtendimentoConversationContact,
  mergeAtendimentoConversationDuplicates,
} from "@/lib/atendimento/atendimento-provider.server";
import type { AtendimentoProvider, WabaConversationStatus } from "@/lib/waba/types";
import { getCoexistenceStatus, triggerCoexistenceSync } from "@/lib/waba/coexistence.server";
import {
  createWabaAutomation,
  deleteWabaAutomation,
  deleteWabaContact,
  getWabaAutomationForEdit,
  listContactTagIds,
  listContactTagsIndex,
  listWabaAutomations,
  listWabaAutomationLogs,
  listWabaContacts,
  listWabaTags,
  listWabaTemplates,
  setContactTags,
  setWabaAutomationActive,
  syncWabaMessageTemplatesFromMeta,
  updateWabaAutomation,
  upsertWabaContact,
  upsertWabaTag,
} from "@/lib/waba/waba.server";
import {
  fetchAtendimentoContactCrm,
  fetchAtendimentoStats,
} from "@/lib/atendimento/atendimento-crm.server";
import { listAtendimentoStaff } from "@/lib/atendimento/atendimento-staff.server";
import type { AtendimentoNotificationSettings } from "@/lib/atendimento/notification-settings";

const staffOnly = async (userId: string) => {
  await assertStaffUserId(userId, "Acesso restrito ao módulo Atendimento.");
  const { assertPlanFeatureForStaffUser } = await import("@/lib/tenant/tenant-plan.server");
  await assertPlanFeatureForStaffUser(userId, "whatsapp");
};

export const fetchAtendimentoConfigServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return getAtendimentoConfigStatus();
  });

export const setAtendimentoProviderServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider: AtendimentoProvider }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    await setActiveProvider(data.provider);
    return getAtendimentoConfigStatus();
  });

export const saveAtendimentoMetaConfigServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      phone_number_id: string;
      waba_id?: string;
      access_token: string;
      verify_token: string;
      pin?: string;
      coexistence_mode?: boolean;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return saveAtendimentoMetaConfig(data);
  });

export const connectAtendimentoBaileysServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { phone?: string; renew?: boolean }) => input ?? {})
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    try {
      const connectResult = await connectAtendimentoBaileys(
        data?.phone ? { phone: data.phone, renew: data.renew } : undefined,
      );
      const status = await getAtendimentoConfigStatus();
      const pendingWarning =
        connectResult && typeof connectResult === "object" && "warning" in connectResult
          ? String((connectResult as { warning?: string | null }).warning ?? "").trim()
          : "";
      if (!pendingWarning || !status.baileys) return status;
      return {
        ...status,
        baileys: { ...status.baileys, warning: pendingWarning },
        evolution: status.evolution ? { ...status.evolution, warning: pendingWarning } : status.evolution,
      };
    } catch (error) {
      const status = await getAtendimentoConfigStatus();
      const message = error instanceof Error ? error.message : "Falha ao conectar o WhatsApp.";
      if (!status.baileys) return status;
      return {
        ...status,
        baileys: { ...status.baileys, warning: message },
        evolution: status.evolution ? { ...status.evolution, warning: message } : status.evolution,
      };
    }
  });

export const connectAtendimentoEvolutionServer = connectAtendimentoBaileysServer;

export const disconnectAtendimentoBaileysServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    await disconnectAtendimentoBaileys();
    return getAtendimentoConfigStatus();
  });

export const disconnectAtendimentoEvolutionServer = disconnectAtendimentoBaileysServer;

export const hardResetAtendimentoBaileysServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return hardResetAtendimentoBaileys();
  });

export const hardResetAtendimentoEvolutionServer = hardResetAtendimentoBaileysServer;

export const fetchAtendimentoConversationsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { light?: boolean; full?: boolean }) => input ?? {})
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    const light = data?.full !== true;
    return listAtendimentoConversations({ light });
  });

export const fetchAtendimentoMessagesServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { conversationId: string; history?: boolean; before?: string | null }) => input,
  )
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return listAtendimentoMessages(data.conversationId, {
      history: data.history,
      before: data.before,
    });
  });

export const markAtendimentoConversationReadServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    await markAtendimentoConversationRead(data.conversationId);
    return { ok: true };
  });

export const sendAtendimentoMessageServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string; text: string; quotedMessageId?: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return sendAtendimentoTextMessage({
      conversationId: data.conversationId,
      text: data.text,
      agentUserId: context.userId,
      quotedMessageId: data.quotedMessageId,
    });
  });

export const sendAtendimentoMediaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      conversationId: string;
      mediatype: "image" | "document" | "audio" | "video";
      base64: string;
      mimetype?: string;
      caption?: string;
      fileName?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return sendAtendimentoMediaMessage({
      ...data,
      agentUserId: context.userId,
    });
  });

export const fetchAtendimentoMessageMediaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { messageId: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    const url = await resolveAtendimentoMessageMediaUrl(data.messageId);
    return { url };
  });

export const openAtendimentoConversationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { contactId: string; phone: string; name?: string | null }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return openAtendimentoConversationFromContact(data);
  });

// Contatos, automações e templates — Meta (Evolution usa contatos das conversas)
export const fetchWabaContactsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { search?: string }) => input ?? {})
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return listWabaContacts(data.search);
  });

export const upsertWabaContactServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { id?: string; phone: string; name?: string; email?: string; company?: string }) =>
      input,
  )
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return upsertWabaContact({ ...data, userId: context.userId });
  });

export const deleteWabaContactServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return deleteWabaContact(data.id);
  });

export const fetchWabaAutomationsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return listWabaAutomations();
  });

export const setWabaAutomationActiveServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; isActive: boolean }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return setWabaAutomationActive(data.id, data.isActive);
  });

export const createWabaAutomationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      name: string;
      description?: string;
      trigger_type: string;
      reply_text: string;
      keyword?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return createWabaAutomation({ ...data, userId: context.userId });
  });

export const fetchWabaAutomationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return getWabaAutomationForEdit(data.id);
  });

export const updateWabaAutomationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      id: string;
      name: string;
      description?: string;
      trigger_type: string;
      reply_text: string;
      keyword?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return updateWabaAutomation(data);
  });

export const deleteWabaAutomationServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return deleteWabaAutomation(data.id);
  });

export const fetchWabaTemplatesServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return listWabaTemplates();
  });

export const fetchWabaCoexistenceStatusServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return getCoexistenceStatus();
  });

export const triggerWabaCoexistenceSyncServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { which?: "contacts" | "history" | "both" }) => input ?? {})
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return triggerCoexistenceSync(data.which ?? "contacts");
  });

export const updateAtendimentoConversationStatusServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string; status: WabaConversationStatus }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    await updateAtendimentoConversationStatus(data.conversationId, data.status);
    return { ok: true };
  });

export const consolidateBaileysInboxServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return consolidateBaileysInbox();
  });

export const consolidateEvolutionInboxServer = consolidateBaileysInboxServer;

export const syncAtendimentoInboxServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return syncAtendimentoInbox();
  });

export const linkAtendimentoConversationPhoneServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string; phone: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return linkAtendimentoConversationPhone(data.conversationId, data.phone);
  });

export const saveAtendimentoConversationContactServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      conversationId: string;
      phone: string;
      name?: string;
      email?: string;
      company?: string;
      contactId?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return saveAtendimentoConversationContact({ ...data, userId: context.userId });
  });

export const fetchAtendimentoContactCrmServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { phone?: string | null; tenantSlug?: string | null }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    let tenantId: string | null = null;
    if (data.tenantSlug) {
      const { resolveStaffTenantId } = await import("@/lib/api/auth-helpers.server");
      tenantId = await resolveStaffTenantId(context.userId, data.tenantSlug);
    }
    return fetchAtendimentoContactCrm(data.phone, tenantId);
  });

export const fetchAtendimentoStatsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return fetchAtendimentoStats();
  });

export const syncWabaTemplatesServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return syncWabaMessageTemplatesFromMeta();
  });

export const fetchWabaAutomationLogsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return listWabaAutomationLogs();
  });

export const fetchWabaTagsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return listWabaTags();
  });

export const upsertWabaTagServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id?: string; name: string; color?: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return upsertWabaTag(data);
  });

export const fetchContactTagsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { contactId: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return listContactTagIds(data.contactId);
  });

export const setContactTagsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { contactId: string; tagIds: string[] }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    await setContactTags(data.contactId, data.tagIds);
    return { ok: true as const };
  });

export const fetchContactTagsIndexServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return listContactTagsIndex();
  });

export const fetchAtendimentoStaffServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    return listAtendimentoStaff();
  });

export const assignAtendimentoConversationAgentServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string; agentUserId: string | null }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return assignAtendimentoConversationAgent(data.conversationId, data.agentUserId);
  });

export const mergeAtendimentoDuplicatesServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { conversationId: string }) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    return mergeAtendimentoConversationDuplicates(data.conversationId);
  });

export const fetchStaffAtendimentoNotificationPrefsServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staffOnly(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("staff_atendimento_prefs")
      .select("notification_settings")
      .eq("user_id", context.userId)
      .maybeSingle();
    return (data?.notification_settings ?? null) as Partial<AtendimentoNotificationSettings> | null;
  });

export const saveStaffAtendimentoNotificationPrefsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: AtendimentoNotificationSettings) => input)
  .handler(async ({ context, data }) => {
    await staffOnly(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("staff_atendimento_prefs").upsert(
      {
        user_id: context.userId,
        notification_settings: data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Aliases legados — redirecionam para atendimento unificado
export const fetchWabaConfigServer = fetchAtendimentoConfigServer;
export const saveWabaConfigServer = saveAtendimentoMetaConfigServer;
export const fetchWabaConversationsServer = fetchAtendimentoConversationsServer;
export const fetchWabaMessagesServer = fetchAtendimentoMessagesServer;
export const markWabaConversationReadServer = markAtendimentoConversationReadServer;
export const sendWabaMessageServer = sendAtendimentoMessageServer;
