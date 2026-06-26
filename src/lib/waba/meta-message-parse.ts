type MetaWebhookMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; caption?: string; mime_type?: string };
  document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
  sticker?: { id?: string; mime_type?: string };
  context?: {
    id?: string;
    from?: string;
  };
};

export function extractMetaInboundText(msg: MetaWebhookMessage): string | undefined {
  if (msg.text?.body?.trim()) return msg.text.body.trim();
  if (msg.image?.caption?.trim()) return msg.image.caption.trim();
  if (msg.video?.caption?.trim()) return msg.video.caption.trim();
  if (msg.document?.caption?.trim()) return msg.document.caption.trim();
  return undefined;
}

export function extractMetaMediaId(msg: MetaWebhookMessage): string | null {
  return (
    msg.image?.id ?? msg.audio?.id ?? msg.video?.id ?? msg.document?.id ?? msg.sticker?.id ?? null
  );
}

export function extractMetaMediaMime(msg: MetaWebhookMessage): string | null {
  return (
    msg.image?.mime_type ??
    msg.audio?.mime_type ??
    msg.video?.mime_type ??
    msg.document?.mime_type ??
    msg.sticker?.mime_type ??
    null
  );
}

export function extractMetaFileName(msg: MetaWebhookMessage): string | null {
  return msg.document?.filename ?? null;
}

export function extractMetaReplyContext(msg: MetaWebhookMessage) {
  if (!msg.context?.id) return null;
  return {
    replyToWaMessageId: msg.context.id,
    replyToFromMe: Boolean(msg.context.from),
  };
}

export type { MetaWebhookMessage };
