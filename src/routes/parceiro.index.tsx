import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Award,
  Building2,
  KeyRound,
  Megaphone,
  Plus,
  TrendingUp,
} from "lucide-react";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import { useParceiroInsights } from "@/lib/parceiro/use-parceiro-insights";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/parceiro/")({
  component: ParceiroDashboardPage,
});

function ParceiroDashboardPage() {
  const { isLoading, reseller, stats, achievements, unlockedCount, level, tenants, tokens, tokensUsed } =
    useParceiroInsights();

  const quotaUsed = stats?.total ?? 0;
  const quotaMax = reseller?.max_tenants ?? 0;
  const quotaPct = quotaMax > 0 ? Math.round((quotaUsed / quotaMax) * 100) : 0;
  const recentAchievements = achievements.filter((a) => a.unlocked).slice(0, 3);
  const nextAchievement = achievements.find((a) => !a.unlocked);

  return (
    <ParceiroPage
      title={reseller?.name ?? "Início"}
      subtitle="Visão geral da sua rede de restaurantes e desempenho como hiperador."
      actions={
        <>
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
        </>
      }
    >
      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando painel...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Restaurantes" value={String(stats?.total ?? 0)} hint={`${quotaPct}% da cota`} />
            <MetricCard label="Ativos" value={String(stats?.active ?? 0)} tone="success" />
            <MetricCard label="Em trial" value={String(stats?.trial ?? 0)} tone="warning" />
            <MetricCard label="Tokens usados" value={String(tokensUsed)} hint={`Nível ${level}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ParceiroCard className="lg:col-span-2" title="Licenças e crescimento">
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-[#6B7280]">Uso de licenças</span>
                    <span className="font-semibold text-[#111111]">
                      {quotaUsed} / {quotaMax || "—"}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#F3F4F6]">
                    <div
                      className="h-full rounded-full bg-[#FF9100] transition-all"
                      style={{ width: `${Math.min(quotaPct, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniStat icon={TrendingUp} label="Taxa de ativação" value={`${stats?.active ?? 0} ativos`} />
                  <MiniStat icon={Building2} label="Suspensos" value={String(stats?.suspended ?? 0)} />
                  <MiniStat icon={KeyRound} label="Tokens gerados" value={String(tokens.length)} />
                </div>
              </div>
            </ParceiroCard>

            <ParceiroCard title="Conquistas">
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-[#FF9100]/10">
                  <Award className="size-6 text-[#FF9100]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#111111]">{unlockedCount}</p>
                  <p className="text-xs text-[#6B7280]">de {achievements.length} desbloqueadas</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2">
                {recentAchievements.length === 0 ? (
                  <li className="text-sm text-[#6B7280]">Complete ações para ganhar badges.</li>
                ) : (
                  recentAchievements.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm text-[#111111]">
                      <a.icon className="size-4 text-[#FF9100]" />
                      {a.title}
                    </li>
                  ))
                )}
              </ul>
              {nextAchievement ? (
                <p className="mt-3 text-xs text-[#6B7280]">
                  Próxima: <span className="font-medium text-[#111111]">{nextAchievement.title}</span> (
                  {nextAchievement.progress}/{nextAchievement.target})
                </p>
              ) : null}
              <Link
                to="/parceiro/conquistas"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#FF9100] hover:underline"
              >
                Ver todas
                <ArrowUpRight className="size-3.5" />
              </Link>
            </ParceiroCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ParceiroCard title="Ações rápidas">
              <div className="grid gap-2 sm:grid-cols-2">
                <QuickLink to="/parceiro/restaurantes" icon={Building2} label="Gerenciar restaurantes" />
                <QuickLink to="/parceiro/marketing" icon={Megaphone} label="Kit de marketing" />
                <QuickLink to="/parceiro/relatorios" icon={TrendingUp} label="Relatórios" />
                <QuickLink to="/parceiro/ajuda" icon={Award} label="Central de ajuda" />
              </div>
            </ParceiroCard>

            <ParceiroCard title="Restaurantes recentes">
              {tenants.length === 0 ? (
                <p className="text-sm text-[#6B7280]">Nenhum restaurante cadastrado ainda.</p>
              ) : (
                <ul className="divide-y divide-[#E5E7EB]">
                  {tenants.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-[#111111]">{t.name}</p>
                        <p className="text-xs text-[#6B7280]">{t.slug}</p>
                      </div>
                      <span className="rounded-full bg-[#F6F7F9] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#6B7280]">
                        {t.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                to="/parceiro/restaurantes"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#FF9100] hover:underline"
              >
                Ver carteira completa
                <ArrowUpRight className="size-3.5" />
              </Link>
            </ParceiroCard>
          </div>
        </div>
      )}
    </ParceiroPage>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "warning";
}) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          tone === "success" && "text-emerald-600",
          tone === "warning" && "text-amber-600",
          !tone && "text-[#111111]",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-[#6B7280]">{hint}</p> : null}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-[#F6F7F9] p-3">
      <Icon className="mb-1 size-4 text-[#FF9100]" />
      <p className="text-[10px] uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="text-sm font-semibold text-[#111111]">{value}</p>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Building2;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] px-3 py-3 text-sm font-medium text-[#111111] hover:bg-[#F6F7F9]"
    >
      <Icon className="size-4 text-[#FF9100]" />
      {label}
    </Link>
  );
}
