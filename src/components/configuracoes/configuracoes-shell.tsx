import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/shared/utils";
import {
  CONFIG_NAV_GROUPS,
  configNavHref,
  getDefaultConfigNavPath,
  isConfigHubIndexPathname,
  resolveConfigNavFromPathname,
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

function isNavItemActive(pathname: string, tenantSlug: string, path: string) {
  const href = configNavHref(tenantSlug, path);
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

function GroupTabs({
  group,
  tenantSlug,
  pathname,
}: {
  group: (typeof CONFIG_NAV_GROUPS)[number];
  tenantSlug: string;
  pathname: string;
}) {
  if (group.items.length < 2) return null;

  return (
    <div className="flex flex-wrap gap-0 border-b border-[#E5E7EB] bg-white">
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
                ? "border-[var(--tenant-primary,#FF7A00)] font-semibold text-[#1F2937]"
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

  const activeGroup = resolved?.group ?? CONFIG_NAV_GROUPS[0]!;
  const activeItem = resolved?.item;
  const pathname = location.pathname;

  const dashboardHref = tenantPath(tenantSlug, "dashboard");
  const configRootHref = configNavHref(tenantSlug, getDefaultConfigNavPath());

  if (isConfigHubIndexPathname(location.pathname, tenantSlug)) {
    const target = configNavHref(tenantSlug, getDefaultConfigNavPath());
    void navigate({ to: target, replace: true });
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-[var(--tenant-primary,#FF7A00)] border-t-transparent" />
      </div>
    );
  }

  return (
    <ConfiguracoesLayoutProvider>
      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
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

        <div className="bg-[#F8F9FA] p-4 sm:p-6">{children}</div>
      </div>
    </ConfiguracoesLayoutProvider>
  );
}
