import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
  canAccessRouteForPlan,
  getFeatureLabel,
  getPlanUpgradeLabel,
  planFeatureForRoute,
} from "@/lib/platform/plan-features";
import { getTenantPlanFeaturesServer } from "@/lib/api/platform-billing.functions";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { cn } from "@/lib/utils";

type TenantPlanGateProps = {
  tenantSlug: string;
  children: React.ReactNode;
};

function extractPainelRoute(pathname: string, tenantSlug: string): string {
  const prefix = `/t/${tenantSlug}/`;
  if (!pathname.startsWith(prefix)) return "dashboard";
  return pathname.slice(prefix.length).replace(/^\/+|\/+$/g, "") || "dashboard";
}

export function TenantPlanGate({ tenantSlug, children }: TenantPlanGateProps) {
  const location = useLocation();
  const routePath = extractPainelRoute(location.pathname, tenantSlug);
  const requiredFeature = planFeatureForRoute(routePath);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["tenant-plan-features", tenantSlug],
    queryFn: () => getTenantPlanFeaturesServer({ data: tenantSlug }),
    staleTime: 60_000,
    retry: 1,
  });

  if (!requiredFeature || isLoading || !plan) {
    return <>{children}</>;
  }

  if (canAccessRouteForPlan(routePath, plan.planId)) {
    return <>{children}</>;
  }

  const upgradePlan = getPlanUpgradeLabel(requiredFeature);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/30">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          Plano {plan.planLabel}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-foreground">
          {getFeatureLabel(requiredFeature)}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Este recurso faz parte do plano <strong>{upgradePlan}</strong>. Faça upgrade para liberar
          no seu restaurante.
        </p>
        {plan.monthlyOrderLimit != null && requiredFeature === "unlimited_orders" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Uso este mês: {plan.monthlyOrderCount}/{plan.monthlyOrderLimit} pedidos
          </p>
        ) : null}
        <Link
          to={tenantPath(tenantSlug, "estabelecimento/plano")}
          className={cn(
            "mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#111111] px-6 text-sm font-medium text-white hover:bg-[#333]",
          )}
        >
          Ver planos e upgrade
        </Link>
      </div>
    </div>
  );
}
