import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Search params da URL atual — funciona em /t/:slug/* e em /painel/* */
export function usePainelSearch<T>(parse: (search: Record<string, unknown>) => T): T {
  const raw = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });
  return useMemo(() => parse(raw), [raw, parse]);
}
