import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { checkCurrentUserPlatformAdmin } from "@/lib/platform-admin/client";
import { checkResellerAccess } from "@/lib/reseller/client";
import { ParceiroLayoutShell } from "@/components/parceiro/parceiro-layout-shell";

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
    } catch (error) {
      console.warn("[parceiro] Falha ao verificar revendedora:", error);
      // Usuário autenticado mas API falhou — não mandar de volta ao login (evita loop).
    }

    if (await checkCurrentUserPlatformAdmin()) {
      throw redirect({ to: "/admin/revendedoras" });
    }

    throw redirect({ to: "/parceiro/sem-acesso" });
  },
  component: ParceiroLayoutRoute,
});

function ParceiroLayoutRoute() {
  const location = useLocation();
  const normalized = location.pathname.replace(/\/$/, "") || "/";

  if (normalized === "/parceiro/sem-acesso") {
    return <Outlet />;
  }

  return (
    <ParceiroLayoutShell>
      <Outlet />
    </ParceiroLayoutShell>
  );
}

export { ParceiroPage, ParceiroCard } from "@/components/parceiro/parceiro-layout-shell";
