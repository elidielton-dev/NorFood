import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, LogOut, Menu, X } from "lucide-react";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import {
  PARCEIRO_SIDEBAR_PRIORITY_ITEMS,
  PARCEIRO_SIDEBAR_SECTIONS,
  getAllParceiroSidebarItems,
  isParceiroSidebarItemActive,
  parceiroSidebarHomeItem,
  resolveParceiroSidebarBadge,
  type ParceiroSidebarItem,
} from "@/lib/parceiro/parceiro-sidebar";
import { getParceiroBreadcrumbs } from "@/lib/parceiro/parceiro-nav";
import { fetchResellerDashboard } from "@/lib/reseller/client";
import { useParceiroInsights } from "@/lib/parceiro/use-parceiro-insights";
import { useParceiroPortalCounts } from "@/lib/parceiro/use-parceiro-portal-counts";

export function ParceiroLayoutShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [email, setEmail] = useState("");

  const { data: dashboard } = useQuery({
    queryKey: ["reseller-dashboard"],
    queryFn: fetchResellerDashboard,
    staleTime: 60_000,
  });

  const { level } = useParceiroInsights();
  const { data: portalCounts } = useParceiroPortalCounts();
  const badgeCounts = portalCounts ?? { pendencias: 0, crmLeadsOpen: 0 };

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setEmail("demo@norfood.local");
      return;
    }
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const resellerName = dashboard?.reseller.name ?? "Parceiro";
  const licenseUsed = dashboard?.stats.total ?? 0;
  const licenseMax = dashboard?.reseller.max_tenants ?? 0;
  const firstLetter = email.charAt(0).toUpperCase() || "P";
  const allSidebarItems = useMemo(() => getAllParceiroSidebarItems(), []);

  const panelStatus = useMemo(
    () => ({
      title: "Portal Parceiro NorFood",
      subtitle: `${licenseUsed} de ${licenseMax || "—"} licencas · Nivel ${level}`,
    }),
    [licenseUsed, licenseMax, level],
  );

  async function sair() {
    if (isSupabaseConfigured()) await supabase.auth.signOut();
    nav({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-panel-muted text-foreground">
      <Toaster richColors position="top-right" />

      <ParceiroSidebarShell
        expanded={desktopExpanded}
        onMouseEnter={() => setDesktopExpanded(true)}
        onMouseLeave={() => setDesktopExpanded(false)}
        resellerName={resellerName}
        panelStatus={panelStatus}
        pathname={location.pathname}
        allSidebarItems={allSidebarItems}
        firstLetter={firstLetter}
        email={email}
        onSair={sair}
        badgeCounts={badgeCounts}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-[100dvh] min-h-0 w-[min(100vw-3rem,20rem)] transform flex-col overflow-hidden border-r border-[color:var(--honey-line)] bg-card transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--honey-line)] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <NorfoodLogo size="md" />
            <div className="min-w-0">
              <p className="truncate font-display text-lg leading-tight text-[color:var(--gestao-ink)]">
                {resellerName}
              </p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Parceiro NorFood
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-[color:var(--gestao-ink)] transition hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <ParceiroSidebarNav
          expanded
          pathname={location.pathname}
          allSidebarItems={allSidebarItems}
          onNavigate={() => setMobileOpen(false)}
          badgeCounts={badgeCounts}
        />

        <ParceiroSidebarFooter expanded firstLetter={firstLetter} email={email} onSair={sair} />
      </aside>

      {mobileOpen ? (
        <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
      ) : null}

      <main className="min-w-0 flex-1 lg:pl-16">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--honey-line)] bg-card/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Menu"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-[color:var(--gestao-ink)] transition hover:bg-muted"
          >
            <Menu className="size-5" />
          </button>
          <NorfoodLogo size="sm" />
          <span className="truncate font-display text-lg text-[color:var(--gestao-ink)]">{resellerName}</span>
        </header>

        <ParceiroTopBar
          resellerName={resellerName}
          level={level}
          email={email}
          onSair={sair}
        />

        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
          <ParceiroPortalFooter />
        </div>
      </main>

      <Link
        to="/parceiro/ajuda"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-[#111111] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(0,0,0,0.28)] transition hover:bg-[#222222]"
        aria-label="Central de ajuda"
      >
        <HelpCircle className="size-4" />
        <span className="hidden sm:inline">Ajuda</span>
      </Link>
    </div>
  );
}

function ParceiroPortalFooter() {
  return (
    <footer className="mt-12 border-t border-[color:var(--honey-line)] pt-6 text-center text-xs text-muted-foreground">
      <p className="font-medium text-[color:var(--gestao-ink)]">NorFood · Portal Parceiro</p>
      <p className="mt-1">© {new Date().getFullYear()} NorFood. Todos os direitos reservados.</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link to="/parceiro/ajuda" className="hover:text-primary hover:underline">
          Ajuda
        </Link>
        <Link to="/parceiro/marketing" className="hover:text-primary hover:underline">
          Marketing
        </Link>
        <Link to="/parceiro/configuracoes" className="hover:text-primary hover:underline">
          Configurações
        </Link>
        <a href="https://norfood.com.br" target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
          norfood.com.br
        </a>
      </div>
    </footer>
  );
}

function ParceiroSidebarShell({
  expanded,
  onMouseEnter,
  onMouseLeave,
  resellerName,
  panelStatus,
  pathname,
  allSidebarItems,
  firstLetter,
  email,
  onSair,
  badgeCounts,
}: {
  expanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  resellerName: string;
  panelStatus: { title: string; subtitle: string };
  pathname: string;
  allSidebarItems: ParceiroSidebarItem[];
  firstLetter: string;
  email: string;
  onSair: () => void;
  badgeCounts: { pendencias: number; crmLeadsOpen: number };
}) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 hidden h-[100dvh] min-h-0 flex-col overflow-hidden border-r border-[color:var(--honey-line)] bg-[#f3f3f3] shadow-xl transition-[width] duration-300 lg:flex",
        expanded ? "w-72" : "w-16",
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={cn(
          "shrink-0 border-b border-[color:var(--honey-line)]/80 bg-card",
          expanded ? "px-3 py-4" : "px-2 py-3",
        )}
      >
        <div className={cn("flex items-center gap-3", !expanded && "justify-center")}>
          <NorfoodLogo size={expanded ? "md" : "sm"} />
          {expanded ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[color:var(--gestao-ink)]">{resellerName}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Parceiro NorFood</p>
            </div>
          ) : null}
        </div>

        {expanded ? (
          <div className="mt-3 rounded-xl border border-[color:var(--honey-line)] bg-white/90 px-3 py-2">
            <p className="text-[11px] font-semibold text-[color:var(--gestao-ink)]">{panelStatus.title}</p>
            <p className="text-[10px] leading-4 text-muted-foreground">{panelStatus.subtitle}</p>
          </div>
        ) : null}
      </div>

      <ParceiroSidebarNav
        expanded={expanded}
        pathname={pathname}
        allSidebarItems={allSidebarItems}
        badgeCounts={badgeCounts}
      />

      <ParceiroSidebarFooter expanded={expanded} firstLetter={firstLetter} email={email} onSair={onSair} />
    </aside>
  );
}

function ParceiroSidebarNav({
  expanded,
  pathname,
  allSidebarItems,
  onNavigate,
  badgeCounts = { pendencias: 0, crmLeadsOpen: 0 },
}: {
  expanded: boolean;
  pathname: string;
  allSidebarItems: ParceiroSidebarItem[];
  onNavigate?: () => void;
  badgeCounts?: { pendencias: number; crmLeadsOpen: number };
}) {
  return (
    <nav
      className={cn(
        "no-scrollbar min-h-0 flex-1 basis-0 overflow-y-auto overscroll-y-contain py-3",
        expanded ? "px-2" : "px-1",
      )}
    >
      <ParceiroSidebarItemLink
        item={parceiroSidebarHomeItem}
        pathname={pathname}
        allSidebarItems={allSidebarItems}
        expanded={expanded}
        onNavigate={onNavigate}
        badgeCounts={badgeCounts}
      />

      <div className="mt-2 space-y-1">
        {PARCEIRO_SIDEBAR_PRIORITY_ITEMS.map((item) => (
          <ParceiroSidebarItemLink
            key={item.id}
            item={item}
            pathname={pathname}
            allSidebarItems={allSidebarItems}
            expanded={expanded}
            onNavigate={onNavigate}
            badgeCounts={badgeCounts}
          />
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {PARCEIRO_SIDEBAR_SECTIONS.map((section) => (
          <div key={section.id} className="space-y-1">
            <p
              className={cn(
                "px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                expanded ? "block" : "hidden",
              )}
            >
              {section.title}
            </p>
            {section.items.map((item) => (
              <ParceiroSidebarItemLink
                key={item.id}
                item={item}
                pathname={pathname}
                allSidebarItems={allSidebarItems}
                expanded={expanded}
                onNavigate={onNavigate}
                badgeCounts={badgeCounts}
              />
            ))}
          </div>
        ))}
      </div>

      {expanded ? (
        <Link
          to="/parceiro/ajuda"
          onClick={onNavigate}
          className="mx-2 mt-4 block rounded-lg border border-[color:var(--honey-line)] bg-white/80 px-3 py-2 text-center text-[11px] font-medium text-[color:var(--gestao-ink)] hover:bg-white"
        >
          Precisa de ajuda?
        </Link>
      ) : null}

      <div className="h-2 shrink-0" aria-hidden />
    </nav>
  );
}

function ParceiroSidebarItemLink({
  item,
  pathname,
  allSidebarItems,
  expanded,
  onNavigate,
  badgeCounts,
}: {
  item: ParceiroSidebarItem;
  pathname: string;
  allSidebarItems: ParceiroSidebarItem[];
  expanded: boolean;
  onNavigate?: () => void;
  badgeCounts: { pendencias: number; crmLeadsOpen: number };
}) {
  const active = isParceiroSidebarItemActive(pathname, item, allSidebarItems);
  const Icon = item.icon;
  const badge = resolveParceiroSidebarBadge(item, badgeCounts);

  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact }}
      onClick={onNavigate}
      title={!expanded ? item.label : undefined}
      className={cn(
        "relative flex items-center overflow-hidden rounded-lg transition",
        expanded ? "gap-3 px-3 py-2" : "justify-center px-0 py-2.5",
        active
          ? "bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(255,122,0,0.22)]"
          : "text-[color:var(--gestao-ink)]/80 hover:bg-white hover:text-[color:var(--gestao-ink)]",
      )}
    >
      <span className="relative shrink-0">
        <Icon className="size-4" />
        {badge && !expanded ? (
          <span className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-500 ring-2 ring-[#f3f3f3]" />
        ) : null}
      </span>
      {expanded ? (
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-[13px] font-medium">
          {item.label}
          {badge ? (
            <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {badge}
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}

function ParceiroTopBar({
  resellerName,
  level,
  email,
  onSair,
}: {
  resellerName: string;
  level: string;
  email: string;
  onSair: () => void;
}) {
  const location = useLocation();
  const crumbs = getParceiroBreadcrumbs(location.pathname);

  return (
    <div className="hidden border-b border-[color:var(--honey-line)] bg-[#111111] text-white lg:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-full border border-primary/40 bg-primary/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            {level}
          </span>
          <p className="truncate text-sm">
            Olá, <span className="font-semibold">{resellerName}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[180px] truncate text-xs text-white/70 xl:inline">{email}</span>
          <button
            type="button"
            onClick={() => void onSair()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/10"
          >
            <LogOut className="size-3.5" />
            Sair
          </button>
        </div>
      </div>
      {crumbs.length > 1 ? (
        <div className="border-t border-white/10 bg-[#1a1a1a] px-6 py-2">
          <div className="mx-auto flex max-w-7xl items-center gap-1.5 text-xs text-white/60">
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 ? <span className="text-white/30">›</span> : null}
                {c.to && i < crumbs.length - 1 ? (
                  <Link to={c.to} className="hover:text-primary">
                    {c.label}
                  </Link>
                ) : (
                  <span className={i === crumbs.length - 1 ? "font-medium text-white" : undefined}>
                    {c.label}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ParceiroSidebarFooter({
  expanded,
  firstLetter,
  email,
  onSair,
}: {
  expanded: boolean;
  firstLetter: string;
  email: string;
  onSair: () => void;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-[color:var(--honey-line)] bg-card",
        expanded ? "p-3" : "p-2",
      )}
    >
      <div
        className={cn(
          "flex rounded-xl bg-white/90",
          expanded ? "items-center gap-2 px-2 py-2" : "flex-col items-center gap-1 px-1 py-1.5",
        )}
      >
        <div
          className={cn(
            "grid shrink-0 place-items-center rounded-full gradient-sage font-bold text-primary-foreground",
            expanded ? "size-8 text-[10px]" : "size-7 text-[9px]",
          )}
        >
          {firstLetter}
        </div>
        {expanded ? (
          <span className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--gestao-ink)]">{email}</span>
        ) : null}
        <button
          type="button"
          onClick={() => void onSair()}
          title="Sair"
          aria-label="Sair"
          className={cn(
            "grid shrink-0 place-items-center rounded-lg text-[color:var(--gestao-ink)] transition hover:bg-destructive/10 hover:text-destructive",
            expanded ? "size-8" : "size-7",
          )}
        >
          <LogOut className={expanded ? "size-4" : "size-3.5"} />
        </button>
      </div>
    </div>
  );
}

export function ParceiroPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  const crumbs = getParceiroBreadcrumbs(location.pathname);

  return (
    <div>
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-[#6B7280] lg:hidden">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 ? <span>›</span> : null}
            {c.to && i < crumbs.length - 1 ? (
              <Link to={c.to} className="hover:text-primary">
                {c.label}
              </Link>
            ) : (
              <span className={i === crumbs.length - 1 ? "font-medium text-[#111111]" : undefined}>
                {c.label}
              </span>
            )}
          </span>
        ))}
      </nav>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Parceiro NorFood</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-[color:var(--gestao-ink)] sm:text-3xl">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function ParceiroCard({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
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
      {title || description ? (
        <div className="border-b border-[#F0F1F3] px-5 py-4">
          {title ? <h2 className="font-display text-base font-semibold text-[#111111]">{title}</h2> : null}
          {description ? <p className="mt-1 text-sm text-[#6B7280]">{description}</p> : null}
        </div>
      ) : null}
      <div className={title || description ? "p-5" : "p-5"}>{children}</div>
    </section>
  );
}
