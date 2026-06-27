import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminShell, AdminStatCard } from "@/components/admin/admin-shell";
import {
  createAdminBillingCheckout,
  createAdminBillingPix,
  describeBillingRow,
  fetchAdminBillingRows,
  fetchBillingInvoices,
  fetchBillingSummary,
  formatBRL,
  generateBillingInvoices,
  markInvoicePaid,
} from "@/lib/platform-admin/billing-client";
import { useAdminTenantsSource } from "@/lib/platform-admin/client";

export const Route = createFileRoute("/admin/faturamento")({
  component: AdminFaturamentoPage,
});

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function AdminFaturamentoPage() {
  const demo = useAdminTenantsSource();
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const periodKey = ["admin-billing", year, month, demo];

  const { data: summary } = useQuery({
    queryKey: [...periodKey, "summary"],
    queryFn: () => fetchBillingSummary(year, month),
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [...periodKey, "rows"],
    queryFn: () => fetchAdminBillingRows(year, month),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: [...periodKey, "invoices"],
    queryFn: () => fetchBillingInvoices(year, month),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateBillingInvoices(year, month),
    onSuccess: (result) => {
      const parts = [];
      if (result.created) parts.push(`${result.created} criada(s)`);
      if (result.updated) parts.push(`${result.updated} atualizada(s)`);
      if (result.pending) parts.push(`${result.pending} a cobrar`);
      if (result.waived) parts.push(`${result.waived} isenta(s) trial`);
      if (result.skippedNoBilling) parts.push(`${result.skippedNoBilling} sem plano`);
      toast.success(parts.length ? `Faturas: ${parts.join(", ")}.` : "Nenhuma fatura alterada.");
      if (result.waived > 0 && result.pending === 0) {
        toast.info(
          "Restaurantes em trial geram fatura isenta (R$ 0). Encerre o trial para cobrar via Mercado Pago.",
          { duration: 8000 },
        );
      }
      queryClient.invalidateQueries({ queryKey: periodKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const paidMutation = useMutation({
    mutationFn: markInvoicePaid,
    onSuccess: () => {
      toast.success("Fatura marcada como paga.");
      queryClient.invalidateQueries({ queryKey: periodKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const checkoutMutation = useMutation({
    mutationFn: createAdminBillingCheckout,
    onSuccess: (result) => {
      window.open(result.checkoutUrl, "_blank", "noopener,noreferrer");
      toast.success("Link Mercado Pago aberto.");
      queryClient.invalidateQueries({ queryKey: periodKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const pixMutation = useMutation({
    mutationFn: createAdminBillingPix,
    onSuccess: () => {
      toast.success("Pix gerado — QR salvo na fatura.");
      queryClient.invalidateQueries({ queryKey: periodKey });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const invoiceByTenant = useMemo(() => {
    return new Map(invoices.map((inv) => [inv.tenant_id, inv]));
  }, [invoices]);

  return (
    <AdminShell
      title="Faturamento"
      subtitle="MRR, cobrança por % sobre vendas e faturas mensais por restaurante."
      actions={
        <button
          type="button"
          disabled={generateMutation.isPending || demo}
          onClick={() => generateMutation.mutate()}
          className="inline-flex h-10 items-center rounded-xl bg-[#111111] px-4 text-sm font-semibold text-white hover:bg-[#333] disabled:opacity-60"
        >
          {generateMutation.isPending ? "Gerando..." : "Gerar faturas do mês"}
        </button>
      }
    >
      {demo ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Faturamento disponível apenas com Supabase em produção.
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#6B7280]">Mês</span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm"
          >
            {MONTHS.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#6B7280]">Ano</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-10 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard label="MRR (mensal)" value={formatBRL(summary?.mrr ?? 0)} />
        <AdminStatCard label="A receber (% vendas)" value={formatBRL(summary?.revenueShareDue ?? 0)} />
        <AdminStatCard label="Total período" value={formatBRL(summary?.totalDue ?? 0)} />
        <AdminStatCard label="Em trial" value={summary?.inTrial ?? 0} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-[#FF7A00] border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F6F7F9] text-left text-xs uppercase tracking-wide text-[#6B7280]">
                <tr>
                  <th className="px-4 py-3">Restaurante</th>
                  <th className="px-4 py-3">Plano</th>
                  <th className="px-4 py-3">Vendas mês</th>
                  <th className="px-4 py-3">Pedidos</th>
                  <th className="px-4 py-3">Valor devido</th>
                  <th className="px-4 py-3">Fatura</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const invoice = invoiceByTenant.get(row.tenant_id);
                  return (
                    <tr key={row.tenant_id} className="border-b border-[#E5E7EB] last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#111111]">{row.tenant_name}</p>
                        <p className="text-xs text-[#6B7280]">{row.owner_email ?? row.tenant_slug}</p>
                        {row.in_trial ? (
                          <span className="mt-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            TRIAL
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[#6B7280]">{describeBillingRow(row)}</td>
                      <td className="px-4 py-3">{formatBRL(row.period_gross_sales)}</td>
                      <td className="px-4 py-3">{row.period_order_count}</td>
                      <td className="px-4 py-3 font-semibold text-[#111111]">
                        {formatBRL(row.period_amount_due)}
                      </td>
                      <td className="px-4 py-3">
                        {invoice ? (
                          <span
                            className={`rounded-full px-2 py-1 text-xs uppercase ${
                              invoice.status === "waived"
                                ? "bg-amber-500/15 text-amber-800"
                                : "bg-[#F6F7F9]"
                            }`}
                            title={
                              invoice.status === "waived"
                                ? "Trial ativo — sem cobrança neste período"
                                : undefined
                            }
                          >
                            {invoice.status === "waived" ? "trial (isenta)" : invoice.status}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {invoice &&
                          invoice.status !== "paid" &&
                          invoice.status !== "waived" &&
                          Number(invoice.final_amount) > 0 ? (
                            <>
                              <button
                                type="button"
                                disabled={checkoutMutation.isPending}
                                onClick={() => checkoutMutation.mutate(invoice.id)}
                                className="rounded-lg border border-[#E5E7EB] px-2.5 py-1 text-xs font-medium hover:bg-[#F6F7F9]"
                              >
                                MP Checkout
                              </button>
                              <button
                                type="button"
                                disabled={pixMutation.isPending}
                                onClick={() => pixMutation.mutate(invoice.id)}
                                className="rounded-lg border border-[#E5E7EB] px-2.5 py-1 text-xs font-medium hover:bg-[#F6F7F9]"
                              >
                                MP Pix
                              </button>
                            </>
                          ) : null}
                          {invoice && invoice.status !== "paid" && invoice.status !== "waived" ? (
                            <button
                              type="button"
                              disabled={paidMutation.isPending}
                              onClick={() => paidMutation.mutate(invoice.id)}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                            >
                              Marcar pago
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
