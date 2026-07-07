import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/shared/utils";
import { gestao } from "@/components/painel/gestao-ui";

/** Layout wacrm adaptado ao tema claro Abelha (sage / mel). */
export const atendimento = {
  page: "space-y-6",
  card: "rounded-xl border border-[color:var(--honey-line)] bg-card overflow-hidden",
  cardHover: "transition-colors hover:border-sage/30 hover:bg-[color:var(--gestao-cream)]/30",
  muted: "text-muted-foreground",
  ink: gestao.ink,
  input: gestao.input,
  select: gestao.select,
  label: gestao.label,
  primaryBtn:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-sage px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-sage/90 disabled:opacity-50",
  outlineBtn:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--honey-line)] bg-background px-4 py-2 text-sm font-medium text-[color:var(--gestao-ink)] transition hover:bg-[color:var(--gestao-cream)]/60 disabled:opacity-50",
  pillActive: "bg-sage/10 text-sage",
  iconBox: "flex size-9 items-center justify-center rounded-lg bg-sage/10 text-sage",
  iconBoxLg: "flex size-10 items-center justify-center rounded-lg bg-sage/10 text-sage",
} as const;

export function AtendimentoPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className={cn("text-2xl font-bold", atendimento.ink)}>{title}</h1>
        {subtitle ? <p className={cn("mt-1 text-sm", atendimento.muted)}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AtendimentoSearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative max-w-sm", className)}>
      <svg
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        className={cn(atendimento.input, "pl-8")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function ContactAvatar({
  name,
  imageUrl,
  size = "sm",
}: {
  name: string | null | undefined;
  imageUrl?: string | null;
  size?: "sm" | "md";
}) {
  const classes = size === "md" ? "size-11 text-sm" : "size-10 text-xs";
  const initial = (name ?? "?").charAt(0).toUpperCase();
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [imageUrl]);

  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt={name ?? "Contato"}
        className={cn("shrink-0 rounded-full object-cover", classes)}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-sage/15 font-semibold text-sage",
        classes,
      )}
    >
      {initial}
    </div>
  );
}

export function formatChatTime(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function formatRelativePt(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
