import type { WabaContentType, WabaMessage } from "@/lib/waba/types";
import type { WhatsAppMessage, WhatsAppMessageType } from "@/lib/atendimento/whatsapp";

export function mediaTypeLabel(type: WabaContentType | WhatsAppMessageType): string {
  if (type === "image" || type === "sticker") return "Imagem";
  if (type === "audio") return "Audio";
  if (type === "video") return "Video";
  if (type === "document") return "Documento";
  return "Mensagem";
}

export function wabaMessageReplyPreview(msg: WabaMessage): string {
  if (msg.reply_to_text?.trim()) return msg.reply_to_text.trim();
  if (msg.content_text?.trim()) return msg.content_text.trim();
  return mediaTypeLabel(msg.content_type);
}

export function whatsAppMessageReplyPreview(msg: WhatsAppMessage): string {
  if (msg.replyToText?.trim()) return msg.replyToText.trim();
  if (msg.body?.trim()) return msg.body.trim();
  return mediaTypeLabel(msg.messageType);
}

export function canQuoteWabaMessage(msg: WabaMessage) {
  return Boolean(msg.wa_message_id && !msg.wa_message_id.startsWith("local-"));
}

function messagePreviewText(msg: WabaMessage): string {
  return msg.content_text?.trim() || mediaTypeLabel(msg.content_type);
}

export function findQuotedTargetMessage(
  messages: WabaMessage[],
  replyToWaMessageId: string | null | undefined,
  hints?: {
    text?: string | null;
    fromMe?: boolean | null;
    quotingAt?: string;
  },
): WabaMessage | undefined {
  if (replyToWaMessageId) {
    const direct = messages.find((message) => message.wa_message_id === replyToWaMessageId);
    if (direct) return direct;

    const normalized = replyToWaMessageId.toLowerCase();
    const caseInsensitive = messages.find(
      (message) => message.wa_message_id?.toLowerCase() === normalized,
    );
    if (caseInsensitive) return caseInsensitive;
  }

  const text = hints?.text?.trim();
  if (!text) return undefined;

  const quotingMs = hints?.quotingAt
    ? new Date(hints.quotingAt).getTime()
    : Number.POSITIVE_INFINITY;
  const previewMatches = (message: WabaMessage) => messagePreviewText(message) === text;
  const beforeQuoting = (message: WabaMessage) =>
    new Date(message.created_at).getTime() <= quotingMs + 2 * 60 * 1000;

  const pickClosest = (pool: WabaMessage[]) => {
    if (pool.length === 0) return undefined;
    if (pool.length === 1) return pool[0];
    return pool.reduce((best, current) => {
      const currentMs = new Date(current.created_at).getTime();
      const bestMs = new Date(best.created_at).getTime();
      if (currentMs <= quotingMs && currentMs > bestMs) return current;
      if (bestMs > quotingMs && currentMs <= quotingMs) return current;
      return best;
    });
  };

  let pool = messages.filter((message) => previewMatches(message) && beforeQuoting(message));

  if (hints?.fromMe === true) {
    const agentPool = pool.filter((message) => message.sender_type !== "customer");
    const agentMatch = pickClosest(agentPool);
    if (agentMatch) return agentMatch;

    const localAgent = messages.find(
      (message) =>
        message.sender_type !== "customer" &&
        message.wa_message_id?.startsWith("local-") &&
        previewMatches(message) &&
        beforeQuoting(message),
    );
    if (localAgent) return localAgent;
  } else if (hints?.fromMe === false) {
    const customerPool = pool.filter((message) => message.sender_type === "customer");
    const customerMatch = pickClosest(customerPool);
    if (customerMatch) return customerMatch;
  }

  return pickClosest(pool);
}

export function canJumpToQuotedMessage(message: WabaMessage) {
  return Boolean(message.reply_to_wa_message_id || message.reply_to_text?.trim());
}
