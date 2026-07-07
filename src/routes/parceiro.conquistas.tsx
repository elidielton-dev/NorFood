import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { ParceiroCard, ParceiroPage } from "@/routes/parceiro";
import { useParceiroInsights } from "@/lib/parceiro/use-parceiro-insights";
import { getAchievementTierColor } from "@/lib/parceiro/achievements";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/parceiro/conquistas")({
  component: ParceiroConquistasPage,
});

function ParceiroConquistasPage() {
  const { isLoading, achievements, unlockedCount, level } = useParceiroInsights();

  const tiers = ["bronze", "silver", "gold", "platinum"] as const;

  return (
    <ParceiroPage
      title="Conquistas"
      subtitle="Badges de desempenho inspiradas em programas de parceiros SaaS — cresça a carteira e desbloqueie níveis."
    >
      {isLoading ? (
        <p className="text-sm text-[#6B7280]">Carregando conquistas...</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label="Nível atual" value={level} />
            <SummaryCard label="Desbloqueadas" value={`${unlockedCount}/${achievements.length}`} />
            <SummaryCard
              label="Progresso geral"
              value={`${Math.round((unlockedCount / achievements.length) * 100)}%`}
            />
          </div>

          {tiers.map((tier) => {
            const tierItems = achievements.filter((a) => a.tier === tier);
            if (tierItems.length === 0) return null;
            return (
              <section key={tier}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#9CA3AF]">{tier}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {tierItems.map((achievement) => {
                    const Icon = achievement.icon;
                    const pct =
                      achievement.target > 0
                        ? Math.round((achievement.progress / achievement.target) * 100)
                        : 0;
                    return (
                      <article
                        key={achievement.id}
                        className={cn(
                          "relative overflow-hidden rounded-2xl border p-4 transition",
                          achievement.unlocked
                            ? getAchievementTierColor(achievement.tier)
                            : "border-[#E5E7EB] bg-white opacity-90",
                        )}
                      >
                        {!achievement.unlocked ? (
                          <Lock className="absolute right-3 top-3 size-4 text-[#9CA3AF]" />
                        ) : null}
                        <Icon className="size-8" />
                        <h3 className="mt-3 text-sm font-semibold">{achievement.title}</h3>
                        <p className="mt-1 text-xs opacity-80">{achievement.description}</p>
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-[10px] font-medium uppercase">
                            <span>Progresso</span>
                            <span>
                              {achievement.progress}/{achievement.target}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                            <div
                              className="h-full rounded-full bg-current opacity-60"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <ParceiroCard title="Como subir de nível">
            <ul className="grid gap-2 text-sm text-[#6B7280] sm:grid-cols-2">
              <li>• Bronze: primeiros clientes e tokens</li>
              <li>• Silver: carteira com 5+ restaurantes ou adoção de tokens</li>
              <li>• Gold: rede consolidada e base ativa saudável</li>
              <li>• Platinum: cota maximizada e parceiro estrela</li>
            </ul>
          </ParceiroCard>
        </div>
      )}
    </ParceiroPage>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#111111]">{value}</p>
    </div>
  );
}
