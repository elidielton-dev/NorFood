import type { BillingPlanId } from "@/lib/platform/billing-plans";

export type ResellerStatus = "active" | "suspended" | "pending_setup";

export type ResellerUserRole = "owner" | "admin" | "support";

export type ActivationTokenStatus = "active" | "consumed" | "expired" | "revoked";

export type BillingPaymentSource = "platform" | "reseller";

export type ResellerRow = {
  id: string;
  name: string;
  slug: string;
  document_number: string | null;
  contact_email: string;
  contact_phone: string | null;
  logo_url: string | null;
  status: ResellerStatus;
  max_tenants: number;
  allowed_plans: BillingPlanId[];
  price_per_tenant: number | null;
  flat_monthly_fee: number | null;
  default_trial_days: number;
  notes: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
  tenant_count?: number;
};

export type ActivationTokenRow = {
  id: string;
  reseller_id: string;
  token_prefix: string;
  plan: BillingPlanId;
  trial_days: number;
  max_uses: number;
  uses_count: number;
  status: ActivationTokenStatus;
  expires_at: string | null;
  consumed_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ResellerTenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: BillingPlanId | null;
  trial_ends_at: string | null;
  created_at: string;
  owner_email: string | null;
  owner_name: string | null;
};
