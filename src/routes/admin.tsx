import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { getAuthenticatedUser } from "@/lib/auth/auth-session";
import { isBrowserDemoEnabled } from "@/lib/shared/runtime";
import { checkCurrentUserPlatformAdmin } from "@/lib/platform-admin/client";
import { AdminLayoutShell, AdminPage, AdminCard, AdminStatCard } from "@/components/admin/admin-layout-shell";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    if (isBrowserDemoEnabled() && !isSupabaseConfigured()) {
      return { demo: true };
    }

    const user = await getAuthenticatedUser();
    if (!user) {
      throw redirect({
        to: "/login",
        search: { redirect: "/admin" },
      });
    }

    const isPlatformAdmin = await checkCurrentUserPlatformAdmin();
    if (!isPlatformAdmin && !isBrowserDemoEnabled()) {
      throw redirect({ to: "/" });
    }

    return { demo: false, user };
  },
  component: AdminLayoutRoute,
});

function AdminLayoutRoute() {
  return (
    <AdminLayoutShell>
      <Outlet />
    </AdminLayoutShell>
  );
}

export { AdminPage, AdminCard, AdminStatCard };
