import type { ResellerRow } from "@/lib/reseller/types";
import type { BillingPlanId } from "@/lib/platform/billing-plans";
import { writeImpersonateSession } from "@/lib/reseller/impersonate-session";
import {
  checkResellerAccessServer,
  createActivationTokenServer,
  createResellerAdminServer,
  createResellerTenantServer,
  getResellerAdminServer,
  getResellerDashboardServer,
  listActivationTokensServer,
  listResellerTenantsServer,
  listResellersAdminServer,
  revokeActivationTokenServer,
  startImpersonationServer,
  startPlatformImpersonationServer,
  suggestResellerSlugServer,
  updateResellerStatusAdminServer,
  listResellerTeamServer,
  getResellerProfileServer,
  listResellerInvoicesServer,
  getResellerPortalCountsServer,
  listResellerPendenciasServer,
  listResellerLeadsServer,
  getResellerLeadStatsServer,
  createResellerLeadServer,
  updateResellerLeadStatusServer,
} from "@/lib/api/platform-reseller.functions";

export async function checkResellerAccess() {
  return checkResellerAccessServer();
}

export async function fetchResellersAdmin() {
  return listResellersAdminServer();
}

export async function fetchResellerAdmin(id: string) {
  return getResellerAdminServer({ data: id });
}

export async function createResellerAdmin(input: Parameters<typeof createResellerAdminServer>[0]["data"]) {
  return createResellerAdminServer({ data: input });
}

export async function updateResellerStatusAdmin(
  input: Parameters<typeof updateResellerStatusAdminServer>[0]["data"],
) {
  return updateResellerStatusAdminServer({ data: input });
}

export async function suggestResellerSlug(name: string) {
  return suggestResellerSlugServer({ data: name });
}

export async function fetchResellerDashboard() {
  return getResellerDashboardServer();
}

export async function fetchResellerTenants() {
  return listResellerTenantsServer();
}

export async function createResellerTenant(
  input: Parameters<typeof createResellerTenantServer>[0]["data"],
) {
  return createResellerTenantServer({ data: input });
}

export async function fetchActivationTokens() {
  return listActivationTokensServer();
}

export async function createActivationToken(input: {
  plan: BillingPlanId;
  trialDays?: number;
  maxUses?: number;
  expiresInDays?: number;
}) {
  return createActivationTokenServer({ data: input });
}

export async function revokeActivationToken(tokenId: string) {
  return revokeActivationTokenServer({ data: tokenId });
}

export async function fetchResellerTeam() {
  return listResellerTeamServer();
}

export async function fetchResellerProfile() {
  return getResellerProfileServer();
}

export async function fetchResellerInvoices() {
  return listResellerInvoicesServer();
}

export async function fetchResellerPortalCounts() {
  return getResellerPortalCountsServer();
}

export async function fetchResellerPendencias() {
  return listResellerPendenciasServer();
}

export async function fetchResellerLeads() {
  return listResellerLeadsServer();
}

export async function fetchResellerLeadStats() {
  return getResellerLeadStatsServer();
}

export async function createResellerLead(
  input: Parameters<typeof createResellerLeadServer>[0]["data"],
) {
  return createResellerLeadServer({ data: input });
}

export async function updateResellerLeadStatus(
  input: Parameters<typeof updateResellerLeadStatusServer>[0]["data"],
) {
  return updateResellerLeadStatusServer({ data: input });
}

export async function impersonateResellerTenant(tenantId: string) {
  const result = await startImpersonationServer({ data: tenantId });
  writeImpersonateSession({
    mode: "reseller",
    tenantSlug: result.slug,
    returnTo: "/parceiro/restaurantes",
  });
  return result;
}

export async function impersonatePlatformTenant(tenantId: string) {
  const result = await startPlatformImpersonationServer({ data: tenantId });
  writeImpersonateSession({
    mode: "platform",
    tenantSlug: result.slug,
    returnTo: `/admin/${tenantId}`,
  });
  return result;
}

export type { ResellerRow };
