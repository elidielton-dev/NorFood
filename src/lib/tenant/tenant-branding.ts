import type { Tenant } from "@/lib/tenant/types";

export const DEFAULT_TENANT_BRANDING = {
  primary: "#FF9100",
  secondary: "#1A1A1A",
  accent: "#FF5C00",
} as const;

export function applyTenantBranding(
  tenant: Tenant,
  target: HTMLElement = document.documentElement,
) {
  target.style.setProperty("--tenant-primary", tenant.primary_color);
  target.style.setProperty("--tenant-secondary", tenant.secondary_color);
  target.style.setProperty("--tenant-accent", tenant.accent_color);
}

export function clearTenantBranding(target: HTMLElement = document.documentElement) {
  target.style.setProperty("--tenant-primary", DEFAULT_TENANT_BRANDING.primary);
  target.style.setProperty("--tenant-secondary", DEFAULT_TENANT_BRANDING.secondary);
  target.style.setProperty("--tenant-accent", DEFAULT_TENANT_BRANDING.accent);
}

export function getTenantInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
