import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Home, Settings } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CONFIG_NAV_GROUPS,
  configNavHref,
  getDefaultConfigNavPath,
  resolveConfigNavFromPathname,
  type ConfigNavBadge,
  type ConfigNavGroup,
} from "@/lib/painel-configuracoes-nav";
import { useTenantOptional } from "@/lib/tenant/tenant-context";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { ConfiguracoesLayoutProvider } from "@/components/configuracoes/configuracoes-layout-context";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function NavBadge({ badge }: { badge?: ConfigNavBadge }) {
  if (badge !== "novo") return null;
  return (
    <span className="rounded bg-lime-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-lime-950">
      Novo
    </span>
  );
}

function isNavItemActive(pathname: string, tenantSlug: string, path: string) {
  const href = configNavHref(tenantSlug, path);
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

function ConfigNavGroupSection({
  group,
  tenantSlug,
  pathname,
  collapsed,
  onToggle,
}: {
  group: ConfigNavGroup;
  tenantSlug: string;
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const hasActive = group.items.some((item) => isNavItemActive(pathname, tenantSlug, item.path));

  return (
    <div className="border-b border-[#E8E8E8] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[#4A5568] hover:bg-[#F3F4F6]"
      >
        <span>{group.title}</span>
        {collapsed ? <ChevronDown className="size-3.5 opacity-60" /> : <ChevronUp className="size-3.5 opacity-60" />}
      </button>
      {!collapsed ? (
        <ul className="pb-2">
          {group.items.map((item) => {
            const href = configNavHref(tenantSlug, item.path);
            const active = isNavItemActive(pathname, tenantSlug, item.path);
            return (
              <li key={item.key}>
                <Link
                  to={href}
                  className={cn(
                    "flex items-center justify-between gap-2 px-4 py-2 text-[13px] transition",
                    active
                      ? "bg-[#EDE7F6] font-semibold text-[#5E35B1]"
                      : "text-[#374151] hover:bg-[#F9FAFB]",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  <NavBadge badge={item.badge} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!collapsed && hasActive ? null : null}
    </div>
  );
}

function GroupTabs({
  group,
  tenantSlug,
  pathname,
}: {
  group: ConfigNavGroup;
  tenantSlug: string;
  pathname: string;
}) {
  if (group.items.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-0 border-b border-[#E5E7EB] bg-white px-4">
      {group.items.map((item) => {
        const href = configNavHref(tenantSlug, item.path);
        const active = isNavItemActive(pathname, tenantSlug, item.path);
        return (
          <Link
            key={item.key}
            to={href}
            className={cn(
              "border-b-2 px-4 py-3 text-sm transition",
              active
                ? "border-[#7E57C2] font-semibold text-[#1F2937]"
                : "border-transparent text-[#6B7280] hover:text-[#374151]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function ConfiguracoesShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tenantCtx = useTenantOptional();
  const tenantSlug = tenantCtx?.tenant.slug ?? "norfood";

  const resolved = useMemo(
    () => resolveConfigNavFromPathname(location.pathname),
    [location.pathname],
  );

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const activeGroup = resolved?.group ?? CONFIG_NAV_GROUPS[0]!;
  const activeItem = resolved?.item;
  const pathname = location.pathname;

  const dashboardHref = tenantPath(tenantSlug, "dashboard");
  const configRootHref = configNavHref(tenantSlug, "configuracoes");

  if (location.pathname.endsWith("/configuracoes") || location.pathname.endsWith("/configuracoes/")) {
    const target = configNavHref(tenantSlug, getDefaultConfigNavPath());
    void navigate({ to: target, replace: true });
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-[#7E57C2] border-t-transparent" />
      </div>
    );
  }

  return (
    <ConfiguracoesLayoutProvider>
      <div className="-mx-4 flex min-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm sm:-mx-6 lg:min-h-[calc(100dvh-4rem)] lg:flex-row">
        {/* Sub-sidebar */}
        <aside className="w-full shrink-0 border-b border-[#E5E7EB] bg-[#FAFAFA] lg:w-64 lg:border-b-0 lg:border-r xl:w-72">
          <div className="flex items-center justify-between bg-[#7E57C2] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Settings className="size-4 shrink-0" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em]">Configurações</p>
                <p className="text-[10px] text-white/80">Central da loja</p>
              </div>
            </div>
            <ChevronUp className="size-4 opacity-80" />
          </div>

          <nav className="max-h-[40vh] overflow-y-auto lg:max-h-[calc(100dvh-10rem)]">
            {CONFIG_NAV_GROUPS.map((group) => {
              const collapsed = collapsedGroups[group.key] ?? false;
              return (
                <ConfigNavGroupSection
                  key={group.key}
                  group={group}
                  tenantSlug={tenantSlug}
                  pathname={pathname}
                  collapsed={collapsed}
                  onToggle={() =>
                    setCollapsedGroups((prev) => ({ ...prev, [group.key]: !collapsed }))
                  }
                />
              );
            })}
          </nav>
        </aside>

        {/* Conteúdo */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#F8F9FA]">
          <div className="border-b border-[#E5E7EB] bg-white px-4 py-3 sm:px-6">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={dashboardHref} className="inline-flex items-center gap-1 text-[#2563EB]">
                      <Home className="size-3.5" />
                      Início
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={configRootHref} className="text-[#2563EB]">
                      Configurações
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {activeGroup ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="text-[#6B7280]">{activeGroup.title}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
                {activeItem ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-medium text-[#374151]">
                        {activeItem.label}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <GroupTabs group={activeGroup} tenantSlug={tenantSlug} pathname={pathname} />

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
        </div>
      </div>
    </ConfiguracoesLayoutProvider>
  );
}
