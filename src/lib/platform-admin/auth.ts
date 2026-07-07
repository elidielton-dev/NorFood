import { isBrowserDemoEnabled, hasBrowserSupabaseConfig } from "@/lib/shared/runtime";

export function isClientPlatformAdminMode(): boolean {
  if (isBrowserDemoEnabled()) return true;
  return hasBrowserSupabaseConfig();
}
