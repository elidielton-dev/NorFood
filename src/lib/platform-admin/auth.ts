import { isBrowserDemoEnabled, hasBrowserSupabaseConfig } from "@/lib/runtime";

export function isClientPlatformAdminMode(): boolean {
  if (isBrowserDemoEnabled()) return true;
  return hasBrowserSupabaseConfig();
}
