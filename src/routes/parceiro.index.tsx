import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, KeyRound, Plus } from "lucide-react";
import { ParceiroShell } from "@/routes/parceiro";
import { fetchResellerDashboard } from "@/lib/reseller/client";

export const Route = createFileRoute("/parceiro/")({
  component: ParceiroDashboardPage,
});

function ParceiroDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reseller-dashboard"],
    queryFn: fetchResellerDashboard,
  });

  const stats = data?.stats;
  const reseller = data?.reseller;

  return (
    <ParceiroShell
      title={reseller?.name ?? "Dashboard"}
      subtitle={`Licencas: ${stats?.total ?? 0} / ${reseller?.max_tenants ?? "—"}`}
    >
      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando...</p>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total" value={String(stats?.total ?? 0)} />
            <StatCard label="Trial" value={String(stats?.trial ?? 0)} />
            <StatCard label="Ativos" value={String(stats?.active ?? 0)} />
            <StatCard label="Suspensos" value={String(stats?.suspended ?? 0)} />
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/parceiro/restaurantes/nova"
              className="inline-flex items-center gap-2 rounded-xl bg-[#111111] px-4 py-2.5 text-sm font-medium text-white"
            >
              <Plus className="size-4" />
              Novo restaurante
            </Link>
            <Link
              to="/parceiro/tokens"
              className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-medium"
            >
              <KeyRound className="size-4" />
              Gerar token
            </Link>
            <Link
              to="/parceiro/restaurantes"
              className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-medium"
            >
              <Building2 className="size-4" />
              Ver restaurantes
            </Link>
          </div>
        </>
      )}
    </ParceiroShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#111111]">{value}</p>
    </div>
  );
}
