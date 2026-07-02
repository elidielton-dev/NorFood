import type { AdminBillingTenantRow, BillingInvoiceRow } from "@/lib/api/platform-billing.functions";
import {
  adminPayBillingInvoiceCheckoutServer,
  adminPayBillingInvoicePixServer,
  generateBillingInvoicesServer,
  getBillingSummaryServer,
  listAdminBillingServer,
  listBillingInvoicesServer,
  updateBillingInvoiceStatusServer,
} from "@/lib/api/platform-billing.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  formatPlanPrice,
  getBillingModelLabel,
  getPlanLabel,
} from "@/lib/platform/billing-plans";
import { isBrowserDemoEnabled, isProductionMode } from "@/lib/runtime";

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

function isBillingDemoBlocked() {
  if (isProductionMode()) return false;
  return isBrowserDemoEnabled();
}

async function platformAdminBillingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Faça login novamente para acessar o faturamento.");
  }

  const res = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Erro ao carregar faturamento (${res.status}).`);
  }
  return body as T;
}

function billingApiUrl(view: "rows" | "summary" | "invoices", year: number, month: number) {
  const params = new URLSearchParams({
    view,
    year: String(year),
    month: String(month),
  });
  return `/api/platform-admin/billing?${params.toString()}`;
}

async function billingActionFetch<T>(body: Record<string, unknown>) {
  return platformAdminBillingFetch<T>("/api/platform-admin/billing", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchAdminBillingRows(year: number, month: number) {
  if (isBillingDemoBlocked()) return [];
  if (isProductionMode()) {
    return platformAdminBillingFetch<AdminBillingTenantRow[]>(billingApiUrl("rows", year, month));
  }
  return listAdminBillingServer({ data: { year, month } });
}

export async function fetchBillingSummary(year: number, month: number) {
  if (isBillingDemoBlocked()) {
    return {
      tenantCount: 0,
      mrr: 0,
      revenueShareDue: 0,
      totalDue: 0,
      inTrial: 0,
      withoutBilling: 0,
    };
  }
  if (isProductionMode()) {
    return platformAdminBillingFetch<Awaited<ReturnType<typeof getBillingSummaryServer>>>(
      billingApiUrl("summary", year, month),
    );
  }
  return getBillingSummaryServer({ data: { year, month } });
}

export async function fetchBillingInvoices(
  year: number,
  month: number,
): Promise<BillingInvoiceRow[]> {
  if (isBillingDemoBlocked()) return [];
  if (isProductionMode()) {
    return platformAdminBillingFetch<BillingInvoiceRow[]>(billingApiUrl("invoices", year, month));
  }
  return listBillingInvoicesServer({ data: { year, month } });
}

export async function generateBillingInvoices(year: number, month: number) {
  if (isBillingDemoBlocked()) throw new Error("Indisponível no modo demo.");
  if (isProductionMode()) {
    return billingActionFetch<Awaited<ReturnType<typeof generateBillingInvoicesServer>>>({
      action: "generate",
      year,
      month,
      markPending: true,
    });
  }
  return generateBillingInvoicesServer({ data: { year, month, markPending: true } });
}

export async function markInvoicePaid(invoiceId: string) {
  if (isBillingDemoBlocked()) throw new Error("Indisponível no modo demo.");
  if (isProductionMode()) {
    return billingActionFetch<{ ok: true }>({ action: "mark-paid", invoiceId });
  }
  return updateBillingInvoiceStatusServer({ data: { invoiceId, status: "paid" } });
}

export async function createAdminBillingCheckout(invoiceId: string) {
  if (isBillingDemoBlocked()) throw new Error("Indisponível no modo demo.");
  if (isProductionMode()) {
    return billingActionFetch<Awaited<ReturnType<typeof adminPayBillingInvoiceCheckoutServer>>>({
      action: "checkout",
      invoiceId,
    });
  }
  return adminPayBillingInvoiceCheckoutServer({ data: { invoiceId } });
}

export async function createAdminBillingPix(invoiceId: string) {
  if (isBillingDemoBlocked()) throw new Error("Indisponível no modo demo.");
  if (isProductionMode()) {
    return billingActionFetch<Awaited<ReturnType<typeof adminPayBillingInvoicePixServer>>>({
      action: "pix",
      invoiceId,
    });
  }
  return adminPayBillingInvoicePixServer({ data: { invoiceId } });
}

export async function generateResellerInvoices(year: number, month: number) {
  if (isBillingDemoBlocked()) throw new Error("Indisponível no modo demo.");
  const { generateResellerInvoicesServer } = await import("@/lib/api/platform-reseller.functions");
  return generateResellerInvoicesServer({ data: { year, month } });
}

export type { AdminBillingTenantRow, BillingInvoiceRow };
