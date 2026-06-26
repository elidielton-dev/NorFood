import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, ShoppingBag, Users, Wallet, Clock, Truck } from "lucide-react";
import { formatBRL, hasPendingMercadoPagoPayment, listarEntregas, listarPedidos } from "@/lib/db";
import { MetricCard } from "@/components/design-system/metric-card";
import { PageHeader } from "@/components/design-system/page-header";
import { StatusBadge } from "@/components/design-system/status-badge";
import { useTenantOptional } from "@/lib/tenant/tenant-context";

const STATUS_COLORS: Record<string, string> = {
  aberto: "#FF7A00",
  em_preparo: "#3B82F6",
  pronto: "#8B5CF6",
  em_entrega: "#06B6D4",
  entregue: "#10B981",
  cancelado: "#EF4444",
};

export function PainelDashboardPage() {
  const tenantCtx = useTenantOptional();
  const tenantId = tenantCtx?.tenant.id;
  const tenantName = tenantCtx?.tenant.name ?? "Painel";

  const { data: pedidos = [] } = useQuery({
    queryKey: ["pedidos", tenantId],
    queryFn: listarPedidos,
    refetchInterval: 60_000,
  });
  const { data: entregas = [] } = useQuery({
    queryKey: ["entregas", tenantId],
    queryFn: listarEntregas,
  });

  const hoje = new Date().toDateString();
  const pedidosPagosOuOperacionais = pedidos.filter(
    (p) => !hasPendingMercadoPagoPayment(p) && p.status !== "cancelado",
  );
  const deHoje = pedidosPagosOuOperacionais.filter(
    (p) => new Date(p.created_at).toDateString() === hoje,
  );
  const faturamento = deHoje.reduce((s, p) => s + Number(p.total), 0);
  const ticket = deHoje.length ? faturamento / deHoje.length : 0;
  const emAndamento = pedidos.filter((p) =>
    ["aberto", "em_preparo", "pronto", "em_entrega"].includes(p.status),
  ).length;

  const statusChart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of pedidos) {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [pedidos]);

  const prepTimes = useMemo(() => {
    return pedidos
      .filter((p) => p.status === "entregue" || p.status === "pronto")
      .map((p) => {
        const created = new Date(p.created_at).getTime();
        const updated = new Date(p.created_at).getTime();
        return Math.max(0, Math.round((updated - created) / 60000));
      });
  }, [pedidos]);

  const tempoMedioPreparo =
    prepTimes.length > 0
      ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length)
      : 0;

  const entregasConcluidas = entregas.filter((e) => e.entregue_em);
  const tempoMedioEntrega =
    entregasConcluidas.length > 0
      ? Math.round(
          entregasConcluidas.reduce((sum, e) => {
            if (!e.saiu_em || !e.entregue_em) return sum;
            return (
              sum +
              (new Date(e.entregue_em).getTime() - new Date(e.saiu_em).getTime()) / 60000
            );
          }, 0) / entregasConcluidas.length,
        )
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Visão geral de ${tenantName} — vendas, operação e entregas.`}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          label="Vendas do dia"
          value={formatBRL(faturamento)}
          hint="Faturamento consolidado"
          icon={Wallet}
        />
        <MetricCard
          label="Pedidos em andamento"
          value={String(emAndamento)}
          hint={`${deHoje.length} pedidos hoje`}
          icon={ShoppingBag}
        />
        <MetricCard label="Ticket médio" value={formatBRL(ticket)} icon={TrendingUp} />
        <MetricCard
          label="Clientes únicos"
          value={String(new Set(pedidos.map((p) => p.cliente_id).filter(Boolean)).size)}
          hint={`${entregas.length} entregas`}
          icon={Users}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#111111]">Pedidos por status</h2>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusChart}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                >
                  {statusChart.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#6B7280"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#111111]">Indicadores de operação</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <MetricCard
              label="Tempo médio preparo"
              value={`${tempoMedioPreparo} min`}
              icon={Clock}
              className="shadow-none"
            />
            <MetricCard
              label="Tempo médio entrega"
              value={`${tempoMedioEntrega} min`}
              icon={Truck}
              className="shadow-none"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#111111]">Pedidos recentes</h2>
        <div className="mt-4 space-y-2">
          {pedidos.length === 0 ? (
            <p className="text-sm text-[#6B7280]">Nenhum pedido registrado para este tenant.</p>
          ) : (
            pedidos.slice(0, 10).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-[#E5E7EB] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-[#111111]">
                    #{p.numero} · {p.canal}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {new Date(p.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatBRL(Number(p.total))}</span>
                  <StatusBadge
                    tone={
                      p.status === "entregue"
                        ? "success"
                        : p.status === "cancelado"
                          ? "danger"
                          : "primary"
                    }
                  >
                    {p.status.replaceAll("_", " ")}
                  </StatusBadge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
