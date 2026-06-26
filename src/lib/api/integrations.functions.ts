import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaffUserId(context.userId);
    const fiscalProvider = process.env.FISCAL_PROVIDER ?? "sefaz";

    let fiscalEnvironment: "homologacao" | "producao" = "homologacao";
    try {
      const { fetchFiscalSettings } = await import("@/lib/api/fiscal-store.server");
      const settings = await fetchFiscalSettings();
      fiscalEnvironment = settings.config.ambiente;
    } catch {
      fiscalEnvironment =
        process.env.FISCAL_ENVIRONMENT === "producao" ? "producao" : "homologacao";
    }

    return {
      inter: {
        enabled: Boolean(
          process.env.INTER_CLIENT_ID &&
          process.env.INTER_CLIENT_SECRET &&
          process.env.INTER_CERT_PATH &&
          process.env.INTER_KEY_PATH,
        ),
        scopes:
          process.env.INTER_SCOPES ??
          "cob.write cob.read pix.write pix.read extrato.read saldo.read",
        webhookUrl: process.env.INTER_WEBHOOK_URL ?? "",
      },
      fiscal: {
        provider: fiscalProvider,
        enabled: fiscalProvider === "sefaz" || fiscalProvider === "direct",
        environment: fiscalEnvironment,
      },
      mercadoPago: {
        enabled: Boolean(process.env.MP_ACCESS_TOKEN),
        publicKeyConfigured: Boolean(process.env.VITE_MP_PUBLIC_KEY),
        webhookUrl: process.env.MP_WEBHOOK_URL ?? "",
        environment: process.env.MP_ENVIRONMENT ?? "sandbox",
      },
      queroDelivery: {
        enabled: Boolean(process.env.QUERO_DELIVERY_API_URL && process.env.QUERO_DELIVERY_TOKEN),
        apiUrl: process.env.QUERO_DELIVERY_API_URL ?? "",
      },
      whatsapp: {
        enabled: Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
        instanceName: process.env.EVOLUTION_INSTANCE_NAME ?? "abelha-mel",
        webhookUrl:
          process.env.WHATSAPP_WEBHOOK_URL ??
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/whatsapp/webhook` : ""),
      },
    };
  });
