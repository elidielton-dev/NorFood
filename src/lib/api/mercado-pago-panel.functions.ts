import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaffUserId } from "@/lib/api/auth-helpers.server";

export type MercadoPagoPanelPayment = {
  id: string;
  status: string;
  statusDetail: string | null;
  amount: number;
  paymentType: string | null;
  createdAt: string | null;
  approvedAt: string | null;
  externalReference: string | null;
};

export type MercadoPagoPanelSnapshot = {
  configured: boolean;
  environment: string;
  publicKeyConfigured: boolean;
  webhookUrl: string | null;
  availableBalance: number | null;
  totalReceived: number;
  approvedCount: number;
  pendingCount: number;
  recentPayments: MercadoPagoPanelPayment[];
  message: string | null;
};

export const fetchMercadoPagoPanelServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MercadoPagoPanelSnapshot> => {
    await assertStaffUserId(context.userId, "Acesso restrito ao painel financeiro.");

    const { getIntegrationStatus } = await import("@/lib/api/integrations.functions");
    const integrations = await getIntegrationStatus();
    const mp = integrations.mercadoPago;

    if (!mp.enabled) {
      return {
        configured: false,
        environment: mp.environment,
        publicKeyConfigured: mp.publicKeyConfigured,
        webhookUrl: mp.webhookUrl,
        availableBalance: null,
        totalReceived: 0,
        approvedCount: 0,
        pendingCount: 0,
        recentPayments: [],
        message: "Configure MP_ACCESS_TOKEN e VITE_MP_PUBLIC_KEY para abrir o painel bancario.",
      };
    }

    try {
      const { mercadoPagoSearchPayments } = await import("@/lib/api/mercado-pago.server");
      const search = await mercadoPagoSearchPayments({ limit: 30, days: 30 });

      let availableBalance: number | null = null;
      try {
        const { mercadoPagoGetBalance } = await import("@/lib/api/mercado-pago.server");
        availableBalance = await mercadoPagoGetBalance();
      } catch {
        availableBalance = null;
      }

      return {
        configured: true,
        environment: mp.environment,
        publicKeyConfigured: mp.publicKeyConfigured,
        webhookUrl: mp.webhookUrl,
        availableBalance,
        totalReceived: search.totalReceived,
        approvedCount: search.approvedCount,
        pendingCount: search.pendingCount,
        recentPayments: search.payments,
        message:
          availableBalance == null
            ? "Saldo indisponivel na API. Exibindo movimentacoes recentes."
            : null,
      };
    } catch (error) {
      return {
        configured: true,
        environment: mp.environment,
        publicKeyConfigured: mp.publicKeyConfigured,
        webhookUrl: mp.webhookUrl,
        availableBalance: null,
        totalReceived: 0,
        approvedCount: 0,
        pendingCount: 0,
        recentPayments: [],
        message: error instanceof Error ? error.message : "Falha ao consultar Mercado Pago.",
      };
    }
  });
