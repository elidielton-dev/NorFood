import type { EvolutionQuotedMessage } from "@/lib/api/whatsapp-evolution.server";
import type { WhatsAppMessage } from "@/lib/whatsapp";
import { mediaTypeLabel } from "@/lib/atendimento/message-reply";

export function buildEvolutionQuotedFromWhatsAppMessage(
  msg: Pick<
    WhatsAppMessage,
    "waMessageId" | "remoteJid" | "direction" | "body" | "messageType" | "fileName"
  >,
): EvolutionQuotedMessage | null {
  if (!msg.waMessageId || msg.waMessageId.startsWith("local-")) return null;

  const preview =
    msg.body?.trim() ||
    (msg.messageType === "document" && msg.fileName?.trim() ? msg.fileName.trim() : null) ||
    mediaTypeLabel(msg.messageType);

  return {
    key: {
      id: msg.waMessageId,
      remoteJid: msg.remoteJid,
      fromMe: msg.direction === "outbound",
    },
    message: { conversation: preview },
  };
}
