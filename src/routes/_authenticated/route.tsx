import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthenticatedUser } from "@/lib/auth/auth-session";
import { currentPathForLoginRedirect } from "@/lib/auth/login-redirect";

/**
 * Layout protegido. Todos os modulos internos (admin, PDV, KDS, motoboy)
 * ficam abaixo deste gate. Roda apenas no cliente (Supabase guarda sessao em localStorage).
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw redirect({
        to: "/login",
        search: { redirect: currentPathForLoginRedirect(location.pathname, location.searchStr) },
      });
    }
    return { user };
  },
  component: () => <Outlet />,
});
