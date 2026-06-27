import { createFileRoute } from "@tanstack/react-router";
import {
  getWebhookAuthorizationSummary,
  getWebhookEventType,
  getWebhookPaymentId,
  syncMercadoPagoPayment,
  syncMercadoPagoPaymentToOrder,
  validateMercadoPagoWebhook,
} from "@/lib/api/mercado-pago.server";

export const Route = createFileRoute("/api/mercado-pago/webhook")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          ok: true,
          provider: "mercado_pago",
          ...getWebhookAuthorizationSummary(),
        });
      },
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        if (!validateMercadoPagoWebhook(request, body)) {
          return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
        }

        const eventType = getWebhookEventType(body, request);
        const paymentId = getWebhookPaymentId(body, request);

        if (eventType !== "payment" || !paymentId) {
          return Response.json({
            ok: true,
            ignored: true,
            eventType,
            paymentId,
          });
        }

        const result = await syncMercadoPagoPayment(paymentId);
        return Response.json({
          ok: true,
          processed: true,
          ...result,
        });
      },
    },
  },
});
