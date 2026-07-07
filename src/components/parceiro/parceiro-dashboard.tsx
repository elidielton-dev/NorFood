import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Award,
  Building2,
  ChevronLeft,
  ChevronRight,
  Gift,
  GraduationCap,
  HelpCircle,
  Megaphone,
  Newspaper,
  Plus,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { useParceiroInsights } from "@/lib/parceiro/use-parceiro-insights";
import {
  PARCEIRO_BANNER_SLIDES,
  PARCEIRO_TIMELINE_POSTS,
  buildMonthlyActivations,
  buildProfileDimensions,
  getQuarterlyBonus,
  parseServiceCitiesFromNotes,
} from "@/lib/parceiro/parceiro-home-content";
import {
  ParceiroCtaCard,
  ParceiroHeroCard,
  ParceiroIconVisual,
  ParceiroMedalVisual,
  ParceiroMiniStat,
  ParceiroProgressDots,
  ParceiroSectionCard,
} from "@/components/parceiro/parceiro-ui";
import { cn } from "@/lib/shared/utils";

const PARCEIRO_BANNER_IMAGES = {
  "quero-delivery": "/parceiro/banner-integracao-quero-delivery.png?v=2",
} as const;

/** Proporção nativa do banner (1024×341) — evita crop e upscale desnecessário */
const BANNER_CAROUSEL_FRAME = "aspect-[1024/341] w-full";
const BANNER_CONTENT_MIN = "min-h-[11.5rem] sm:min-h-[12.75rem]";

function ParceiroBannerCarousel() {
  const [bannerIndex, setBannerIndex] = useState(0);
  const slide = PARCEIRO_BANNER_SLIDES[bannerIndex]!;
  const isImageSlide = slide.kind === "image";

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl shadow-[0_8px_28px_rgba(17,17,17,0.18)]",
        isImageSlide ? BANNER_CAROUSEL_FRAME : cn(BANNER_CONTENT_MIN, "flex items-center"),
        slide.kind === "content"
          ? cn("bg-gradient-to-r p-6 text-white sm:p-8", slide.accent)
          : "bg-[#FFF7F0]",
      )}
    >
      {slide.kind === "image" ? (
        slide.href ? (
          <Link to={slide.href} className="absolute inset-0 block">
            <img
              src={PARCEIRO_BANNER_IMAGES[slide.imageKey]}
              alt={slide.alt}
              width={1024}
              height={341}
              className="size-full object-contain object-center"
              loading={bannerIndex === 0 ? "eager" : "lazy"}
              fetchPriority={bannerIndex === 0 ? "high" : "auto"}
              decoding="async"
            />
          </Link>
        ) : (
          <img
            src={PARCEIRO_BANNER_IMAGES[slide.imageKey]}
            alt={slide.alt}
            width={1024}
            height={341}
            className="absolute inset-0 size-full object-contain object-center"
            loading={bannerIndex === 0 ? "eager" : "lazy"}
            fetchPriority={bannerIndex === 0 ? "high" : "auto"}
            decoding="async"
          />
        )
      ) : (
        <div className="relative z-10 max-w-lg">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">Destaque</p>
          <h2 className="mt-1 font-display text-2xl font-bold">{slide.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/90">{slide.subtitle}</p>
          <Link
            to={slide.href}
            className="mt-4 inline-flex rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-white/95"
          >
            {slide.cta}
          </Link>
        </div>
      )}

      <div className="absolute right-4 top-1/2 z-20 flex -translate-y-1/2 gap-2">
        <button
          type="button"
          onClick={() =>
            setBannerIndex((i) => (i - 1 + PARCEIRO_BANNER_SLIDES.length) % PARCEIRO_BANNER_SLIDES.length)
          }
          className="grid size-9 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40"
          aria-label="Anterior"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setBannerIndex((i) => (i + 1) % PARCEIRO_BANNER_SLIDES.length)}
          className="grid size-9 place-items-center rounded-full bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40"
          aria-label="Próximo"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="absolute bottom-4 right-6 z-20 flex gap-1.5">
        {PARCEIRO_BANNER_SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setBannerIndex(i)}
            className={cn(
              "size-2 rounded-full ring-1 ring-black/15 transition",
              i === bannerIndex ? "bg-white shadow-sm" : "bg-white/50",
            )}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}

function tierTone(level: string): "bronze" | "silver" | "gold" | "platinum" {
  switch (level.toLowerCase()) {
    case "silver":
      return "silver";
    case "gold":
      return "gold";
    case "platinum":
      return "platinum";
    default:
      return "bronze";
  }
}

export function ParceiroDashboard() {
  const insights = useParceiroInsights();
  const {
    isLoading,
    reseller,
    stats,
    tenants,
    tokens,
    tokensUsed,
    level,
    achievements,
    teamSize,
  } = insights;

  const monthly = useMemo(() => buildMonthlyActivations(tenants), [tenants]);
  const bonus = useMemo(() => getQuarterlyBonus(stats?.active ?? 0), [stats?.active]);
  const profile = useMemo(
    () =>
      buildProfileDimensions({
        teamSize,
        totalTenants: stats?.total ?? 0,
        activeTenants: stats?.active ?? 0,
        tokensCreated: tokens.length,
        tokensUsed,
        achievements,
      }),
    [teamSize, stats, tokens, tokensUsed, achievements],
  );
  const cities = useMemo(
    () => parseServiceCitiesFromNotes(reseller?.notes),
    [reseller?.notes],
  );
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      {/* Barra de boas-vindas estilo Hiper */}
      <div className="flex flex-col gap-4 rounded-xl border border-[#E8EAED] bg-white px-5 py-4 shadow-[0_2px_8px_rgba(17,17,17,0.05)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
            {level}
          </span>
          <div>
            <p className="font-display text-lg font-semibold text-[#111111]">{reseller?.name ?? "Parceiro"}</p>
            <p className="text-sm text-[#6B7280]">Portal do revendedor NorFood</p>
          </div>
        </div>
        <Link
          to="/parceiro/restaurantes/nova"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#111111] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#222222]"
        >
          <Plus className="size-4" />
          Novo restaurante
        </Link>
      </div>

      {/* 3 cards topo — Hiperador */}
      <div className="grid gap-4 md:grid-cols-3">
        <ParceiroHeroCard label="Categoria" tone={tierTone(level)} visual={<ParceiroMedalVisual level={level} />}>
          <p className="text-sm text-[#6B7280]">Sua categoria é</p>
          <p className="mt-0.5 text-2xl font-bold text-[#111111]">{level}</p>
          <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">
            {unlockedCount} conquista{unlockedCount !== 1 ? "s" : ""} desbloqueada{unlockedCount !== 1 ? "s" : ""}
          </p>
          <Link
            to="/parceiro/conquistas"
            className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
          >
            Ver evolução
          </Link>
        </ParceiroHeroCard>

        <ParceiroHeroCard label="Clientes" visual={<ParceiroIconVisual icon={Users} />}>
          <p className="text-4xl font-bold tabular-nums leading-none text-[#111111]">{stats?.active ?? 0}</p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9CA3AF]">Ativações</p>
          <p className="mt-2 text-sm text-[#6B7280]">
            <span className="font-semibold text-[#111111]">{stats?.total ?? 0}</span> restaurantes na carteira
          </p>
        </ParceiroHeroCard>

        <ParceiroHeroCard label="Bônus por trimestre" tone="bonus" visual={<ParceiroIconVisual icon={Gift} iconClassName="text-emerald-600" className="bg-emerald-50" />}>
          <p className="text-sm leading-relaxed text-[#374151]">{bonus.message}</p>
          <ParceiroProgressDots current={Math.min(bonus.target, stats?.active ?? 0)} total={bonus.target} />
          {bonus.achieved ? (
            <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
              Meta atingida
            </span>
          ) : (
            <p className="mt-2 text-xs font-medium text-emerald-700">+{bonus.discountPct}% na fatura trimestral</p>
          )}
        </ParceiroHeroCard>
      </div>

      <ParceiroBannerCarousel />

      {/* CTAs largos */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ParceiroCtaCard to="/parceiro/marketing" icon={Megaphone} label="Materiais de Marketing" />
        <ParceiroCtaCard to="/parceiro/ajuda" icon={HelpCircle} label="Central de Ajuda" />
        <ParceiroCtaCard to="/parceiro/ajuda" icon={Newspaper} label="Release Notes" />
      </div>

      {/* Academia + Timeline */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ParceiroSectionCard
          title="NorFood Academia"
          action={
            <Link to="/parceiro/academia" className="text-xs font-semibold text-primary hover:underline">
              Ver todos
            </Link>
          }
        >
          <div className="flex gap-4 rounded-xl border border-[#F0F1F3] bg-[#FAFBFC] p-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-primary/10">
              <GraduationCap className="size-8 text-primary" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[#111111]">Aprenda a utilizar o NorFood</p>
              <p className="mt-1 text-sm leading-relaxed text-[#6B7280]">
                Onboarding, vendas consultivas e implantação de restaurantes.
              </p>
              <Link
                to="/parceiro/academia"
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
              >
                Assistir curso
              </Link>
            </div>
          </div>
        </ParceiroSectionCard>

        <ParceiroSectionCard title="Linha do tempo">
          <div className="space-y-0">
            {PARCEIRO_TIMELINE_POSTS.map((post, index) => (
              <div key={post.id} className="relative flex gap-4 pb-5 last:pb-0">
                {index < PARCEIRO_TIMELINE_POSTS.length - 1 ? (
                  <div className="absolute left-[9px] top-5 h-[calc(100%-4px)] w-px bg-[#E5E7EB]" />
                ) : null}
                <div className="relative z-10 mt-0.5 size-[18px] shrink-0 rounded-full border-[3px] border-primary bg-white" />
                <div className="min-w-0 flex-1 border-b border-[#F0F1F3] pb-5 last:border-0 last:pb-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                    {new Date(post.date).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="mt-0.5 font-semibold text-[#111111]">{post.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#6B7280]">{post.excerpt}</p>
                </div>
              </div>
            ))}
          </div>
        </ParceiroSectionCard>
      </div>

      {/* Perfil + Cidades */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ParceiroSectionCard title="Seu perfil">
          <ul className="divide-y divide-[#F0F1F3]">
            {profile.map((dim) => (
              <li key={dim.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <span className="text-sm font-medium text-[#111111]">{dim.label}</span>
                <div className="flex gap-1.5">
                  {Array.from({ length: dim.max }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "size-2.5 rounded-full",
                        i < dim.score ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]" : "bg-[#E5E7EB]",
                      )}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </ParceiroSectionCard>

        <ParceiroSectionCard
          title="Cidades de atuação"
          action={
            <Link to="/parceiro/configuracoes" className="text-xs font-semibold text-primary hover:underline">
              Editar
            </Link>
          }
        >
          <ul className="max-h-48 divide-y divide-[#F0F1F3] overflow-y-auto">
            {cities.map((city) => (
              <li key={city} className="py-2.5 text-sm text-[#6B7280] first:pt-0 last:pb-0">
                {city}
              </li>
            ))}
          </ul>
        </ParceiroSectionCard>
      </div>

      {/* Performance + Restaurantes */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ParceiroSectionCard title="Sua performance" className="lg:col-span-2">
          <p className="-mt-1 mb-4 text-xs text-[#6B7280]">Clientes ativados por mês</p>
          <div className="flex h-44 items-end gap-1.5 sm:gap-2">
            {monthly.map((m) => (
              <div key={m.key} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold tabular-nums text-[#111111] opacity-0 transition group-hover:opacity-100">
                  {m.count}
                </span>
                <div className="flex h-36 w-full items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary/70 transition-all group-hover:from-[#FF8A1A]"
                    style={{ height: `${Math.max(m.pct, m.count > 0 ? 10 : 4)}%` }}
                    title={`${m.count} ativações`}
                  />
                </div>
                <span className="truncate text-[9px] font-medium uppercase text-[#9CA3AF]">{m.label}</span>
              </div>
            ))}
          </div>
        </ParceiroSectionCard>

        <ParceiroSectionCard
          title="Restaurantes recentes"
          action={
            <Link to="/parceiro/restaurantes" className="text-xs font-semibold text-primary hover:underline">
              Ver todos
            </Link>
          }
        >
          {tenants.length === 0 ? (
            <p className="text-sm text-[#6B7280]">Nenhum restaurante cadastrado ainda.</p>
          ) : (
            <ul className="divide-y divide-[#F0F1F3]">
              {tenants.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#111111]">{t.name}</p>
                    <p className="text-xs text-[#9CA3AF]">{t.slug}</p>
                  </div>
                  <span className="shrink-0 rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold uppercase text-[#6B7280]">
                    {t.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ParceiroSectionCard>
      </div>

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ParceiroMiniStat icon={Building2} label="Em trial" value={String(stats?.trial ?? 0)} />
        <ParceiroMiniStat icon={Target} label="Suspensos" value={String(stats?.suspended ?? 0)} />
        <ParceiroMiniStat icon={TrendingUp} label="Tokens gerados" value={String(tokens.length)} />
        <ParceiroMiniStat icon={Award} label="Tokens usados" value={String(tokensUsed)} />
      </div>
    </div>
  );
}
