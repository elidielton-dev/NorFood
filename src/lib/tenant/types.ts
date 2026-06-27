export type TenantStatus = "active" | "suspended" | "trial" | "pending";

export type TenantRole =
  | "owner"
  | "admin"
  | "gerente"
  | "atendente"
  | "cozinha"
  | "entregador"
  | "financeiro"
  | "cliente";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  custom_domain: string | null;
  status: TenantStatus;
  timezone: string;
  currency: string;
  document_type?: "cnpj" | "cpf" | null;
  document_number?: string | null;
  legal_name?: string | null;
  cep?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  street_number?: string | null;
};

export type TenantSettings = {
  phone: string | null;
  address: string | null;
  description: string | null;
  cep?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  address_number?: string | null;
  delivery_fee_default: number;
  delivery_time_minutes: number;
  pedido_minimo: number;
  loja_aberta: boolean;
  pontos_por_real: number;
};

export type TenantMembership = {
  tenant_id: string;
  role: TenantRole;
  tenant: Tenant;
};
