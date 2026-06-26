import {
  DEMO_RESTAURANT_TENANT_ID,
  DEMO_RESTAURANT_TENANT_SLUG,
  NORFOOD_DEMO_TENANT_ID,
  NORFOOD_DEMO_TENANT_SLUG,
} from "@/lib/tenant/constants";
import { NORFOOD_LOGO_URL } from "@/lib/brand/norfood";
import type { Tenant, TenantSettings } from "@/lib/tenant/types";

export const FALLBACK_TENANTS: Record<string, Tenant> = {
  [NORFOOD_DEMO_TENANT_SLUG]: {
    id: NORFOOD_DEMO_TENANT_ID,
    name: "Norfood",
    slug: NORFOOD_DEMO_TENANT_SLUG,
    subtitle: "Sistema de Delivery",
    logo_url: NORFOOD_LOGO_URL,
    primary_color: "#FF9100",
    secondary_color: "#1A1A1A",
    accent_color: "#FF5C00",
    custom_domain: null,
    status: "active",
    timezone: "America/Sao_Paulo",
    currency: "BRL",
  },
  [DEMO_RESTAURANT_TENANT_SLUG]: {
    id: DEMO_RESTAURANT_TENANT_ID,
    name: "Restaurante Demo",
    slug: DEMO_RESTAURANT_TENANT_SLUG,
    subtitle: "Cliente exemplo",
    logo_url: null,
    primary_color: "#FF9100",
    secondary_color: "#1A1A1A",
    accent_color: "#FF5C00",
    custom_domain: null,
    status: "active",
    timezone: "America/Sao_Paulo",
    currency: "BRL",
  },
};

export const FALLBACK_TENANT_SETTINGS: Record<string, TenantSettings> = {
  [NORFOOD_DEMO_TENANT_SLUG]: {
    phone: null,
    address: null,
    description: "Demonstração da plataforma Norfood — delivery e gestão completa.",
    delivery_fee_default: 6,
    delivery_time_minutes: 40,
    pedido_minimo: 15,
    loja_aberta: true,
    pontos_por_real: 1,
  },
  [DEMO_RESTAURANT_TENANT_SLUG]: {
    phone: "(11) 99999-0000",
    address: "São Paulo, SP",
    description: "Restaurante de exemplo para testar a plataforma Norfood.",
    delivery_fee_default: 5,
    delivery_time_minutes: 35,
    pedido_minimo: 20,
    loja_aberta: true,
    pontos_por_real: 1,
  },
};

export function getFallbackTenant(slug: string): Tenant | null {
  return FALLBACK_TENANTS[slug] ?? null;
}

export function listFallbackTenants(): Tenant[] {
  return Object.values(FALLBACK_TENANTS);
}
