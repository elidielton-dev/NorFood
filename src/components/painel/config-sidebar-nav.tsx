import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CONFIG_NAV_GROUPS,
  configNavHref,
  getDefaultConfigNavPath,
  isConfigAreaPathname,
  type ConfigNavBadge,
} from "@/lib/painel-configuracoes-nav";
import { canAccessRouteForPlan } from "@/lib/platform/plan-features";
import type { BillingPlanId } from "@/lib/platform/billing-plans";
import { canAccessTenantRoute } from "@/lib/tenant/tenant-permissions";
import type { TenantRole } from "@/lib/tenant/types";

function NavBadge({ badge }: { badge?: ConfigNavBadge }) {
  if (badge !== "novo") return null;
  return (
    <span className="rounded bg-lime-300 px-1 py-0.5 text-[8px] font-bold uppercase text-lime-950">
      Novo
    </span>
  );
}

function isConfigItemActive(pathname: string, tenantSlug: string, path: string) {
  const href = configNavHref(tenantSlug, path);
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

function canAccessConfigItem(role: TenantRole, path: string, planId?: BillingPlanId) {
  const segment = path.split("/")[0] ?? "configuracoes";
  if (!canAccessTenantRoute(role, segment)) return false;
  if (!planId) return true;
  return canAccessRouteForPlan(path, planId);
}

type ConfigSidebarNavProps = {
  tenantSlug: string;
  pathname: string;
  expanded: boolean;
  userRole?: TenantRole;
  planId?: BillingPlanId;
  onNavigate?: () => void;
};

export function ConfigSidebarNav({
  tenantSlug,
  pathname,
  expanded,
  userRole,
  planId,
  onNavigate,
}: ConfigSidebarNavProps) {
  const onConfigArea = isConfigAreaPathname(pathname);
  const [open, setOpen] = useState(onConfigArea);

  useEffect(() => {
    if (onConfigArea) setOpen(true);
  }, [onConfigArea]);

  const groups = useMemo(() => {
    if (!userRole) return CONFIG_NAV_GROUPS;
    return CONFIG_NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessConfigItem(userRole, item.path, planId)),
    })).filter((group) => group.items.length > 0);
  }, [userRole, planId]);

  if (userRole && !canAccessTenantRoute(userRole, "configuracoes")) {
    return null;
  }

  if (!groups.length) return null;

  const defaultHref = configNavHref(tenantSlug, getDefaultConfigNavPath());

  if (!expanded) {
    return (
      <div className="mb-2 mt-2">
        <Link
          to={defaultHref}
          onClick={onNavigate}
          title="Configurações"
          className={cn(
            "mx-2 flex items-center justify-center rounded-lg py-2.5 transition",
            onConfigArea
              ? "bg-[var(--tenant-primary,#FF7A00)]/10 text-[var(--tenant-primary,#FF7A00)]"
              : "text-[#6B7280] hover:bg-[#F6F7F9] hover:text-[#111111]",
          )}
        >
          <Settings2 className="size-4 shrink-0" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-4 mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "mx-2 flex w-[calc(100%-1rem)] items-center justify-between rounded-lg px-3 py-2.5 text-left transition",
          onConfigArea
            ? "bg-[#7E57C2] text-white"
            : "bg-[#F3F4F6] text-[#374151] hover:bg-[#EDE7F6]",
        )}
      >
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em]">
          <Settings2 className="size-3.5 shrink-0" />
          Configurações
        </span>
        {open ? <ChevronUp className="size-3.5 opacity-80" /> : <ChevronDown className="size-3.5 opacity-80" />}
      </button>

      {open ? (
        <div className="mx-2 mt-1 overflow-hidden rounded-lg border border-[#E5E7EB] bg-[#FAFAFA]">
          {groups.map((group) => (
            <div key={group.key} className="border-b border-[#EEEEEE] last:border-b-0">
              <p className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#6B7280]">
                {group.title}
              </p>
              <ul className="pb-1.5">
                {group.items.map((item) => {
                  const href = configNavHref(tenantSlug, item.path);
                  const active = isConfigItemActive(pathname, tenantSlug, item.path);
                  return (
                    <li key={item.key}>
                      <Link
                        to={href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center justify-between gap-2 py-1.5 pl-5 pr-3 text-[12px] transition",
                          active
                            ? "bg-[#EDE7F6] font-semibold text-[#5E35B1]"
                            : "text-[#4B5563] hover:bg-white hover:text-[#111111]",
                        )}
                      >
                        <span className="truncate">{item.label}</span>
                        <NavBadge badge={item.badge} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
