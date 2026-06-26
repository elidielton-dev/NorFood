import {
  findWabaVerifyTokenMatch,
  processInboundWabaMessage,
  updateWabaMessageStatus,
} from "@/lib/waba/waba.server";
import {
  extractMetaFileName,
  extractMetaInboundText,
  extractMetaMediaId,
  extractMetaMediaMime,
  extractMetaReplyContext,
  type MetaWebhookMessage,
} from "@/lib/waba/meta-message-parse";
import { resolveMetaMediaDownloadUrl } from "@/lib/waba/meta-api";
import { decrypt } from "@/lib/waba/encryption";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { WABA_WORKSPACE_ID } from "@/lib/waba/types";
import {
  processHistoryWebhook,
  processSmbAppStateSync,
  processSmbMessageEchoes,
} from "@/lib/waba/coexistence.server";
import { verifyMetaWebhookSignature } from "@/lib/waba/webhook-signature";

export async function handleWabaWebhookGet(url: URL): Promise<Response> {
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");

  if (mode !== "subscribe" || !challenge || !verifyToken) {
    return Response.json({ error: "Parâmetros de verificação ausentes" }, { status: 400 });
  }

  const ok = await findWabaVerifyTokenMatch(verifyToken);
  if (!ok) {
    return Response.json({ error: "Token de verificação inválido" }, { status: 403 });
  }

  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

type WebhookChange = {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
    messages?: MetaWebhookMessage[];
    statuses?: Array<{
      id: string;
      status: string;
      recipient_id: string;
      errors?: Array<{ code?: number; title?: string; message?: string }>;
    }>;
    message_echoes?: Array<Record<string, unknown>>;
    state_sync?: Array<Record<string, unknown>>;
    history?: Array<Record<string, unknown>>;
  };
};

export async function handleWabaWebhookPost(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (process.env.META_APP_SECRET) {
    const valid = verifyMetaWebhookSignature(rawBody, signature);
    if (!valid) {
      console.error(
        "[waba/webhook] POST rejeitado: assinatura inválida. " +
          "Confira se META_APP_SECRET na Vercel = App Secret atual no Meta for Developers.",
        { hasSignature: Boolean(signature) },
      );
      return Response.json({ error: "Assinatura inválida" }, { status: 403 });
    }
  }

  const body = JSON.parse(rawBody) as {
    object?: string;
    entry?: Array<{ changes?: WebhookChange[] }>;
  };

  if (body.object !== "whatsapp_business_account") {
    return Response.json({ ok: true, skipped: true });
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const field = change.field ?? "messages";
      const phoneNumberId = value.metadata?.phone_number_id ?? "";
      const metadata = value.metadata;

      if (field === "messages") {
        const { data: cfg } = await supabaseAdmin
          .from("waba_config")
          .select("access_token")
          .eq("workspace_id", WABA_WORKSPACE_ID)
          .maybeSingle();
        const accessToken = cfg?.access_token ? decrypt(cfg.access_token as string) : null;

        for (const msg of value.messages ?? []) {
          const contactName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name;
          console.info("[waba/webhook] mensagem inbound", {
            from: msg.from,
            type: msg.type,
            waMessageId: msg.id,
          });

          let mediaUrl: string | null = null;
          const mediaId = extractMetaMediaId(msg);
          if (mediaId && accessToken) {
            try {
              const resolved = await resolveMetaMediaDownloadUrl({ mediaId, accessToken });
              mediaUrl = resolved.url;
            } catch (error) {
              console.error("[waba/webhook] media download", msg.id, error);
            }
          }

          const reply = extractMetaReplyContext(msg);
          await processInboundWabaMessage({
            phoneNumberId,
            from: msg.from,
            waMessageId: msg.id,
            type: msg.type,
            text: extractMetaInboundText(msg),
            contactName,
            mediaUrl,
            mediaMime: extractMetaMediaMime(msg),
            fileName: extractMetaFileName(msg),
            replyToWaMessageId: reply?.replyToWaMessageId ?? null,
            replyToFromMe: reply?.replyToFromMe ?? null,
          });
        }

        for (const st of value.statuses ?? []) {
          const errDetail = st.errors?.length
            ? st.errors
                .map((e) => `[${e.code ?? "?"}] ${e.title ?? e.message ?? "erro"}`)
                .join("; ")
            : undefined;
          if (st.status === "failed") {
            console.error("[waba/webhook] entrega falhou", { id: st.id, errors: st.errors });
          }
          await updateWabaMessageStatus(st.id, st.status, errDetail);
        }
        continue;
      }

      if (field === "smb_message_echoes") {
        console.info("[waba/webhook] echo do celular", {
          count: value.message_echoes?.length ?? 0,
        });
        await processSmbMessageEchoes(value.message_echoes ?? [], metadata);
        continue;
      }

      if (field === "smb_app_state_sync") {
        console.info("[waba/webhook] sync contatos app", { count: value.state_sync?.length ?? 0 });
        await processSmbAppStateSync(
          (value.state_sync ?? []) as Parameters<typeof processSmbAppStateSync>[0],
        );
        continue;
      }

      if (field === "history") {
        console.info("[waba/webhook] histórico", { chunks: value.history?.length ?? 0 });
        await processHistoryWebhook(value.history ?? [], metadata);
        continue;
      }
    }
  }

  return Response.json({ ok: true });
}
