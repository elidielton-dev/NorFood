import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";
import {
  createWhatsAppChatByPhone,
  disconnectWhatsApp,
  fetchWhatsAppChats,
  getWhatsAppContact,
  getWhatsAppInboxState,
  getWhatsAppMessages,
  getWhatsAppSetupInfo,
  handleWhatsAppWebhook,
  sendWhatsAppMediaMessage,
  sendWhatsAppTextMessage,
  startWhatsAppConnection,
} from "@/lib/api/whatsapp.server";
import type { WhatsAppListMode, WhatsAppSyncMode } from "@/lib/whatsapp";

export const fetchWhatsAppInboxStateServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId, "Acesso restrito ao WhatsApp.");
    return getWhatsAppInboxState();
  });

export const fetchWhatsAppSetupServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    return getWhatsAppSetupInfo();
  });

export const startWhatsAppConnectionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    return startWhatsAppConnection();
  });

export const disconnectWhatsAppServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    return disconnectWhatsApp();
  });

export const fetchWhatsAppChatsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { search?: string; mode?: WhatsAppListMode; sync?: WhatsAppSyncMode | boolean }) =>
      input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    const sync: WhatsAppSyncMode =
      data.sync === true ? "full" : data.sync === false ? "none" : (data.sync ?? "none");
    return fetchWhatsAppChats({
      search: data.search ?? "",
      mode: data.mode ?? "conversations",
      sync,
    });
  });

export const fetchWhatsAppMessagesServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { chatId: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    return getWhatsAppMessages(data.chatId);
  });

export const sendWhatsAppTextServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { chatId: string; text: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    return sendWhatsAppTextMessage(data.chatId, data.text);
  });

export const sendWhatsAppMediaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      chatId: string;
      mediatype: "image" | "document" | "audio" | "video";
      base64: string;
      mimetype?: string;
      caption?: string;
      fileName?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    return sendWhatsAppMediaMessage(data);
  });

export const fetchWhatsAppContactServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { remoteJid: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    return getWhatsAppContact(data.remoteJid);
  });

export const createWhatsAppChatServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { phone: string; name?: string }) => input)
  .handler(async ({ context, data }) => {
    await assertStaffUserId(context.userId);
    await createWhatsAppChatByPhone(data.phone, data.name);
    return fetchWhatsAppChats({ mode: "conversations", sync: "none" });
  });

export const processWhatsAppWebhookServer = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async () => {
    throw new Error("Use POST /api/whatsapp/webhook com assinatura Evolution.");
  });
