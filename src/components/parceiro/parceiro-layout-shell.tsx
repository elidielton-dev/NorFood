import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LogOut, Menu, Search, X } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { PARCEIRO_SIDEBAR_SECTIONS, isParceiroSidebarItemActive } from "@/lib/parceiro/parceiro-sidebar";
import { fetchResellerDashboard } from "@/lib/reseller/client";

export function ParceiroLayoutShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [email, setEmail] = useState("");

  const { data: dashboard } = useQuery({
    queryKey: ["reseller-dashboard"],
    queryFn: fetchResellerDashboard,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setEmail("demo@norfood.local");
      return;
    }
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const resellerName = dashboard?.reseller.name ?? "Parceiro";
  const licenseLabel = `${dashboard?.stats.total ?? 0} / ${dashboard?.reseller.max_tenants ?? "—"}`;
  const firstLetter = email.charAt(0).toUpperCase() || "P";

  async function sair() {
    if (isSupabaseConfigured()) await supabase.auth.signOut();
    nav({ to: "/login" });
  }

  const sidebarProps = {
    pathname: location.pathname,
    onNavigate: () => setMobileOpen(false),
  };

  return (
    <div className="flex min-h-screen bg-[#F6F7F9] text-foreground">
      <Toaster richColors position="top-right" />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 hidden h-screen flex-col border-r border-[#E5E7EB] bg-white transition-[width] duration-200 lg:flex",
          desktopExpanded ? "w-64" : "w-[4.5rem]",
        )}
      >
        <ParceiroSidebarBrand expanded={desktopExpanded} resellerName={resellerName} licenseLabel={licenseLabel} />
        <ParceiroSidebarNav expanded={desktopExpanded} {...sidebarProps} />
        <ParceiroSidebarFooter expanded={desktopExpanded} firstLetter={firstLetter} email={email} onSair={sair} />
        <button
          type="button"
          onClick={() => setDesktopExpanded((v) => !v)}
          className="absolute -right-3 top-20 grid size-6 place-items-center rounded-full border border-[#E5E7EB] bg-white text-[#6B7280] shadow-sm hover:bg-[#F6F7F9]"
          aria-label={desktopExpanded ? "Recolher menu" : "Expandir menu"}
        >
          {desktopExpanded ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      </aside>

      {mobileOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-[#E5E7EB] bg-white lg:hidden">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
              <NorfoodLogo size="sm" />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            <ParceiroSidebarNav expanded onNavigate={() => setMobileOpen(false)} {...sidebarProps} />
            <ParceiroSidebarFooter expanded firstLetter={firstLetter} email={email} onSair={sair} />
          </aside>
        </>
      ) : null}

      <div className={cn("flex min-w-0 flex-1 flex-col", desktopExpanded ? "lg:pl-64" : "lg:pl-[4.5rem]")}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[#E5E7EB] bg-white/95 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid size-9 place-items-center rounded-lg text-[#111111] hover:bg-[#F6F7F9] lg:hidden"
            aria-label="Menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="hidden min-w-0 flex-1 md:block">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="search"
                placeholder="Buscar restaurantes, tokens, ajuda..."
                className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-[#F6F7F9] pl-9 pr-3 text-sm outline-none focus:border-[#FF9100] focus:ring-2 focus:ring-[#FF9100]/15"
              />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full bg-[#FF9100]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#C45A00] sm:inline">
              Hiperador
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2 py-1">
              <div className="grid size-8 place-items-center rounded-full bg-[#FF9100] text-xs font-semibold text-white">
                {firstLetter}
              </div>
              <span className="hidden max-w-[140px] truncate text-xs text-[#6B7280] sm:inline">{email}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function ParceiroSidebarBrand({
  expanded,
  resellerName,
  licenseLabel,
}: {
  expanded: boolean;
  resellerName: string;
  licenseLabel: string;
}) {
  return (
    <div className={cn("border-b border-[#E5E7EB] p-3", expanded ? "px-4 py-4" : "px-2 py-3")}>
      <div className={cn("flex items-center gap-3", !expanded && "justify-center")}>
        <NorfoodLogo size={expanded ? "md" : "sm"} />
        {expanded ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#111111]">{resellerName}</p>
            <p className="text-[10px] uppercase tracking-wider text-[#6B7280]">NorFood Parceiros</p>
            <p className="mt-1 text-[10px] font-medium text-[#FF9100]">Licenças {licenseLabel}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ParceiroSidebarNav({
  expanded,
  pathname,
  onNavigate,
}: {
  expanded: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      {PARCEIRO_SIDEBAR_SECTIONS.map((section) => (
        <div key={section.id} className="mb-4">
          {expanded ? (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              {section.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isParceiroSidebarItemActive(pathname, item.to);
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    title={!expanded ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                      active
                        ? "bg-[#FF9100]/10 text-[#C45A00]"
                        : "text-[#6B7280] hover:bg-[#F6F7F9] hover:text-[#111111]",
                      !expanded && "justify-center px-2",
                    )}
                  >
                    <Icon className={cn("size-[18px] shrink-0", active && "text-[#FF9100]")} />
                    {expanded ? <span className="truncate">{item.label}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
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
    <div className="border-t border-[#E5E7EB] p-3">
      {expanded ? (
        <div className="mb-2 flex items-center gap-2 px-1">
          <div className="grid size-8 place-items-center rounded-full bg-[#111111] text-xs font-semibold text-white">
            {firstLetter}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-[#111111]">{email || "Conta"}</p>
            <p className="text-[10px] text-[#6B7280]">Owner / Admin</p>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void onSair()}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#6B7280] hover:bg-[#F6F7F9] hover:text-[#111111]",
          !expanded && "justify-center px-2",
        )}
      >
        <LogOut className="size-4" />
        {expanded ? "Sair" : null}
      </button>
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
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#FF9100]">Hiperador</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#111111] sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[#6B7280]">{subtitle}</p> : null}
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
    <section className={cn("rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm", className)}>
      {title ? <h2 className="text-sm font-semibold text-[#111111]">{title}</h2> : null}
      {description ? <p className="mt-1 text-sm text-[#6B7280]">{description}</p> : null}
      <div className={title || description ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}
