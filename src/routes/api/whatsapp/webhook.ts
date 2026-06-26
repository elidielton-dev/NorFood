import { createFileRoute } from "@tanstack/react-router";
import { isEvolutionWebhookAuthorized } from "@/lib/api/whatsapp-evolution.server";
import { handleWhatsAppWebhook } from "@/lib/api/whatsapp.server";

export const Route = createFileRoute("/api/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          provider: "evolution",
          endpoint: "/api/whatsapp/webhook",
        });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        if (!isEvolutionWebhookAuthorized(request, body)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const result = await handleWhatsAppWebhook(body);
        return Response.json(result);
      },
    },
  },
});
