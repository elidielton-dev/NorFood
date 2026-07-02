import {
  forwardRef,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { useConfiguracoesEmbedded } from "@/components/configuracoes/configuracoes-layout-context";

/** Classes base do painel — estilo fluido inspirado em gestão de cardápio */
export const gestao = {
  page: "space-y-5 sm:space-y-6 animate-fade-up",
  panel: "rounded-2xl border border-[color:var(--honey-line)] bg-card shadow-soft",
  panelPad: "p-4 sm:p-5",
  ink: "text-[color:var(--gestao-ink)]",
  label: "text-xs font-medium text-muted-foreground",
  eyebrow:
    "text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--gestao-gold-deep)]",
  input:
    "h-10 w-full rounded-xl border border-[color:var(--honey-line)] bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20",
  select:
    "h-10 w-full rounded-xl border border-[color:var(--honey-line)] bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20",
} as const;

export function GestaoPage({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const embedded = useConfiguracoesEmbedded();

  if (embedded) {
    return <div className={cn(gestao.page, "space-y-5")}>{children}</div>;
  }

  return (
    <div className={gestao.page}>
      <div
        className={cn(
          gestao.panel,
          "flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        )}
      >
        <div className="min-w-0">
          {eyebrow ? <p className={gestao.eyebrow}>{eyebrow}</p> : null}
          <h1 className={cn("font-display text-2xl sm:text-3xl lg:text-4xl", gestao.ink)}>
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function GestaoCard({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return <div className={cn(gestao.panel, padding && gestao.panelPad, className)}>{children}</div>;
}

export function GestaoStat({
  label,
  value,
  icon,
  hint,
  className,
  tone = "default",
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  hint?: string;
  className?: string;
  tone?: "default" | "success" | "warning" | "info" | "gold";
}) {
  const tones = {
    default: "bg-[color:var(--gestao-cream)]/60 text-primary",
    success: "bg-emerald-500/10 text-emerald-700",
    warning: "bg-amber-500/10 text-amber-700",
    info: "bg-sky-500/10 text-sky-700",
    gold: "bg-amber-500/10 text-[color:var(--gestao-gold-deep)]",
  };

  return (
    <div className={cn(gestao.panel, "p-4 sm:p-5", className)}>
      {icon ? (
        <div
          className={cn("mb-3 grid size-10 place-items-center rounded-xl sm:size-11", tones[tone])}
        >
          {icon}
        </div>
      ) : null}
      <p className={gestao.eyebrow}>{label}</p>
      <p className={cn("mt-1 font-display text-2xl sm:text-3xl", gestao.ink)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function GestaoSectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow ? <p className={cn("mb-1", gestao.eyebrow)}>{eyebrow}</p> : null}
        <h2 className={cn("font-display text-xl sm:text-2xl", gestao.ink)}>{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function GestaoTabs({
  value,
  onChange,
  items,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  items: { id: string; label: string; badge?: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn(gestao.panel, "overflow-x-auto p-1.5 sm:p-2", className)}>
      <div className="flex min-w-max gap-1 sm:min-w-0 sm:flex-wrap">
        {items.map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={cn(
                "relative inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {item.label}
              {item.badge}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Abas estilo underline (modal / formulários) */
export function GestaoUnderlineTabs({
  value,
  onChange,
  items,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  items: { id: string; label: string; badge?: ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-0 overflow-x-auto border-b border-[color:var(--honey-line)]",
        className,
      )}
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "relative shrink-0 px-4 py-3 text-sm font-medium transition",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="inline-flex items-center gap-2">
              {item.label}
              {item.badge}
            </span>
            {active ? (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function GestaoButton({
  children,
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:opacity-95 shadow-sm",
    secondary: "border border-[color:var(--honey-line)] bg-background hover:bg-muted/50",
    ghost: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
    danger: "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
  };
  const sizes = {
    sm: "h-8 px-3 text-xs rounded-lg",
    md: "h-10 px-4 text-sm rounded-xl",
    lg: "h-11 px-5 text-sm rounded-xl",
  };

  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function GestaoField({
  label,
  children,
  className,
  required,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={className}>
      <p className={cn("mb-1.5", gestao.label)}>
        {label}
        {required ? <span className="text-primary"> *</span> : null}
      </p>
      {children}
    </div>
  );
}

export const GestaoInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function GestaoInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn(gestao.input, className)} {...props} />;
  },
);

export function GestaoSelect({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(gestao.select, className)} {...props}>
      {children}
    </select>
  );
}

export function GestaoToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {children}
    </div>
  );
}

export function GestaoSearch({
  value,
  onChange,
  placeholder = "Buscar...",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1 sm:min-w-[220px]", className)}>
      <GestaoInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-3"
      />
    </div>
  );
}

export function GestaoTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(gestao.panel, "overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">{children}</table>
      </div>
    </div>
  );
}

export function GestaoTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-[color:var(--honey-line)] bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
      {children}
    </thead>
  );
}

export function GestaoEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--honey-line)] bg-muted/20 px-6 py-12 text-center">
      <p className={cn("font-display text-lg", gestao.ink)}>{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function GestaoAlert({
  children,
  tone = "warning",
}: {
  children: ReactNode;
  tone?: "warning" | "info" | "success";
}) {
  const tones = {
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function GestaoSegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[color:var(--honey-line)] bg-muted/30 p-1">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "info" | "danger";
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    info: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    danger: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  };

  return (
    <span
      className={cn(
        "inline-flex min-w-fit items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Card clicável para hubs e navegação entre rotas */
export function GestaoInteractiveCard({
  children,
  className,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={cn(
        gestao.panel,
        padding && gestao.panelPad,
        "transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(255,122,0,0.12)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Destaque de cabeçalho em páginas de detalhe */
export function GestaoHeroCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        gestao.panel,
        gestao.panelPad,
        "bg-[linear-gradient(135deg,var(--surface-muted),white_60%)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Rodapé fixo para modais */
export function GestaoModalFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 flex flex-col gap-3 border-t border-[color:var(--honey-line)] bg-card/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
