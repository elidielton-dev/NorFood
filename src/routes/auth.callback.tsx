import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import { sanitizeLoginRedirect, followInternalRedirect } from "@/lib/auth/login-redirect";
import { resolvePostLoginRoute } from "@/lib/auth/auth-roles";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    next: sanitizeLoginRedirect(search.next),
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { next } = Route.useSearch();

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      if (isSupabaseConfigured()) {
        await supabase.auth.getSession();
      }

      const destination =
        sanitizeLoginRedirect(next) ?? (await resolvePostLoginRoute());

      if (!cancelled) {
        followInternalRedirect(destination);
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [next]);

  return (
    <div className="grid min-h-screen place-items-center bg-[#F6F7F9] px-4">
      <div className="text-center">
        <NorfoodLogo size="lg" className="mx-auto mb-4" />
        <p className="text-sm text-[#6B7280]">Confirmando acesso…</p>
      </div>
    </div>
  );
}
