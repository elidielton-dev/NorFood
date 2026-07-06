function resolveWebhookUrl() {
  const explicit = (process.env.WHATSAPP_WEBHOOK_URL ?? "").trim();
  if (explicit) return explicit;
  const publicApp = (process.env.PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (publicApp) return `${publicApp}/api/whatsapp/webhook`;
  return "";
}

export function getConfig() {
  const gatewayKey = process.env.WHATSAPP_GATEWAY_KEY ?? "";
  const webhookUrl = resolveWebhookUrl();
  const authDir = process.env.WHATSAPP_AUTH_DIR ?? "./data/auth";
  const port = Number(process.env.WHATSAPP_GATEWAY_PORT ?? "8090");
  const instanceName = (process.env.WHATSAPP_INSTANCE_NAME ?? "norfood").trim();

  return {
    gatewayKey,
    webhookUrl,
    authDir,
    port,
    instanceName,
    enabled: Boolean(gatewayKey),
  };
}
