import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TenantSuspendedScreen } from "@/components/tenant/tenant-suspended-screen";
import { getTenantAccessStatusServer } from "@/lib/api/platform-billing.functions";
import { useTenantOptional } from "@/lib/tenant/tenant-context";
import { cn } from "@/lib/utils";

type TenantOperationalGateProps = {
  children: React.ReactNode;
  /** Permite uso parcial (ex.: só tela de plano) mesmo bloqueado. */
  allowWhenBlocked?: boolean;
  mode?: "loja" | "painel";
};

export function TenantOperationalGate({
  children,
  allowWhenBlocked = false,
  mode = "loja",
}: TenantOperationalGateProps) {
  const tenantCtx = useTenantOptional();
  const slug = tenantCtx?.tenant.slug;

  const { data: access, isLoading } = useQuery({
    queryKey: ["tenant-access", slug],
    queryFn: () => getTenantAccessStatusServer({ data: slug! }),
    enabled: Boolean(slug),
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (!slug || isLoading) return <>{children}</>;
  if (!access || access.allowed || allowWhenBlocked) return <>{children}</>;

  const isPending = access.reason === "pending_approval";
  const isSuspendedLike =
    access.reason === "suspended" ||
    access.reason === "overdue" ||
    access.reason === "trial_expired";

  if (isSuspendedLike) {
    return (
      <TenantSuspendedScreen
        slug={slug}
        tenantName={access.tenantName ?? tenantCtx?.tenant.name}
        message={access.message}
        reason={access.reason}
        suspensionKind={access.suspensionKind}
        canAccessBillingPage={access.canAccessBillingPage}
        mode={mode}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className={cn(
          "rounded-2xl border px-6 py-8 shadow-sm",
          isPending
            ? "border-sky-200 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-950/30"
            : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30",
        )}
      >
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            isPending
              ? "text-sky-700 dark:text-sky-400"
              : "text-amber-700 dark:text-amber-400",
          )}
        >
          {mode === "loja" ? "Loja em preparação" : "Cadastro em análise"}
        </p>
        <h2 className="mt-2 text-lg font-semibold text-foreground">Aguardando aprovação</h2>
        <p className="mt-3 text-sm text-muted-foreground">{access.message}</p>
        <Link
          to="/cadastro/aguardando/$slug"
          params={{ slug }}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#111111] px-6 text-sm font-medium text-white hover:bg-[#333]"
        >
          Ver status do cadastro
        </Link>
      </div>
    </div>
  );
}
