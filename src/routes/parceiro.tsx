import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { checkCurrentUserPlatformAdmin } from "@/lib/platform-admin/client";
import { checkResellerAccess } from "@/lib/reseller/client";

export const Route = createFileRoute("/parceiro")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const normalizedPath = location.pathname.replace(/\/$/, "") || "/";

    if (normalizedPath === "/parceiro/sem-acesso") {
      return {};
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: "/parceiro" } });
    }

    try {
      const access = await checkResellerAccess();
      if (access.allowed) {
        return { access };
      }
    } catch {
      throw redirect({ to: "/login", search: { redirect: "/parceiro" } });
    }

    if (await checkCurrentUserPlatformAdmin()) {
      throw redirect({ to: "/admin/revendedoras" });
    }

    throw redirect({ to: "/parceiro/sem-acesso" });
  },
  component: () => <Outlet />,
});

export { ParceiroShell } from "@/routes/parceiro-shell";
