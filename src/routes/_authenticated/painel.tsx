import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { mapLegacyPainelPath } from "@/lib/tenant/painel-routes";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Menu, X } from "lucide-react";
import logo from "@/assets/logo-norfood.png";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { fetchCurrentUserRoles, isStaffRole } from "@/lib/auth-roles";
import { fetchOperationalStatusServer } from "@/lib/api/operational-config.functions";
import {
  getAllSidebarItems,
  isSidebarItemActive,
  sidebarHomeItem,
  sidebarSections,
  type SidebarItem,
} from "@/lib/painel-sidebar";
import { isBrowserDemoEnabled, isProductionMode } from "@/lib/runtime";

export const Route = createFileRoute("/_authenticated/painel")({
  beforeLoad: async ({ location }) => {
    const target = mapLegacyPainelPath(location.pathname);
    if (target) {
      throw redirect({ to: target });
    }
    const roles = await fetchCurrentUserRoles();
    if (!isStaffRole(roles)) {
      throw redirect({ to: "/" });
    }
  },
  component: PainelLayout,
});

function PainelLayout() {
  const nav = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [desktopHover, setDesktopHover] = useState(false);
  const [email, setEmail] = useState("");

  const { data: operacao } = useQuery({
    queryKey: ["sidebar-operacao"],
    queryFn: fetchOperationalStatusServer,
    staleTime: 60_000,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const firstLetter = email.charAt(0).toUpperCase() || "A";
  const expanded = desktopHover;
  const allSidebarItems = useMemo(() => getAllSidebarItems(), []);
  const isAtendimentoInbox = location.pathname.startsWith("/painel/atendimento/conversas");
  const isAtendimento = location.pathname.startsWith("/painel/atendimento");
  const isPdv = location.pathname.startsWith("/painel/pdv");
  const isFullscreenPainel = isAtendimentoInbox || isPdv;

  const lojaStatus = useMemo(() => {
    const aberta = operacao?.loja_aberta ?? true;
    return {
      aberta,
      label: aberta ? "Aberto" : "Fechado",
      hint: aberta ? "Recebendo pedidos agora" : "Ver horarios no painel",
      dotClass: aberta ? "bg-emerald-500" : "bg-rose-500",
    };
  }, [operacao?.loja_aberta]);

  const panelStatus = useMemo(() => {
    if (isBrowserDemoEnabled()) {
      return { title: "Modo demonstracao", subtitle: "Dados locais para testes." };
    }
    if (isProductionMode()) {
      return { title: "Producao · Supabase", subtitle: "Balcao, mesas, delivery e KDS reais." };
    }
    return { title: "Sistema ativo", subtitle: "Painel operacional NorFood." };
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    nav({ to: "/auth" });
  }

  return (
    <div
      className={cn(
        "flex bg-background text-foreground",
        isAtendimentoInbox ? "h-[100dvh] max-h-[100dvh] overflow-hidden" : isPdv ? "h-[100dvh] max-h-[100dvh] overflow-hidden" : "min-h-screen",
      )}
    >
      <Toaster richColors position="top-right" />

      <SidebarShell
        expanded={expanded}
        onMouseEnter={() => setDesktopHover(true)}
        onMouseLeave={() => setDesktopHover(false)}
        lojaStatus={lojaStatus}
        panelStatus={panelStatus}
        pathname={location.pathname}
        allSidebarItems={allSidebarItems}
        firstLetter={firstLetter}
        email={email}
        onSair={sair}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-[100dvh] min-h-0 w-[min(100vw-3rem,20rem)] transform flex-col overflow-hidden border-r border-[color:var(--honey-line)] bg-card transition-transform duration-300 lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--honey-line)] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="NorFood" className="h-11 w-auto max-w-[10rem] object-contain" />
            <div className="min-w-0">
              <p className="font-display text-lg leading-tight text-[color:var(--gestao-ink)]">
                NorFood
              </p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Sistema de Delivery
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-[color:var(--gestao-ink)] transition hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <SidebarNav
          expanded
          pathname={location.pathname}
          allSidebarItems={allSidebarItems}
          onNavigate={() => setOpen(false)}
        />

        <SidebarFooter expanded firstLetter={firstLetter} email={email} onSair={sair} />
      </aside>

      {open ? (
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
      ) : null}

      <main
        className={cn(
          "min-w-0 flex-1 bg-panel-muted lg:pl-16",
          isAtendimentoInbox &&
            "flex h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] flex-col overflow-hidden lg:h-[100dvh] lg:max-h-[100dvh]",
          isPdv &&
            "flex h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] flex-col overflow-hidden lg:h-[100dvh] lg:max-h-[100dvh]",
        )}
      >
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--honey-line)] bg-card/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Menu"
            className="grid size-11 shrink-0 place-items-center rounded-lg text-[color:var(--gestao-ink)] transition hover:bg-muted"
          >
            <Menu className="size-5" />
          </button>
          <img src={logo} alt="NorFood" className="h-8 w-auto max-w-[7rem] object-contain" />
          <span className="font-display text-lg">NorFood</span>
        </header>
        <div
          className={cn(
            isFullscreenPainel
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : isAtendimento
                ? "mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8"
                : "mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8",
          )}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SidebarShell({
  expanded,
  onMouseEnter,
  onMouseLeave,
  lojaStatus,
  panelStatus,
  pathname,
  allSidebarItems,
  firstLetter,
  email,
  onSair,
}: {
  expanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  lojaStatus: { aberta: boolean; label: string; hint: string; dotClass: string };
  panelStatus: { title: string; subtitle: string };
  pathname: string;
  allSidebarItems: SidebarItem[];
  firstLetter: string;
  email: string;
  onSair: () => void;
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
          "shrink-0 border-b border-[color:var(--honey-line)]/80 bg-card py-4",
          expanded ? "px-3" : "px-2 py-3",
        )}
      >
        <div className={cn("flex items-center gap-3", !expanded && "justify-center")}>
          <img
            src={logo}
            alt="NorFood"
            className={cn(
              "shrink-0 object-contain",
              expanded ? "h-11 w-auto max-w-[10rem] object-contain" : "h-9 w-auto max-w-[2.5rem] object-contain",
            )}
          />
          <div
            className={cn(
              "min-w-0 flex-1 transition-opacity duration-200",
              expanded ? "opacity-100" : "pointer-events-none w-0 opacity-0",
            )}
          >
            <p className="truncate text-sm font-bold text-[color:var(--gestao-ink)]">NorFood</p>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className={cn("size-2 rounded-full", lojaStatus.dotClass)} />
              <span className={lojaStatus.aberta ? "text-emerald-700" : "text-rose-700"}>
                {lojaStatus.label}
              </span>
              <span className="truncate">{lojaStatus.hint}</span>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "mt-3 rounded-xl border border-[color:var(--honey-line)] bg-white/90 px-3 py-2 transition-all duration-200",
            expanded ? "opacity-100" : "hidden opacity-0",
          )}
        >
          <p className="text-[11px] font-semibold text-[color:var(--gestao-ink)]">
            {panelStatus.title}
          </p>
          <p className="text-[10px] leading-4 text-muted-foreground">{panelStatus.subtitle}</p>
        </div>
      </div>

      <SidebarNav expanded={expanded} pathname={pathname} allSidebarItems={allSidebarItems} />

      <SidebarFooter expanded={expanded} firstLetter={firstLetter} email={email} onSair={onSair} />
    </aside>
  );
}

function SidebarNav({
  expanded,
  pathname,
  allSidebarItems,
  onNavigate,
}: {
  expanded: boolean;
  pathname: string;
  allSidebarItems: SidebarItem[];
  onNavigate?: () => void;
}) {
  return (
    <nav
      className={cn(
        "no-scrollbar min-h-0 flex-1 basis-0 overflow-y-auto overscroll-y-contain py-3",
        expanded ? "px-2" : "px-1",
      )}
    >
      <SidebarItemLink
        item={sidebarHomeItem}
        pathname={pathname}
        allSidebarItems={allSidebarItems}
        expanded={expanded}
        onNavigate={onNavigate}
      />

      <div className="mt-4 space-y-4">
        {sidebarSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <p
              className={cn(
                "px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground",
                expanded ? "opacity-100" : "sr-only",
              )}
            >
              {section.title}
            </p>
            {section.items.map((item) => (
              <SidebarItemLink
                key={`${section.title}-${item.label}-${item.to}`}
                item={item}
                pathname={pathname}
                allSidebarItems={allSidebarItems}
                expanded={expanded}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="h-2 shrink-0" aria-hidden />
    </nav>
  );
}

function SidebarItemLink({
  item,
  pathname,
  allSidebarItems,
  expanded,
  onNavigate,
}: {
  item: SidebarItem;
  pathname: string;
  allSidebarItems: SidebarItem[];
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const active = isSidebarItemActive(pathname, item, allSidebarItems);

  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact }}
      onClick={onNavigate}
      title={!expanded ? item.label : undefined}
      className={cn(
        "flex items-center rounded-lg transition",
        expanded ? "gap-3 px-3 py-2" : "justify-center px-0 py-2",
        active
          ? "bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(255,122,0,0.22)]"
          : "text-[color:var(--gestao-ink)]/80 hover:bg-white hover:text-[color:var(--gestao-ink)]",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      <span
        className={cn(
          "truncate text-[13px] font-medium transition-opacity duration-200",
          expanded ? "opacity-100" : "pointer-events-none w-0 opacity-0",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

function SidebarFooter({
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
          "flex items-center rounded-xl bg-white/90",
          expanded ? "gap-2 px-2 py-2" : "justify-center gap-1.5 px-1 py-1.5",
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
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px] text-[color:var(--gestao-ink)] transition-opacity duration-200",
            expanded ? "opacity-100" : "pointer-events-none hidden w-0 opacity-0",
          )}
        >
          {email}
        </span>
        <button
          type="button"
          onClick={onSair}
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
