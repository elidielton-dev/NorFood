import { createFileRoute } from "@tanstack/react-router";
import { extractClientIp } from "@/lib/signup/rate-limit.server";

export const Route = createFileRoute("/api/signup-client-meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = extractClientIp(request.headers);
        return new Response(JSON.stringify({ ip }), {
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
