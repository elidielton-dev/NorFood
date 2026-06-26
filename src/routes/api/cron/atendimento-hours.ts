import { createFileRoute } from "@tanstack/react-router";
import { syncAtendimentoWithStoreHours } from "@/lib/atendimento/atendimento-hours.server";

function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export const Route = createFileRoute("/api/cron/atendimento-hours")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isCronAuthorized(request)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const result = await syncAtendimentoWithStoreHours();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
