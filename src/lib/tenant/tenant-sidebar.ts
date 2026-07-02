import {
  Banknote,
  Bike,
  Boxes,
  ChefHat,
  ClipboardList,
  FileText,
  History,
  Home,
  LayoutList,
  MessageCircle,
  Package,
  PackageCheck,
  PackageX,
  Receipt,
  MessageSquare,
  ShoppingCart,
  Ticket,
  Utensils,
  Wallet,
  Zap,
  Users,
  TrendingUp,
  Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { canAccessTenantRoute } from "@/lib/tenant/tenant-permissions";
import {
  canAccessRouteForPlan,
  planFeatureForRoute,
  type PlanFeatureKey,
} from "@/lib/platform/plan-features";
import type { BillingPlanId } from "@/lib/platform/billing-plans";
import type { TenantRole } from "@/lib/tenant/types";

export type SidebarItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Segmento para permissões (primeiro nível do path) */
  segment: string;
};

export type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

function item(
  tenantSlug: string,
  segment: string,
  label: string,
  icon: LucideIcon,
  exact?: boolean,
): SidebarItem {
  const permissionSegment = segment.split("/")[0] ?? segment;
  return {
    to: tenantPath(tenantSlug, segment),
    segment: permissionSegment,
    label,
    icon,
    exact,
  };
}

/** Equivalente ao sidebarHomeItem do Abelha & Mel — Página inicial */
export function getTenantSidebarHomeItem(tenantSlug: string): SidebarItem {
  return {
    to: tenantPath(tenantSlug, "dashboard"),
    segment: "dashboard",
    label: "Pagina inicial",
    icon: Home,
    exact: true,
  };
}

function filterSidebarItems(
  items: SidebarItem[],
  role: TenantRole,
  planId?: BillingPlanId,
) {
  return items.filter((entry) => {
    if (!canAccessTenantRoute(role, entry.segment)) return false;
    if (!planId) return true;
    const match = entry.to.match(/\/t\/[^/]+\/(.+)$/);
    const routePath = match?.[1] ?? entry.segment;
    return canAccessRouteForPlan(routePath, planId);
  });
}

/**
 * Mesma estrutura e sequência do painel Abelha & Mel (painel-sidebar.ts),
 * com rotas em /t/:tenantSlug/*
 */
export function getTenantSidebarSections(
  tenantSlug: string,
  role?: TenantRole,
  planId?: BillingPlanId,
): SidebarSection[] {
  const sections: SidebarSection[] = [
    {
      title: "Pedidos",
      items: [
        item(tenantSlug, "gestao-delivery", "Gestao delivery", ClipboardList),
        item(tenantSlug, "cozinha", "KDS Cozinha", ChefHat),
        item(tenantSlug, "pdv", "Balcao", ShoppingCart),
        item(tenantSlug, "mesas", "Mesas", Utensils),
        item(tenantSlug, "delivery", "Entregadores", Bike),
      ],
    },
    {
      title: "Produtos",
      items: [
        item(tenantSlug, "produtos", "Catalogo", Package, true),
        item(tenantSlug, "produtos/sincronizados", "Sincronizados", PackageCheck),
        item(tenantSlug, "produtos/nao-sincronizados", "Pendentes", PackageX),
        item(tenantSlug, "produtos/categorias", "Categorias e listas", LayoutList),
        item(tenantSlug, "cupons", "Cupons", Ticket),
      ],
    },
    {
      title: "Atendimento",
      items: [
        item(tenantSlug, "atendimento/conversas", "Conversas", MessageSquare),
        item(tenantSlug, "atendimento/contatos", "Contatos", Users),
        item(tenantSlug, "atendimento/automacoes", "Automacoes", Zap),
      ],
    },
    {
      title: "Financeiro",
      items: [
        item(tenantSlug, "financeiro", "Fluxo de caixa", Wallet, true),
        item(tenantSlug, "financeiro/extratos", "Extratos", FileText),
        item(tenantSlug, "fiscal", "Fiscal e notas", Receipt, true),
        item(tenantSlug, "financeiro/saques", "Repasses MP", Banknote),
      ],
    },
    {
      title: "Desempenho",
      items: [
        item(tenantSlug, "relatorios/vendas", "Historico de pedidos", History),
        item(tenantSlug, "relatorios/produtos", "Produtos e categorias", TrendingUp),
        item(tenantSlug, "relatorios/delivery", "Delivery", Truck),
        item(tenantSlug, "relatorios/operacao", "Operacao", ChefHat),
        item(tenantSlug, "relatorios/estoque", "Estoque", Boxes),
        item(tenantSlug, "relatorios/crm", "CRM", MessageCircle),
        item(tenantSlug, "clientes", "Clientes", Users),
      ],
    },
  ];

  if (!role) return sections;

  return sections
    .map((section) => ({
      ...section,
      items: filterSidebarItems(section.items, role, planId),
    }))
    .filter((section) => section.items.length > 0);
}

export function getAllTenantSidebarItems(
  tenantSlug: string,
  role?: TenantRole,
  planId?: BillingPlanId,
) {
  return [
    getTenantSidebarHomeItem(tenantSlug),
    ...getTenantSidebarSections(tenantSlug, role, planId).flatMap((s) => s.items),
  ];
}

/** Segmento exige feature de plano superior? (para badges/tooltips) */
export function sidebarItemPlanFeature(segment: string): PlanFeatureKey | null {
  return planFeatureForRoute(segment);
}

/** Evita marcar item pai quando uma rota filha mais especifica esta ativa. */
export function isTenantSidebarItemActive(
  pathname: string,
  item: SidebarItem,
  allItems?: SidebarItem[],
) {
  if (item.exact) return pathname === item.to;
  if (pathname === item.to) return true;
  if (!pathname.startsWith(`${item.to}/`)) return false;

  if (!allItems?.length) return true;

  const childMatch = allItems.some(
    (other) =>
      other.to !== item.to &&
      other.to.length > item.to.length &&
      other.to.startsWith(`${item.to}/`) &&
      (pathname === other.to || pathname.startsWith(`${other.to}/`)),
  );

  return !childMatch;
}

// Re-export legado
export {
  sidebarSections,
  sidebarHomeItem,
  getAllSidebarItems,
  isSidebarItemActive,
} from "@/lib/painel-sidebar";
