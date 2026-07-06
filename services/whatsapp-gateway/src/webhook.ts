import { getConfig } from "./config.js";
import { logger } from "./logger.js";

export async function emitWebhook(event: string, data: unknown) {
  const { webhookUrl, gatewayKey, instanceName } = getConfig();
  if (!webhookUrl) {
    logger.warn({ event }, "WHATSAPP_WEBHOOK_URL not configured");
    return;
  }

  const body = {
    event,
    instance: instanceName,
    data,
    apikey: gatewayKey,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: gatewayKey,
        Authorization: `Bearer ${gatewayKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn({ event, status: response.status, text }, "webhook failed");
    }
  } catch (error) {
    logger.error({ event, error }, "webhook error");
  }
}
