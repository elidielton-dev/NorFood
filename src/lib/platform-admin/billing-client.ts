import type { AdminBillingTenantRow, BillingInvoiceRow } from "@/lib/api/platform-billing.functions";
import {
  generateBillingInvoicesServer,
  getBillingSummaryServer,
  listAdminBillingServer,
  listBillingInvoicesServer,
  updateBillingInvoiceStatusServer,
} from "@/lib/api/platform-billing.functions";
import {
  formatPlanPrice,
  getBillingModelLabel,
  getPlanLabel,
} from "@/lib/platform/billing-plans";
import { isBrowserDemoEnabled } from "@/lib/runtime";

export function formatBRL(value: number) {
  return formatPlanPrice(value);
}

export function describeBillingRow(row: AdminBillingTenantRow) {
  if (!row.billing) return "Sem plano";
  if (row.billing.billing_model === "monthly") {
    return `${getPlanLabel(row.billing.plan)} — ${formatPlanPrice(Number(row.billing.monthly_price ?? 0))}/mês`;
  }
  return getBillingModelLabel("revenue_share");
}

export async function fetchAdminBillingRows(year: number, month: number) {
  if (isBrowserDemoEnabled()) return [];
  return listAdminBillingServer({ data: { year, month } });
}

export async function fetchBillingSummary(year: number, month: number) {
  if (isBrowserDemoEnabled()) {
    return {
      tenantCount: 0,
      mrr: 0,
      revenueShareDue: 0,
      totalDue: 0,
      inTrial: 0,
      withoutBilling: 0,
    };
  }
  return getBillingSummaryServer({ data: { year, month } });
}

export async function fetchBillingInvoices(year: number, month: number): Promise<BillingInvoiceRow[]> {
  if (isBrowserDemoEnabled()) return [];
  return listBillingInvoicesServer({ data: { year, month } });
}

export async function generateBillingInvoices(year: number, month: number) {
  if (isBrowserDemoEnabled()) throw new Error("Indisponível no modo demo.");
  return generateBillingInvoicesServer({ data: { year, month, markPending: true } });
}

export async function markInvoicePaid(invoiceId: string) {
  if (isBrowserDemoEnabled()) throw new Error("Indisponível no modo demo.");
  return updateBillingInvoiceStatusServer({ data: { invoiceId, status: "paid" } });
}

export type { AdminBillingTenantRow, BillingInvoiceRow };
