import {
  Banknote,
  Bike,
  Boxes,
  ChefHat,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  History,
  Home,
  Landmark,
  LayoutList,
  MessageCircle,
  Package,
  PackageCheck,
  PackageX,
  Palette,
  Printer,
  Receipt,
  Headphones,
  MessageSquare,
  Settings2,
  ShoppingCart,
  Store,
  Ticket,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Utensils,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { tenantPath } from "@/lib/tenant/painel-routes";
import { canAccessTenantRoute } from "@/lib/tenant/tenant-permissions";
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

/**
 * Mesma estrutura e sequência do painel Abelha & Mel (painel-sidebar.ts),
 * com rotas em /t/:tenantSlug/*
 */
export function getTenantSidebarSections(tenantSlug: string, role?: TenantRole): SidebarSection[] {
  const sections: SidebarSection[] = [
    {
      title: "Pedidos",
      items: [
        item(tenantSlug, "kds", "Gestor delivery", ClipboardList),
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
      title: "Estabelecimento",
      items: [
        item(tenantSlug, "estabelecimento/horarios", "Horarios", Clock),
        item(tenantSlug, "configuracoes/operacao", "Operacao da loja", Store),
        item(tenantSlug, "estabelecimento/pagamentos", "Meios de pagamento", CreditCard),
        item(tenantSlug, "colaboradores", "Colaboradores", UserCog),
        item(tenantSlug, "estabelecimento/visual", "Visual e descricao", Palette),
        item(tenantSlug, "configuracoes/impressoras", "Impressao", Printer, true),
        item(tenantSlug, "configuracoes/integracoes", "Integracoes", Settings2, true),
      ],
    },
    {
      title: "Atendimento",
      items: [
        item(tenantSlug, "atendimento/conversas", "Conversas", MessageSquare),
        item(tenantSlug, "atendimento/contatos", "Contatos", Users),
        item(tenantSlug, "atendimento/automacoes", "Automacoes", Zap),
        item(tenantSlug, "atendimento/configuracoes", "Configuracoes", Headphones),
      ],
    },
    {
      title: "Financeiro",
      items: [
        item(tenantSlug, "financeiro/mercado-pago", "Conta Mercado Pago", Landmark),
        item(tenantSlug, "financeiro", "Fluxo de caixa", Wallet, true),
        item(tenantSlug, "financeiro/extratos", "Extratos", FileText),
        item(tenantSlug, "fiscal", "Fiscal e notas", Receipt, true),
        item(tenantSlug, "fiscal/configuracoes", "Config. fiscal", FileText),
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
      items: section.items.filter((entry) => canAccessTenantRoute(role, entry.segment)),
    }))
    .filter((section) => section.items.length > 0);
}

export function getAllTenantSidebarItems(tenantSlug: string, role?: TenantRole) {
  return [
    getTenantSidebarHomeItem(tenantSlug),
    ...getTenantSidebarSections(tenantSlug, role).flatMap((s) => s.items),
  ];
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
