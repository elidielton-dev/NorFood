import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTenantOptional } from "@/lib/tenant/tenant-context";
import { mapLegacyPainelPath } from "@/lib/tenant/painel-routes";

type PainelNavigateOptions = {
  to: string;
  search?: Record<string, unknown>;
  replace?: boolean;
};

/** Navegação que respeita rotas tenant (/t/:slug/*) quando aplicável */
export function usePainelNavigate() {
  const navigate = useNavigate();
  const tenantCtx = useTenantOptional();

  return useCallback(
    ({ to, search, replace }: PainelNavigateOptions) => {
      if (tenantCtx && to.startsWith("/painel")) {
        const mapped = mapLegacyPainelPath(to, tenantCtx.tenant.slug);
        if (mapped) {
          void navigate({ to: mapped, search, replace });
          return;
        }
      }
      void navigate({ to, search, replace });
    },
    [navigate, tenantCtx],
  );
}
