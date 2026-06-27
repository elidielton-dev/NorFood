import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, RefreshCw, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  GestaoAlert,
  GestaoButton,
  GestaoCard,
  GestaoPage,
  GestaoSectionTitle,
  StatusPill,
} from "@/components/gestao-ui";
import { supabase } from "@/integrations/supabase/client";
import {
  getTenantBillingOverviewServer,
  payBillingInvoiceCheckoutServer,
  payBillingInvoicePixServer,
  refreshBillingInvoicePixServer,
} from "@/lib/api/platform-billing.functions";
import {
  formatPlanPrice,
  getBillingModelLabel,
  getPlanLabel,
  isInTrial,
} from "@/lib/platform/billing-plans";
import { useTenant } from "@/lib/tenant/tenant-context";

export const Route = createFileRoute("/_authenticated/painel/estabelecimento/plano")({
  component: PlanoNorfoodPage,
});

function PlanoNorfoodPage() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { fatura?: string };
  const [pixData, setPixData] = useState<{
    invoiceId: string;
    qrCode: string;
    qrCodeBase64: string;
  } | null>(null);

  const queryKey = ["tenant-billing", tenant.slug];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getTenantBillingOverviewServer({ data: tenant.slug }),
  });

  const activeInvoice = useMemo(() => {
    if (search.fatura && data?.recent_invoices) {
      return data.recent_invoices.find((inv) => inv.id === search.fatura) ?? data.current_invoice;
    }
    return data?.current_invoice;
  }, [data, search.fatura]);

  async function authHeaders() {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) throw new Error("Faca login novamente.");
    return { Authorization: `Bearer ${token}` };
  }

  const checkoutMutation = useMutation({
    mutationFn: async (invoiceId?: string) => {
      const result = await payBillingInvoiceCheckoutServer({
        data: { tenantSlug: tenant.slug, invoiceId },
        headers: await authHeaders(),
      });
      window.location.href = result.checkoutUrl;
      return result;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pixMutation = useMutation({
    mutationFn: async (invoiceId?: string) => {
      const result = await payBillingInvoicePixServer({
        data: { tenantSlug: tenant.slug, invoiceId },
        headers: await authHeaders(),
      });
      setPixData({
        invoiceId: result.invoiceId,
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
      });
      return result;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const refreshPixMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const result = await refreshBillingInvoicePixServer({
        data: { tenantSlug: tenant.slug, invoiceId },
        headers: await authHeaders(),
      });
      return result;
    },
    onSuccess: (result) => {
      if (result.invoiceStatus === "paid") {
        toast.success("Pagamento confirmado!");
        setPixData(null);
      } else {
        toast.message("Pagamento ainda pendente.");
      }
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const billing = data?.billing;
  const inTrial = data?.in_trial ?? false;
  const mpEnabled = data?.mercado_pago_enabled ?? false;

  const planDescription = billing
    ? billing.billing_model === "monthly"
      ? `${getPlanLabel(billing.plan)} — ${formatPlanPrice(Number(billing.monthly_price ?? 0))}/mes`
      : getBillingModelLabel("revenue_share")
    : "Plano nao configurado";

  const canPay =
    mpEnabled &&
    activeInvoice &&
    activeInvoice.status !== "paid" &&
    activeInvoice.status !== "waived" &&
    Number(activeInvoice.final_amount) > 0;

  return (
    <GestaoPage
      title="Plano Norfood"
      subtitle="Assinatura da plataforma e pagamento via Mercado Pago"
    >
      {!mpEnabled ? (
        <GestaoAlert tone="warning">
          Mercado Pago ainda nao esta configurado no servidor (MP_ACCESS_TOKEN). Entre em contato
          com o suporte Norfood para ativar cobranca online.
        </GestaoAlert>
      ) : null}

      <GestaoCard>
        <GestaoSectionTitle title="Seu plano" description="Modelo de cobranca escolhido no cadastro." />
        {isLoading ? (
          <p className="text-sm text-[#6B7280]">Carregando...</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-[#111111]">{planDescription}</span>
              {inTrial ? <StatusPill tone="warning">Trial ativo</StatusPill> : null}
              {billing?.payment_status === "overdue" ? (
                <StatusPill tone="danger">Inadimplente</StatusPill>
              ) : null}
            </div>
            {billing?.trial_ends_at ? (
              <p className="text-sm text-[#6B7280]">
                Trial ate{" "}
                {new Date(billing.trial_ends_at).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
                {isInTrial(billing.trial_ends_at) ? "" : " (encerrado)"}
              </p>
            ) : null}
          </div>
        )}
      </GestaoCard>

      {activeInvoice ? (
        <GestaoCard>
          <GestaoSectionTitle
            title="Fatura do periodo"
            description={`${activeInvoice.period_start} a ${activeInvoice.period_end}`}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-2xl font-bold text-[#111111]">
                {formatPlanPrice(activeInvoice.final_amount)}
              </p>
              <p className="text-sm text-[#6B7280]">
                Status: <strong>{activeInvoice.status}</strong>
                {activeInvoice.paid_at
                  ? ` — pago em ${new Date(activeInvoice.paid_at).toLocaleString("pt-BR")}`
                  : ""}
              </p>
            </div>
            {canPay ? (
              <div className="flex flex-wrap gap-2">
                <GestaoButton
                  disabled={checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate(activeInvoice.id)}
                >
                  <CreditCard className="size-4" />
                  Pagar cartao / boleto
                </GestaoButton>
                <GestaoButton
                  variant="secondary"
                  disabled={pixMutation.isPending}
                  onClick={() => pixMutation.mutate(activeInvoice.id)}
                >
                  <Smartphone className="size-4" />
                  Pagar Pix
                </GestaoButton>
              </div>
            ) : null}
          </div>

          {pixData?.invoiceId === activeInvoice.id ? (
            <div className="mt-6 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-4 text-center">
              <p className="mb-3 text-sm font-medium text-[#111111]">Escaneie o QR Code Pix</p>
              <img
                src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                alt="QR Code Pix Norfood"
                className="mx-auto max-w-[220px] rounded-lg bg-white p-2"
              />
              <p className="mt-3 break-all text-xs text-[#6B7280]">{pixData.qrCode}</p>
              <GestaoButton
                className="mt-4"
                variant="secondary"
                disabled={refreshPixMutation.isPending}
                onClick={() => refreshPixMutation.mutate(activeInvoice.id)}
              >
                <RefreshCw className="size-4" />
                Ja paguei — verificar
              </GestaoButton>
            </div>
          ) : null}
        </GestaoCard>
      ) : null}

      {data?.recent_invoices?.length ? (
        <GestaoCard>
          <GestaoSectionTitle title="Historico de faturas" />
          <ul className="mt-4 divide-y divide-[#E5E7EB]">
            {data.recent_invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-3 text-sm">
                <span>
                  {inv.period_start} — {inv.period_end}
                </span>
                <span className="font-semibold">{formatPlanPrice(inv.final_amount)}</span>
                <StatusPill tone={inv.status === "paid" ? "success" : "neutral"}>
                  {inv.status}
                </StatusPill>
              </li>
            ))}
          </ul>
        </GestaoCard>
      ) : null}
    </GestaoPage>
  );
}
