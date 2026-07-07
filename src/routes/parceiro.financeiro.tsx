import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, Wallet } from "lucide-react";
import { ParceiroDataTable, type ParceiroTableColumn } from "@/components/parceiro/parceiro-data-table";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import { fetchResellerDashboard, fetchResellerInvoices, fetchResellerProfile } from "@/lib/reseller/client";
import type { ResellerInvoiceRow } from "@/lib/api/plataforma/platform-reseller.functions";

export const Route = createFileRoute("/parceiro/financeiro")({
  component: ParceiroFinanceiroPage,
});

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const INVOICE_STATUS: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberta",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelada",
};

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
  const estimated = flatFee > 0 ? flatFee : pricePerTenant * (dashboard?.stats.total ?? 0);

  const columns: ParceiroTableColumn<ResellerInvoiceRow>[] = [
    {
      id: "period",
      header: "Periodo",
      sortable: true,
      sortValue: (inv) => inv.period_start,
      cell: (inv) => (
        <div>
          <p className="font-medium text-[#111111]">
            {new Date(inv.period_start).toLocaleDateString("pt-BR")} —{" "}
            {new Date(inv.period_end).toLocaleDateString("pt-BR")}
          </p>
          <p className="text-xs text-[#6B7280]">{inv.active_tenant_count} licencas</p>
        </div>
      ),
    },
    {
      id: "calculated",
      header: "Calculado",
      sortable: true,
      sortValue: (inv) => inv.calculated_amount,
      cell: (inv) => formatBrl(inv.calculated_amount),
    },
    {
      id: "final",
      header: "Valor final",
      sortable: true,
      sortValue: (inv) => inv.final_amount,
      cell: (inv) => <span className="font-semibold">{formatBrl(inv.final_amount)}</span>,
    },
    {
      id: "status",
      header: "Situacao",
      sortable: true,
      sortValue: (inv) => inv.status,
      cell: (inv) => (
        <span
          className={
            inv.status === "paid"
              ? "text-emerald-700"
              : inv.status === "overdue"
                ? "text-rose-700"
                : "text-[#374151]"
          }
        >
          {INVOICE_STATUS[inv.status] ?? inv.status}
        </span>
      ),
    },
    {
      id: "paid",
      header: "Pago em",
      sortable: true,
      sortValue: (inv) => inv.paid_at ?? "",
      cell: (inv) =>
        inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("pt-BR") : "—",
    },
    {
      id: "view",
      header: "Visualizar",
      className: "text-center",
      cell: () => (
        <span className="inline-flex text-primary">
          <Eye className="size-4" />
        </span>
      ),
    },
  ];

  return (
    <ParceiroPage
      title="Financeiro"
      subtitle="Faturamento NorFood → revendedora, estimativas e historico de faturas."
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FinanceKpi label="Clientes ativos" value={String(activeCount)} />
          <FinanceKpi label="Preco/licenca" value={pricePerTenant > 0 ? formatBrl(pricePerTenant) : "—"} />
          <FinanceKpi label="Mensalidade fixa" value={flatFee > 0 ? formatBrl(flatFee) : "—"} />
          <FinanceKpi label="Estimativa mensal" value={formatBrl(estimated)} highlight />
        </div>

        <ParceiroCard title="Modelo comercial">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-[#F6F7F9] p-4">
              <p className="text-xs font-semibold uppercase text-[#6B7280]">Voce cobra</p>
              <p className="mt-1 text-sm text-[#111111]">
                Seus restaurantes conforme plano e contrato comercial local.
              </p>
            </div>
            <div className="rounded-xl bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase text-primary">NorFood cobra voce</p>
              <p className="mt-1 text-sm text-[#111111]">
                {flatFee > 0
                  ? `Taxa fixa mensal de ${formatBrl(flatFee)}.`
                  : pricePerTenant > 0
                    ? `${formatBrl(pricePerTenant)} por licenca ativa/trial.`
                    : "Valores definidos no contrato de parceria."}
              </p>
            </div>
          </div>
        </ParceiroCard>

        <section>
          <h2 className="mb-1 font-display text-lg font-semibold text-primary">Boletos do parceiro</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            Historico de cobranca da plataforma NorFood para sua revendedora.
          </p>
          {invoices.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-[#E5E7EB] py-12 text-center">
              <Wallet className="mb-3 size-10 text-[#D1D5DB]" />
              <p className="text-sm text-[#6B7280]">Nenhuma fatura gerada ainda.</p>
            </div>
          ) : (
            <ParceiroDataTable
              columns={columns}
              data={invoices}
              rowKey={(inv) => inv.id}
              isLoading={isLoading}
              searchPlaceholder="Pesquisa rapida..."
              searchMatch={(inv, q) =>
                `${inv.status} ${inv.period_start} ${inv.final_amount}`.toLowerCase().includes(q)
              }
              filters={[
                {
                  id: "status",
                  label: "Situacao",
                  options: Object.entries(INVOICE_STATUS).map(([value, label]) => ({ value, label })),
                  match: (inv, v) => inv.status === v,
                },
              ]}
              emptyMessage="Nenhuma fatura encontrada."
            />
          )}
        </section>
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
          ? "rounded-xl border border-primary/30 bg-primary/5 p-4"
          : "rounded-xl border border-[#E8EAED] bg-white p-4 shadow-sm"
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#111111]">{value}</p>
    </div>
  );
}
