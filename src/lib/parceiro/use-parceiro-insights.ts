import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchResellerDashboard,
  fetchResellerTenants,
  fetchActivationTokens,
  fetchResellerTeam,
} from "@/lib/reseller/client";
import { buildParceiroAchievements } from "@/lib/parceiro/achievements";

export function useParceiroInsights() {
  const dashboardQuery = useQuery({
    queryKey: ["reseller-dashboard"],
    queryFn: fetchResellerDashboard,
    staleTime: 60_000,
  });

  const tenantsQuery = useQuery({
    queryKey: ["reseller-tenants"],
    queryFn: fetchResellerTenants,
    staleTime: 60_000,
  });

  const tokensQuery = useQuery({
    queryKey: ["reseller-tokens"],
    queryFn: fetchActivationTokens,
    staleTime: 60_000,
  });

  const teamQuery = useQuery({
    queryKey: ["reseller-team"],
    queryFn: fetchResellerTeam,
    staleTime: 60_000,
  });

  const stats = dashboardQuery.data?.stats;
  const reseller = dashboardQuery.data?.reseller;
  const tokens = tokensQuery.data ?? [];

  const tokensUsed = useMemo(
    () => tokens.reduce((acc, t) => acc + (t.uses_count ?? 0), 0),
    [tokens],
  );

  const achievements = useMemo(
    () =>
      buildParceiroAchievements({
        totalTenants: stats?.total ?? 0,
        activeTenants: stats?.active ?? 0,
        tokensCreated: tokens.length,
        tokensUsed,
        maxTenants: reseller?.max_tenants ?? 10,
        createdAt: reseller?.created_at,
      }),
    [stats, tokens, tokensUsed, reseller],
  );

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const teamSize = teamQuery.data?.length ?? 1;

  return {
    isLoading: dashboardQuery.isLoading || tokensQuery.isLoading,
    reseller,
    stats,
    tenants: tenantsQuery.data ?? [],
    tokens,
    tokensUsed,
    achievements,
    unlockedCount,
    teamSize,
    level: unlockedCount >= 6 ? "Platinum" : unlockedCount >= 4 ? "Gold" : unlockedCount >= 2 ? "Silver" : "Bronze",
  };
}
