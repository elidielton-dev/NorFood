import { createMiddleware } from "@tanstack/react-start";
import type { PlanFeatureKey } from "@/lib/platform/plan-features";

/** Exige autenticação prévia (requireSupabaseAuth) com context.userId. */
export function requirePlanFeature(feature: PlanFeatureKey) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const userId = (context as { userId?: string }).userId;
    if (!userId) {
      throw new Error("Unauthorized: plan feature check requires userId in context.");
    }
    const { assertPlanFeatureForStaffUser } = await import("@/lib/tenant/tenant-plan.server");
    await assertPlanFeatureForStaffUser(userId, feature);
    return next();
  });
}
