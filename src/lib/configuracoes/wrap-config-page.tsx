import { lazy, Suspense, type ComponentType } from "react";
import { ConfiguracoesShell } from "@/components/configuracoes/configuracoes-shell";

function configPageSkeleton() {
  return <div className="animate-pulse rounded-lg bg-[#E5E7EB] p-8" />;
}

export function wrapConfigPainelPage(loader: () => Promise<Record<string, unknown>>): ComponentType {
  const LazyPage = lazy(async () => {
    try {
      const mod = await loader();
      const route = mod.Route as { options?: { component?: ComponentType } } | undefined;
      const Comp = route?.options?.component;
      if (Comp) return { default: Comp };
    } catch (error) {
      console.warn("[config] Falha ao carregar rota:", error);
    }
    return {
      default: function ConfigPageUnavailable() {
        return (
          <p className="text-sm text-[#6B7280]">Não foi possível carregar esta configuração.</p>
        );
      },
    };
  });

  return function ConfigWrappedPage() {
    return (
      <ConfiguracoesShell>
        <Suspense fallback={configPageSkeleton()}>
          <LazyPage />
        </Suspense>
      </ConfiguracoesShell>
    );
  };
}
