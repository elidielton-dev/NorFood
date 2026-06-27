import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { isBrowserDemoEnabled } from "@/lib/runtime";
import { checkCurrentUserPlatformAdmin } from "@/lib/platform-admin/client";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    if (isBrowserDemoEnabled() && !isSupabaseConfigured()) {
      return { demo: true };
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/login",
        search: { redirect: "/admin" },
      });
    }

    const isPlatformAdmin = await checkCurrentUserPlatformAdmin();
    if (!isPlatformAdmin && !isBrowserDemoEnabled()) {
      throw redirect({ to: "/" });
    }

    return { demo: false, user: data.user };
  },
  component: () => <Outlet />,
});
