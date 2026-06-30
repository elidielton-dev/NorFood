import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { TenantSuspendedScreen } from "@/components/tenant/tenant-suspended-screen";
import { Toaster } from "@/components/ui/sonner";
import { getTenantAccessStatusServer } from "@/lib/api/platform-billing.functions";
import { tenantPath } from "@/lib/tenant/painel-routes";

export const Route = createFileRoute("/conta-suspensa/$slug")({
  ssr: false,
  component: ContaSuspensaPage,
});

function ContaSuspensaPage() {
  const { slug } = Route.useParams();

  const { data: access, isLoading } = useQuery({
    queryKey: ["tenant-suspended", slug],
    queryFn: () => getTenantAccessStatusServer({ data: slug }),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (access?.allowed) {
      window.location.href = tenantPath(slug, "dashboard");
    }
  }, [access?.allowed, slug]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9] text-sm text-[#6B7280]">
        Carregando status da conta…
      </div>
    );
  }

  if (!access) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F6F7F9] px-4 text-center">
        <p className="text-sm text-[#6B7280]">Restaurante não encontrado.</p>
        <Link to="/" className="text-sm font-medium text-[#FF9100] hover:underline">
          Voltar ao site
        </Link>
      </div>
    );
  }

  if (access.reason === "pending_approval") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F6F7F9] px-4 text-center">
        <p className="text-sm text-[#6B7280]">Seu cadastro ainda está em análise.</p>
        <Link
          to="/cadastro/aguardando/$slug"
          params={{ slug }}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-[#111111] px-6 text-sm font-medium text-white hover:bg-[#333]"
        >
          Ver status do cadastro
        </Link>
      </div>
    );
  }

  if (access.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9] text-sm text-[#6B7280]">
        Redirecionando para o painel…
      </div>
    );
  }

  return (
    <>
      <Toaster richColors position="top-center" />
      <TenantSuspendedScreen
        slug={slug}
        tenantName={access.tenantName}
        message={access.message}
        reason={access.reason}
        suspensionKind={access.suspensionKind}
        canAccessBillingPage={access.canAccessBillingPage}
        mode="standalone"
      />
    </>
  );
}
