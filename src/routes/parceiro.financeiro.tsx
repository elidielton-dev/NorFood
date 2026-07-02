import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import { fetchResellerDashboard, fetchResellerInvoices, fetchResellerProfile } from "@/lib/reseller/client";

export const Route = createFileRoute("/parceiro/financeiro")({
  component: ParceiroFinanceiroPage,
});

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ParceiroFinanceiroPage() {
  const { data: dashboard } = useQuery({
    queryKey: ["reseller-dashboard"],
    queryFn: fetchResellerDashboard,
  });
  const { data: profile } = useQuery({
    queryKey: ["reseller-profile"],
    queryFn: fetchResellerProfile,
  });
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["reseller-invoices"],
    queryFn: fetchResellerInvoices,
  });

  const reseller = profile?.reseller ?? dashboard?.reseller;
  const billing = profile?.billing;
  const pricePerTenant = Number(billing?.price_per_tenant ?? reseller?.price_per_tenant ?? 0);
  const flatFee = Number(billing?.flat_monthly_fee ?? reseller?.flat_monthly_fee ?? 0);
  const activeCount = dashboard?.stats.active ?? 0;
  const estimated =
    flatFee > 0 ? flatFee : pricePerTenant * (dashboard?.stats.total ?? 0);

  return (
    <ParceiroPage
      title="Financeiro"
      subtitle="Faturamento NorFood → revendedora, estimativas e histórico de faturas."
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FinanceKpi label="Clientes ativos" value={String(activeCount)} />
          <FinanceKpi label="Preço/licença" value={pricePerTenant > 0 ? formatBrl(pricePerTenant) : "—"} />
          <FinanceKpi label="Mensalidade fixa" value={flatFee > 0 ? formatBrl(flatFee) : "—"} />
          <FinanceKpi label="Estimativa mensal" value={formatBrl(estimated)} highlight />
        </div>

        <ParceiroCard title="Modelo comercial">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-[#F6F7F9] p-4">
              <p className="text-xs font-semibold uppercase text-[#6B7280]">Você cobra</p>
              <p className="mt-1 text-sm text-[#111111]">
                Seus restaurantes conforme plano e contrato comercial local.
              </p>
            </div>
            <div className="rounded-xl bg-[#FF9100]/5 p-4">
              <p className="text-xs font-semibold uppercase text-[#C45A00]">NorFood cobra você</p>
              <p className="mt-1 text-sm text-[#111111]">
                {flatFee > 0
                  ? `Taxa fixa mensal de ${formatBrl(flatFee)}.`
                  : pricePerTenant > 0
                    ? `${formatBrl(pricePerTenant)} por licença ativa/trial.`
                    : "Valores definidos no contrato de parceria."}
              </p>
            </div>
          </div>
          {billing?.payment_status ? (
            <p className="mt-4 text-sm text-[#6B7280]">
              Status de pagamento:{" "}
              <span className="font-medium capitalize text-[#111111]">{billing.payment_status}</span>
            </p>
          ) : null}
        </ParceiroCard>

        <ParceiroCard title="Faturas NorFood" description="Histórico de cobrança da plataforma para sua revendedora.">
          {isLoading ? (
            <p className="text-sm text-[#6B7280]">Carregando faturas...</p>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Wallet className="mb-3 size-10 text-[#D1D5DB]" />
              <p className="text-sm text-[#6B7280]">Nenhuma fatura gerada ainda.</p>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                Faturas são emitidas mensalmente pela equipe NorFood.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-[#F6F7F9] text-left text-xs uppercase text-[#6B7280]">
                  <tr>
                    <th className="px-4 py-3">Período</th>
                    <th className="px-4 py-3">Licenças</th>
                    <th className="px-4 py-3">Calculado</th>
                    <th className="px-4 py-3">Final</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-[#E5E7EB]">
                      <td className="px-4 py-3">
                        {new Date(inv.period_start).toLocaleDateString("pt-BR")} —{" "}
                        {new Date(inv.period_end).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3">{inv.active_tenant_count}</td>
                      <td className="px-4 py-3">{formatBrl(inv.calculated_amount)}</td>
                      <td className="px-4 py-3 font-medium">{formatBrl(inv.final_amount)}</td>
                      <td className="px-4 py-3 capitalize">{inv.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ParceiroCard>
      </div>
    </ParceiroPage>
  );
}

function FinanceKpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-2xl border border-[#FF9100]/30 bg-[#FF9100]/5 p-4"
          : "rounded-2xl border border-[#E5E7EB] bg-white p-4"
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#111111]">{value}</p>
    </div>
  );
}
