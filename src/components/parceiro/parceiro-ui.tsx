import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Card de destaque no topo — padrão Hiperador (label, conteúdo, ilustração). */
export function ParceiroHeroCard({
  label,
  children,
  visual,
  className,
  tone = "default",
}: {
  label: string;
  children: ReactNode;
  visual: ReactNode;
  className?: string;
  tone?: "default" | "bronze" | "silver" | "gold" | "platinum" | "bonus";
}) {
  return (
    <article
      className={cn(
        "relative flex min-h-[156px] flex-col overflow-hidden rounded-xl border border-[#E8EAED] bg-white p-5 shadow-[0_2px_8px_rgba(17,17,17,0.06)] transition-shadow hover:shadow-[0_4px_16px_rgba(17,17,17,0.08)]",
        tone === "bronze" && "border-amber-100/80 bg-gradient-to-br from-[#FFF8EE] via-white to-[#FFF3E0]",
        tone === "silver" && "border-slate-200/80 bg-gradient-to-br from-[#F8FAFC] via-white to-[#F1F5F9]",
        tone === "gold" && "border-amber-200/80 bg-gradient-to-br from-[#FFFBEB] via-white to-[#FEF3C7]",
        tone === "platinum" && "border-violet-200/80 bg-gradient-to-br from-[#FAF5FF] via-white to-[#EDE9FE]",
        tone === "bonus" && "border-emerald-100/80 bg-gradient-to-br from-[#F0FDF4] via-white to-[#ECFDF5]",
        className,
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9CA3AF]">{label}</p>
      <div className="mt-3 flex flex-1 items-stretch justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col justify-center">{children}</div>
        <div className="flex shrink-0 items-end justify-end self-stretch">{visual}</div>
      </div>
    </article>
  );
}

export function ParceiroMedalVisual({ level }: { level: string }) {
  const styles = {
    Bronze: { ring: "#D97706", fill: "#F59E0B", shine: "#FDE68A" },
    Silver: { ring: "#64748B", fill: "#94A3B8", shine: "#E2E8F0" },
    Gold: { ring: "#CA8A04", fill: "#EAB308", shine: "#FEF08A" },
    Platinum: { ring: "#7C3AED", fill: "#8B5CF6", shine: "#DDD6FE" },
  }[level] ?? { ring: "#D97706", fill: "#F59E0B", shine: "#FDE68A" };

  return (
    <div className="relative size-[72px] sm:size-[84px]" aria-hidden>
      <svg viewBox="0 0 88 88" className="size-full drop-shadow-sm">
        <circle cx="44" cy="40" r="30" fill={styles.fill} stroke={styles.ring} strokeWidth="3" />
        <ellipse cx="44" cy="34" rx="14" ry="10" fill={styles.shine} opacity="0.55" />
        <path d="M30 58 L24 78 L44 70 L64 78 L58 58 Z" fill={styles.ring} />
        <text
          x="44"
          y="46"
          textAnchor="middle"
          className="fill-white text-[11px] font-bold"
          style={{ fontSize: 11, fontWeight: 700 }}
        >
          {level.slice(0, 1)}
        </text>
      </svg>
    </div>
  );
}

export function ParceiroIconVisual({
  icon: Icon,
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        "grid size-[72px] place-items-center rounded-2xl bg-primary/10 sm:size-[84px]",
        className,
      )}
      aria-hidden
    >
      <Icon className={cn("size-9 text-primary sm:size-10", iconClassName)} strokeWidth={1.5} />
    </div>
  );
}

export function ParceiroSectionCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-[#E8EAED] bg-white shadow-[0_2px_8px_rgba(17,17,17,0.06)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#F0F1F3] px-5 py-4">
        <h2 className="font-display text-base font-semibold text-[#111111]">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ParceiroCtaCard({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-3 rounded-xl bg-primary px-5 py-4 text-white shadow-[0_8px_24px_rgba(255,122,0,0.28)] transition hover:bg-[#FF8A1A] hover:shadow-[0_10px_28px_rgba(255,122,0,0.34)]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/15">
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <span className="text-sm font-semibold leading-tight">{label}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 opacity-80 transition group-hover:translate-x-0.5" />
    </Link>
  );
}

export function ParceiroMiniStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E8EAED] bg-white p-4 shadow-[0_2px_8px_rgba(17,17,17,0.05)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9CA3AF]">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" strokeWidth={1.75} />
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-[#111111]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#6B7280]">{hint}</p> : null}
    </div>
  );
}

export function ParceiroProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "size-2.5 rounded-full transition-colors",
            i < current ? "bg-emerald-500" : "bg-[#E5E7EB]",
          )}
        />
      ))}
      <span className="ml-1 text-[11px] font-medium text-[#6B7280]">
        {current}/{total}
      </span>
    </div>
  );
}
