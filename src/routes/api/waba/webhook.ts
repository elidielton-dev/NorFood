import { createFileRoute } from "@tanstack/react-router";
import { handleWabaWebhookGet, handleWabaWebhookPost } from "@/lib/waba/webhook.server";

export const Route = createFileRoute("/api/waba/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => handleWabaWebhookGet(new URL(request.url)),
      POST: async ({ request }) => handleWabaWebhookPost(request),
    },
  },
});
