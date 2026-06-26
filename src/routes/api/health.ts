import { createFileRoute } from "@tanstack/react-router";
import { getEffectiveMaxTenants, getPlatformCapacityConfig } from "@/lib/platform/platform-limits";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const cfg = getPlatformCapacityConfig();
        const body = {
          ok: true,
          service: "norfood",
          timestamp: new Date().toISOString(),
          profile: cfg.profile,
          maxTenants: getEffectiveMaxTenants(),
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
