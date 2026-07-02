import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { BarChart3, PieChart } from "lucide-react";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import { useParceiroInsights } from "@/lib/parceiro/use-parceiro-insights";
import { BILLING_PLANS } from "@/lib/platform/billing-plans";

export const Route = createFileRoute("/parceiro/relatorios")({
  component: ParceiroRelatoriosPage,
});

function ParceiroRelatoriosPage() {
  const { isLoading, stats, tenants, tokens, tokensUsed, reseller } = useParceiroInsights();

  const byPlan = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tenants) {
      const plan = t.plan ?? "sem_plano";
      map.set(plan, (map.get(plan) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [tenants]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tenants) {
      map.set(t.status, (map.get(t.status) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [tenants]);

  const tokenStats = useMemo(() => {
    const active = tokens.filter((t) => t.status === "active").length;
    const consumed = tokens.filter((t) => t.status === "consumed").length;
    const revoked = tokens.filter((t) => t.status === "revoked").length;
    return { active, consumed, revoked, total: tokens.length, used: tokensUsed };
  }, [tokens, tokensUsed]);

  const conversionRate =
    tokens.length > 0 ? Math.round((tokenStats.consumed / tokens.length) * 100) : 0;

  return (
    <ParceiroPage
      title="Relatórios"
      subtitle="Métricas da carteira, adoção de tokens e distribuição por plano."
    >
      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando relatórios...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Carteira total" value={String(stats?.total ?? 0)} />
            <Kpi label="Clientes ativos" value={String(stats?.active ?? 0)} />
            <Kpi label="Conversão tokens" value={`${conversionRate}%`} />
            <Kpi label="Cota utilizada" value={`${stats?.total ?? 0}/${reseller?.max_tenants ?? "—"}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ParceiroCard title="Distribuição por plano" description="Restaurantes agrupados por plano contratado.">
              {byPlan.length === 0 ? (
                <EmptyChart />
              ) : (
                <div className="space-y-3">
                  {byPlan.map(([plan, count]) => {
                    const pct = tenants.length > 0 ? Math.round((count / tenants.length) * 100) : 0;
                    const label =
                      plan === "sem_plano" ? "Sem plano" : (BILLING_PLANS[plan as keyof typeof BILLING_PLANS]?.name ?? plan);
                    return (
                      <BarRow key={plan} label={label} count={count} pct={pct} />
                    );
                  })}
                </div>
              )}
            </ParceiroCard>

            <ParceiroCard title="Status da carteira" description="Trial, ativos e suspensos.">
              {byStatus.length === 0 ? (
                <EmptyChart />
              ) : (
                <div className="space-y-3">
                  {byStatus.map(([status, count]) => {
                    const pct = tenants.length > 0 ? Math.round((count / tenants.length) * 100) : 0;
                    return <BarRow key={status} label={status} count={count} pct={pct} />;
                  })}
                </div>
              )}
            </ParceiroCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ParceiroCard title="Funil de tokens" description="Performance dos links de ativação.">
              <div className="grid grid-cols-2 gap-3">
                <StatBox label="Gerados" value={tokenStats.total} />
                <StatBox label="Ativos" value={tokenStats.active} />
                <StatBox label="Consumidos" value={tokenStats.consumed} />
                <StatBox label="Usos totais" value={tokenStats.used} />
              </div>
            </ParceiroCard>

            <ParceiroCard title="Insights automáticos">
              <ul className="space-y-3 text-sm text-[#6B7280]">
                <Insight icon={BarChart3} text={buildInsightActiveRate(stats?.active ?? 0, stats?.total ?? 0)} />
                <Insight icon={PieChart} text={buildInsightTrial(stats?.trial ?? 0, stats?.total ?? 0)} />
                <Insight icon={BarChart3} text={buildInsightTokens(tokenStats)} />
              </ul>
            </ParceiroCard>
          </div>
        </div>
      )}
    </ParceiroPage>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#111111]">{value}</p>
    </div>
  );
}

function BarRow({ label, count, pct }: { label: string; count: number; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="capitalize text-[#111111]">{label}</span>
        <span className="text-[#6B7280]">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#F3F4F6]">
        <div className="h-full rounded-full bg-[#FF9100]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#F6F7F9] p-3">
      <p className="text-[10px] uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="text-lg font-bold text-[#111111]">{value}</p>
    </div>
  );
}

function EmptyChart() {
  return <p className="py-8 text-center text-sm text-[#6B7280]">Sem dados suficientes ainda.</p>;
}

function Insight({ icon: Icon, text }: { icon: typeof BarChart3; text: string }) {
  return (
    <li className="flex gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-[#FF9100]" />
      <span>{text}</span>
    </li>
  );
}

function buildInsightActiveRate(active: number, total: number) {
  if (total === 0) return "Cadastre o primeiro restaurante para iniciar o acompanhamento.";
  const rate = Math.round((active / total) * 100);
  if (rate >= 80) return `Excelente retenção: ${rate}% da carteira está ativa.`;
  if (rate >= 50) return `${rate}% dos clientes estão ativos — foco em converter trials.`;
  return `Apenas ${rate}% ativos — revise onboarding e suporte aos restaurantes.`;
}

function buildInsightTrial(trial: number, total: number) {
  if (trial === 0) return "Nenhum cliente em trial no momento.";
  if (total > 0 && trial / total > 0.4) return `${trial} em trial — priorize conversão antes do vencimento.`;
  return `${trial} restaurante(s) em período de teste.`;
}

function buildInsightTokens(stats: { total: number; consumed: number; active: number }) {
  if (stats.total === 0) return "Gere tokens de ativação para escalar aquisição sem cadastro manual.";
  if (stats.consumed === 0) return "Tokens criados, mas ainda sem consumo — compartilhe os links.";
  return `${stats.consumed} token(s) já convertidos em novos clientes.`;
}
