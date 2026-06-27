import { createFileRoute } from "@tanstack/react-router";
import { resolvePlatformAdminFromBearerToken } from "@/lib/platform-admin/auth.server";

export const Route = createFileRoute("/api/platform-admin/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const session = await resolvePlatformAdminFromBearerToken(authHeader);
        if (!session.userId) {
          return Response.json(
            { allowed: false, reason: authHeader ? "invalid_token" : "no_token" },
            { status: 401, headers: { "cache-control": "no-store" } },
          );
        }
        return Response.json(
          { allowed: session.allowed, email: session.email },
          { status: 200, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
