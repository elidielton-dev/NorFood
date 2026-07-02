import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { TenantOperationalGate } from "@/components/tenant/tenant-operational-gate";
import { TenantPlanGate } from "@/components/tenant/tenant-plan-gate";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Bell, Building2, ChevronDown, LogOut, Menu, Search, X } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { fetchOperationalStatusServer } from "@/lib/api/operational-config.functions";
import { getTenantPlanFeaturesServer } from "@/lib/api/platform-billing.functions";
import { fetchUserTenantsServer } from "@/lib/api/tenant.functions";
import { useTenant } from "@/lib/tenant/tenant-context";
import { TenantBrandLogo } from "@/components/brand/norfood-logo";
import { getTenantInitials } from "@/lib/tenant/tenant-branding";
import {
  getAllTenantSidebarItems,
  getTenantSidebarHomeItem,
  getTenantSidebarSections,
  isTenantSidebarItemActive,
} from "@/lib/tenant/tenant-sidebar";
import { isBrowserDemoEnabled } from "@/lib/runtime";
import type { TenantRole } from "@/lib/tenant/types";
import type { BillingPlanId } from "@/lib/platform/billing-plans";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { ConfigSidebarNav } from "@/components/painel/config-sidebar-nav";

type PainelShellProps = {
  tenantSlug: string;
  userRole?: TenantRole;
};

export function PainelShell({ tenantSlug, userRole }: PainelShellProps) {
  const nav = useNavigate();
  const location = useLocation();
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [email, setEmail] = useState("");

  const { data: planFeatures } = useQuery({
    queryKey: ["tenant-plan-features", tenantSlug],
    queryFn: () => getTenantPlanFeaturesServer({ data: tenantSlug }),
    staleTime: 60_000,
    retry: 1,
  });

  const sections = useMemo(
    () => getTenantSidebarSections(tenantSlug, userRole, planFeatures?.planId),
    [tenantSlug, userRole, planFeatures?.planId],
  );

  const allSidebarItems = useMemo(
    () => getAllTenantSidebarItems(tenantSlug, userRole, planFeatures?.planId),
    [tenantSlug, userRole, planFeatures?.planId],
  );

  const homeItem = useMemo(() => getTenantSidebarHomeItem(tenantSlug), [tenantSlug]);

  const { data: operacao } = useQuery({
    queryKey: ["sidebar-operacao", tenantSlug],
    queryFn: () => fetchOperationalStatusServer({ data: tenantSlug }),
    staleTime: 60_000,
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["user-tenants"],
    queryFn: () => fetchUserTenantsServer(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setEmail("demo@norfood.local");
      return;
    }
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const lojaStatus = useMemo(() => {
    const aberta = operacao?.loja_aberta ?? true;
    return {
      aberta,
      label: aberta ? "Aberto" : "Fechado",
      dotClass: aberta ? "bg-emerald-500" : "bg-rose-500",
    };
  }, [operacao?.loja_aberta]);

  const firstLetter = email.charAt(0).toUpperCase() || getTenantInitials(tenant.name).charAt(0);
  const isAtendimentoInbox =
    location.pathname.includes("/atendimento") &&
    !location.pathname.includes("/atendimento/configuracoes");
  const isPlanoPage = location.pathname.includes("/estabelecimento/plano");

  async function sair() {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    nav({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen bg-[#F6F7F9] text-foreground">
      <Toaster richColors position="top-right" />

      <DesktopSidebar
        expanded={desktopExpanded}
        onMouseEnter={() => setDesktopExpanded(true)}
        onMouseLeave={() => setDesktopExpanded(false)}
        tenant={tenant}
        tenantSlug={tenantSlug}
        userRole={userRole}
        planId={planFeatures?.planId}
        lojaStatus={lojaStatus}
        homeItem={homeItem}
        allItems={allSidebarItems}
        sections={sections}
        pathname={location.pathname}
        firstLetter={firstLetter}
        email={email}
        onSair={sair}
      />

      <MobileSidebar
        open={open}
        onClose={() => setOpen(false)}
        tenant={tenant}
        tenantSlug={tenantSlug}
        userRole={userRole}
        planId={planFeatures?.planId}
        homeItem={homeItem}
        allItems={allSidebarItems}
        sections={sections}
        pathname={location.pathname}
        firstLetter={firstLetter}
        email={email}
        onSair={sair}
      />

      {open ? (
        <div onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[4.5rem]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[#E5E7EB] bg-white px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-lg text-[#111111] hover:bg-[#F6F7F9] lg:hidden"
            aria-label="Menu"
          >
            <Menu className="size-5" />
          </button>

          <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B7280]" />
              <input
                type="search"
                placeholder="Buscar pedidos, clientes, produtos..."
                className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-[#F6F7F9] pl-9 pr-3 text-sm outline-none focus:border-[var(--tenant-primary,#FF7A00)] focus:ring-2 focus:ring-[var(--tenant-primary,#FF7A00)]/15"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {memberships.length > 1 ? (
              <TenantSwitcher memberships={memberships} currentSlug={tenantSlug} />
            ) : (
              <div className="hidden items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#6B7280] sm:flex">
                <Building2 className="size-3.5" />
                {tenant.name}
              </div>
            )}

            <button
              type="button"
              className="grid size-9 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F6F7F9]"
              aria-label="Notificações"
            >
              <Bell className="size-4" />
            </button>

            <div className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2 py-1">
              <div
                className="grid size-8 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: tenant.primary_color }}
              >
                {firstLetter}
              </div>
              <span className="hidden max-w-[140px] truncate text-xs text-[#6B7280] sm:inline">
                {email}
              </span>
            </div>
          </div>
        </header>

        <main className={cn("flex-1", isAtendimentoInbox ? "overflow-hidden" : "overflow-auto")}>
          <div
            className={cn(
              "mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8",
              isAtendimentoInbox && "max-w-none p-0",
            )}
          >
            {isBrowserDemoEnabled() ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Modo demonstração — dados locais para testes.
              </div>
            ) : null}
            <TenantOperationalGate mode="painel" allowWhenBlocked={isPlanoPage}>
              <TenantPlanGate tenantSlug={tenantSlug}>
                <Outlet />
              </TenantPlanGate>
            </TenantOperationalGate>
          </div>
        </main>
      </div>
    </div>
  );
}

function TenantSwitcher({
  memberships,
  currentSlug,
}: {
  memberships: Array<{ tenant: { slug: string; name: string } }>;
  currentSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const current = memberships.find((m) => m.tenant.slug === currentSlug);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#F6F7F9]"
      >
        <Building2 className="size-3.5 text-[#6B7280]" />
        <span className="max-w-[120px] truncate">{current?.tenant.name ?? "Empresa"}</span>
        <ChevronDown className="size-3.5 text-[#6B7280]" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg">
            {memberships.map((m) => (
              <Link
                key={m.tenant.slug}
                to={tenantPath(m.tenant.slug, "dashboard")}
                onClick={() => setOpen(false)}
                className={cn(
                  "block px-3 py-2 text-sm hover:bg-[#F6F7F9]",
                  m.tenant.slug === currentSlug && "font-semibold text-[var(--tenant-primary)]",
                )}
              >
                {m.tenant.name}
              </Link>
            ))}
            <Link
              to="/selecionar-empresa"
              onClick={() => setOpen(false)}
              className="block border-t border-[#E5E7EB] px-3 py-2 text-sm text-[#6B7280] hover:bg-[#F6F7F9]"
            >
              Todas as empresas
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DesktopSidebar({
  expanded,
  onMouseEnter,
  onMouseLeave,
  tenant,
  tenantSlug,
  userRole,
  planId,
  lojaStatus,
  homeItem,
  allItems,
  sections,
  pathname,
  firstLetter,
  email,
  onSair,
}: {
  expanded: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  tenant: { name: string; subtitle: string | null; primary_color: string; logo_url: string | null };
  tenantSlug: string;
  userRole?: TenantRole;
  planId?: BillingPlanId;
  lojaStatus: { aberta: boolean; label: string; dotClass: string };
  homeItem: ReturnType<typeof getTenantSidebarHomeItem>;
  allItems: ReturnType<typeof getAllTenantSidebarItems>;
  sections: ReturnType<typeof getTenantSidebarSections>;
  pathname: string;
  firstLetter: string;
  email: string;
  onSair: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 hidden h-screen flex-col border-r border-[#E5E7EB] bg-white transition-[width] duration-200 lg:flex",
        expanded ? "w-64" : "w-[4.5rem]",
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={cn("border-b border-[#E5E7EB] p-3", expanded ? "px-4 py-4" : "px-2 py-3")}>
        <div className={cn("flex items-center gap-3", !expanded && "justify-center")}>
          <TenantBrandLogo
            logoUrl={tenant.logo_url}
            name={tenant.name}
            primaryColor={tenant.primary_color}
            size={expanded ? "md" : "sm"}
            expanded={expanded}
          />
          {expanded ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#111111]">{tenant.name}</p>
              <p className="truncate text-[10px] uppercase tracking-wider text-[#6B7280]">
                {tenant.subtitle ?? "Painel"}
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#6B7280]">
                <span className={cn("size-1.5 rounded-full", lojaStatus.dotClass)} />
                {lojaStatus.label}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <SidebarNav
        expanded={expanded}
        tenantSlug={tenantSlug}
        userRole={userRole}
        planId={planId}
        homeItem={homeItem}
        allItems={allItems}
        sections={sections}
        pathname={pathname}
      />
      <SidebarFooter
        expanded={expanded}
        firstLetter={firstLetter}
        email={email}
        onSair={onSair}
        color={tenant.primary_color}
      />
    </aside>
  );
}

function MobileSidebar({
  open,
  onClose,
  tenant,
  tenantSlug,
  userRole,
  planId,
  homeItem,
  allItems,
  sections,
  pathname,
  firstLetter,
  email,
  onSair,
}: {
  open: boolean;
  onClose: () => void;
  tenant: { name: string; subtitle: string | null; primary_color: string; logo_url: string | null };
  tenantSlug: string;
  userRole?: TenantRole;
  planId?: BillingPlanId;
  homeItem: ReturnType<typeof getTenantSidebarHomeItem>;
  allItems: ReturnType<typeof getAllTenantSidebarItems>;
  sections: ReturnType<typeof getTenantSidebarSections>;
  pathname: string;
  firstLetter: string;
  email: string;
  onSair: () => void;
}) {
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 flex h-screen w-[min(100vw-3rem,18rem)] flex-col border-r border-[#E5E7EB] bg-white transition-transform lg:hidden",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex items-center justify-between border-b border-[#E5E7EB] p-4">
        <div className="flex items-center gap-3">
          <TenantBrandLogo
            logoUrl={tenant.logo_url}
            name={tenant.name}
            primaryColor={tenant.primary_color}
            size="md"
            expanded
          />
          <div>
            <p className="text-sm font-semibold">{tenant.name}</p>
            <p className="text-[10px] uppercase tracking-wider text-[#6B7280]">
              {tenant.subtitle ?? "Painel"}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar">
          <X className="size-5" />
        </button>
      </div>
      <SidebarNav
        expanded
        tenantSlug={tenantSlug}
        userRole={userRole}
        planId={planId}
        homeItem={homeItem}
        allItems={allItems}
        sections={sections}
        pathname={pathname}
        onNavigate={onClose}
      />
      <SidebarFooter
        expanded
        firstLetter={firstLetter}
        email={email}
        onSair={onSair}
        color={tenant.primary_color}
      />
    </aside>
  );
}

function SidebarNav({
  expanded,
  tenantSlug,
  userRole,
  planId,
  homeItem,
  allItems,
  sections,
  pathname,
  onNavigate,
}: {
  expanded: boolean;
  tenantSlug: string;
  userRole?: TenantRole;
  planId?: BillingPlanId;
  homeItem: ReturnType<typeof getTenantSidebarHomeItem>;
  allItems: ReturnType<typeof getAllTenantSidebarItems>;
  sections: ReturnType<typeof getTenantSidebarSections>;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto py-3">
      <SidebarItemLink
        item={homeItem}
        pathname={pathname}
        allItems={allItems}
        expanded={expanded}
        onNavigate={onNavigate}
      />

      {sections.map((section) => (
        <div key={section.title}>
          <div className="mb-4 mt-4">
            {expanded ? (
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-wider text-[#6B7280]">
                {section.title}
              </p>
            ) : null}
            {section.items.map((item) => (
              <SidebarItemLink
                key={item.to}
                item={item}
                pathname={pathname}
                allItems={allItems}
                expanded={expanded}
                onNavigate={onNavigate}
              />
            ))}
          </div>
          {section.title === "Produtos" ? (
            <ConfigSidebarNav
              tenantSlug={tenantSlug}
              pathname={pathname}
              expanded={expanded}
              userRole={userRole}
              planId={planId}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      ))}
    </nav>
  );
}

function SidebarItemLink({
  item,
  pathname,
  allItems,
  expanded,
  onNavigate,
}: {
  item: (typeof allItems)[number];
  pathname: string;
  allItems: ReturnType<typeof getAllTenantSidebarItems>;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const active = isTenantSidebarItemActive(pathname, item, allItems);

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      title={!expanded ? item.label : undefined}
      className={cn(
        "mx-2 flex items-center rounded-lg transition",
        expanded ? "gap-3 px-3 py-2" : "justify-center px-0 py-2.5",
        active
          ? "bg-[var(--tenant-primary,#FF7A00)]/10 font-medium text-[var(--tenant-primary,#FF7A00)]"
          : "text-[#6B7280] hover:bg-[#F6F7F9] hover:text-[#111111]",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      {expanded ? <span className="truncate text-sm">{item.label}</span> : null}
    </Link>
  );
}

function SidebarFooter({
  expanded,
  firstLetter,
  email,
  onSair,
  color,
}: {
  expanded: boolean;
  firstLetter: string;
  email: string;
  onSair: () => void;
  color: string;
}) {
  return (
    <div className="border-t border-[#E5E7EB] p-3">
      <div className={cn("flex items-center", expanded ? "gap-2" : "justify-center")}>
        <div
          className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: color }}
        >
          {firstLetter}
        </div>
        {expanded ? (
          <span className="min-w-0 flex-1 truncate text-xs text-[#6B7280]">{email}</span>
        ) : null}
        <button
          type="button"
          onClick={onSair}
          title="Sair"
          className="grid size-8 place-items-center rounded-lg text-[#6B7280] hover:bg-rose-50 hover:text-rose-600"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}
