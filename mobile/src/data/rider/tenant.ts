import type { TenantSettings } from "../../types";

let activeTenantId: string | null = null;
let activeTenantSettings: TenantSettings | null = null;

export function setActiveRiderTenant(tenantId: string | null, settings: TenantSettings | null = null) {
  activeTenantId = tenantId;
  activeTenantSettings = settings;
}

export function getActiveRiderTenantId() {
  return activeTenantId;
}

export function getActiveTenantSettings() {
  return activeTenantSettings;
}

export function requireActiveTenantId() {
  if (!activeTenantId) {
    throw new Error("Selecione a empresa antes de continuar.");
  }
  return activeTenantId;
}
