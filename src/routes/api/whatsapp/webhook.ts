import { createFileRoute } from "@tanstack/react-router";

import { isBaileysWebhookAuthorized } from "@/lib/api/atendimento/whatsapp-baileys.server";
import { handleWhatsAppWebhook } from "@/lib/api/atendimento/whatsapp.server";


export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          provider: "baileys",
          endpoint: "/api/whatsapp/webhook",
        });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        if (!isBaileysWebhookAuthorized(request, body)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const result = await handleWhatsAppWebhook(body);
        return Response.json(result);
      },
    },
  },
});
