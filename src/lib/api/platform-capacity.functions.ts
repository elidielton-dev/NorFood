import { createServerFn } from "@tanstack/react-start";
import { requirePlatformAdmin } from "@/lib/platform-admin/auth.server";
import {
  getEffectiveMaxTenants,
  getPlatformCapacityConfig,
} from "@/lib/platform/platform-limits";
import { listFallbackTenants } from "@/lib/tenant/tenants-fallback";

function isDemoBackend() {
  return (
    process.env.VITE_DEMO_MODE === "true" ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function countTenants(): Promise<number> {
  if (isDemoBackend()) return listFallbackTenants().length;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("tenants")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export const fetchPlatformCapacityServer = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .handler(async () => {
    const config = getPlatformCapacityConfig();
    const maxTenants = getEffectiveMaxTenants();
    const currentTenants = await countTenants();

    return {
      profile: config.profile,
      label: config.label,
      maxTenants,
      currentTenants,
      remaining: Math.max(0, maxTenants - currentTenants),
      atLimit: currentTenants >= maxTenants,
      pm2Instances: config.pm2Instances,
      evolutionOnSameHost: config.evolutionOnSameHost,
    };
  });
