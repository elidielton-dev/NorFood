import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, RefreshCw, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ConfigSection,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import {
  GestaoAlert,
  GestaoButton,
  GestaoPage,
  StatusPill,
} from "@/components/painel/gestao-ui";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteOwnRestaurantServer,
  getTenantBillingOverviewServer,
  getTenantPlanFeaturesServer,
  payBillingInvoiceCheckoutServer,
  payBillingInvoicePixServer,
  refreshBillingInvoicePixServer,
} from "@/lib/api/financeiro/platform-billing.functions";
import {
  formatPlanPrice,
  getBillingModelLabel,
  getPlanLabel,
  isInTrial,
  BILLING_PLANS,
} from "@/lib/platform/billing-plans";
import { listPlanMarketingFeatures } from "@/lib/platform/plan-features";
import { NORFOOD_DEMO_TENANT_SLUG } from "@/lib/tenant/constants";

import { useTenant } from "@/lib/tenant/tenant-context";

export function PlanoNorfoodPage({ backTo }: { backTo?: string } = {}) {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { fatura?: string };
  const [deleteConfirmSlug, setDeleteConfirmSlug] = useState("");
  const [showDeleteForm, setShowDeleteForm] = useState(false);
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

  const { data: planFeatures } = useQuery({
    queryKey: ["tenant-plan-features", tenant.slug],
    queryFn: () => getTenantPlanFeaturesServer({ data: tenant.slug }),
    staleTime: 60_000,
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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteOwnRestaurantServer({
        data: { tenantSlug: tenant.slug, confirmSlug: deleteConfirmSlug },
        headers: await authHeaders(),
      });
    },
    onSuccess: async () => {
      await supabase.auth.signOut();
      toast.success("Conta exclu├¡da. At├® logo!");
      navigate({ to: "/" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const billing = data?.billing;
  const inTrial = data?.in_trial ?? false;
  const mpEnabled = data?.mercado_pago_enabled ?? false;
  const isResellerBilling = billing?.payment_source === "reseller";
  const isDemoTenant = tenant.slug === NORFOOD_DEMO_TENANT_SLUG;

  const planDescription = billing
    ? billing.billing_model === "monthly"
      ? `${getPlanLabel(billing.plan)} ÔÇö ${formatPlanPrice(Number(billing.monthly_price ?? 0))}/mes`
      : getBillingModelLabel("revenue_share")
    : "Plano nao configurado";

  const canPay =
    !isResellerBilling &&
    mpEnabled &&
    activeInvoice &&
    activeInvoice.status !== "paid" &&
    activeInvoice.status !== "waived" &&
    Number(activeInvoice.final_amount) > 0;

  const planBody = (
    <>
      {isResellerBilling ? (
        <GestaoAlert tone="info">
          A cobrança deste restaurante é feita pela sua revendedora
          {data?.reseller_name ? ` (${data.reseller_name})` : ""}. Entre em contato com ela para
          pagamentos, upgrades ou cancelamento.
        </GestaoAlert>
      ) : !mpEnabled ? (
        <GestaoAlert tone="warning">
          Mercado Pago ainda não está configurado no servidor (MP_ACCESS_TOKEN). Entre em contato
          com o suporte Norfood para ativar cobrança online.
        </GestaoAlert>
      ) : null}

      <ConfigSection title="Seu plano" description="Modelo de cobrança escolhido no cadastro.">
        {isLoading ? (
          <p className="text-sm text-[#6B7280]">Carregando...</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-[#111111]">{planDescription}</span>
              {inTrial ? <StatusPill tone="warning">Trial ativo</StatusPill> : null}
              {billing?.payment_status === "overdue" ? (
                <StatusPill tone="danger">Inadimplente</StatusPill>
              ) : null}
            </div>
            {billing?.trial_ends_at ? (
              <p className="text-sm text-[#6B7280]">
                Trial até{" "}
                {new Date(billing.trial_ends_at).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
                {isInTrial(billing.trial_ends_at) ? "" : " (encerrado)"}
              </p>
            ) : null}
            {planFeatures?.monthlyOrderLimit != null ? (
              <p className="text-sm text-[#6B7280]">
                Pedidos este mês:{" "}
                <strong>
                  {planFeatures.monthlyOrderCount}/{planFeatures.monthlyOrderLimit}
                </strong>
                {planFeatures.ordersRemaining === 0 ? (
                  <span className="text-rose-600"> — limite atingido</span>
                ) : null}
              </p>
            ) : null}
            {planFeatures?.planId && BILLING_PLANS[planFeatures.planId] ? (
              <ul className="mt-2 space-y-1 text-sm text-[#6B7280]">
                {listPlanMarketingFeatures(planFeatures.planId).map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </ConfigSection>

      {activeInvoice && !isResellerBilling ? (
        <ConfigSection
          title="Fatura do período"
          description={`${activeInvoice.period_start} a ${activeInvoice.period_end}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
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
                  Pagar cartão / boleto
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
                Já paguei — verificar
              </GestaoButton>
            </div>
          ) : null}
        </ConfigSection>
      ) : null}

      {data?.recent_invoices?.length && !isResellerBilling ? (
        <ConfigSection title="Histórico de faturas" description="Últimas cobranças da plataforma.">
          <ul className="divide-y divide-[#E5E7EB]">
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
        </ConfigSection>
      ) : null}

      {!isDemoTenant ? (
        <ConfigSection
          title="Excluir conta"
          description="Remove permanentemente o restaurante e todos os dados associados."
        >
          {showDeleteForm ? (
            <div className="space-y-3">
              <GestaoAlert tone="warning">
                Esta ação é irreversível. Pedidos, produtos e configurações serão apagados.
              </GestaoAlert>
              <label className="block text-sm font-medium text-[#111111]">
                Digite <code className="rounded bg-white px-1">{tenant.slug}</code> para confirmar
                <input
                  type="text"
                  value={deleteConfirmSlug}
                  onChange={(e) => setDeleteConfirmSlug(e.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-400"
                  placeholder={tenant.slug}
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <GestaoButton
                  variant="danger"
                  disabled={
                    deleteMutation.isPending ||
                    deleteConfirmSlug.trim().toLowerCase() !== tenant.slug
                  }
                  onClick={() => deleteMutation.mutate()}
                >
                  Excluir conta permanentemente
                </GestaoButton>
                <GestaoButton
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteForm(false);
                    setDeleteConfirmSlug("");
                  }}
                >
                  Cancelar
                </GestaoButton>
              </div>
            </div>
          ) : (
            <GestaoButton variant="danger" onClick={() => setShowDeleteForm(true)}>
              Excluir minha conta
            </GestaoButton>
          )}
        </ConfigSection>
      ) : null}
    </>
  );

  if (backTo) {
    return (
      <ConfiguracoesPageFrame
        title="Plano Norfood"
        description="Assinatura da plataforma e pagamento via Mercado Pago."
      >
        {planBody}
      </ConfiguracoesPageFrame>
    );
  }

  return (
    <GestaoPage
      title="Plano Norfood"
      subtitle="Assinatura da plataforma e pagamento via Mercado Pago"
    >
      {planBody}
    </GestaoPage>
  );
}
