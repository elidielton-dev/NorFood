import { mobileSupabase } from "../lib/supabase";
import type { TenantSettings, TenantSummary } from "../types";

type TenantUserRow = {
  tenant_id: string;
  role: string;
  tenants: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    status: string;
  } | null;
};

type TenantSettingsRow = {
  phone: string | null;
  address: string | null;
  description: string | null;
  delivery_fee_default: number | null;
  delivery_time_minutes: number | null;
  pedido_minimo: number | null;
  loja_aberta: boolean | null;
};

function requireSupabase() {
  if (!mobileSupabase) {
    throw new Error("Supabase nao configurado no app do entregador.");
  }
  return mobileSupabase;
}

const RIDER_ROLES = ["entregador", "owner", "admin", "gerente"];

export async function fetchRiderTenancies(userId: string): Promise<TenantSummary[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("tenant_users")
    .select(
      "tenant_id, role, tenants(id, name, slug, logo_url, primary_color, secondary_color, accent_color, status)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", RIDER_ROLES)
    .returns<TenantUserRow[]>();

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.tenants && row.tenants.status === "active")
    .map((row) => ({
      id: row.tenant_id,
      role: row.role,
      name: row.tenants!.name,
      slug: row.tenants!.slug,
      logoUrl: row.tenants!.logo_url,
      primaryColor: row.tenants!.primary_color || "#FF7A00",
      secondaryColor: row.tenants!.secondary_color || "#1A1A1A",
      accentColor: row.tenants!.accent_color || "#FF9100",
    }));
}

export async function fetchTenantSettings(tenantId: string): Promise<TenantSettings | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("phone, address, description, delivery_fee_default, delivery_time_minutes, pedido_minimo, loja_aberta")
    .eq("tenant_id", tenantId)
    .maybeSingle<TenantSettingsRow>();

  if (error) throw error;
  if (!data) return null;

  return {
    phone: data.phone,
    address: data.address,
    description: data.description,
    deliveryFeeDefault: Number(data.delivery_fee_default ?? 0),
    deliveryTimeMinutes: Number(data.delivery_time_minutes ?? 40),
    pedidoMinimo: Number(data.pedido_minimo ?? 0),
    lojaAberta: Boolean(data.loja_aberta),
  };
}

export async function requestPasswordReset(email: string) {
  const supabase = requireSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error) throw error;
}
