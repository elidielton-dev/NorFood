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

        try {
          const result = await syncMercadoPagoPayment(paymentId);
          return Response.json({
            ok: true,
            processed: true,
            ...result,
          });
        } catch (syncError) {
          const message =
            syncError instanceof Error ? syncError.message : "Falha ao sincronizar pagamento.";
          console.warn("[mercado-pago/webhook] sync skipped:", paymentId, message);
          // Mercado Pago exige HTTP 200 para confirmar recebimento (inclui simulação id 123456).
          return Response.json({
            ok: true,
            processed: false,
            paymentId,
            error: message,
          });
        }
      },
    },
  },
});
