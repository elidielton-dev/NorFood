import { useQuery } from "@tanstack/react-query";
import { fetchResellerPortalCounts } from "@/lib/reseller/client";

export function useParceiroPortalCounts() {
  return useQuery({
    queryKey: ["reseller-portal-counts"],
    queryFn: fetchResellerPortalCounts,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
