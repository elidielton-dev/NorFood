import {
  Banknote,
  Bike,
  ChefHat,
  ClipboardList,
  FileText,
  History,
  Home,
  LayoutList,
  MessageCircle,
  MessageSquare,
  Package,
  PackageCheck,
  PackageX,
  Settings2,
  ShoppingCart,
  Ticket,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type SidebarItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

export type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

export const sidebarHomeItem: SidebarItem = {
  to: "/painel",
  label: "Pagina inicial",
  icon: Home,
  exact: true,
};

export const sidebarSections: SidebarSection[] = [
  {
    title: "Pedidos",
    items: [
      { to: "/painel/kds", label: "Gestor delivery", icon: ClipboardList },
      { to: "/painel/pdv", label: "Balcao", icon: ShoppingCart },
      { to: "/painel/mesas", label: "Mesas", icon: ChefHat },
      { to: "/painel/delivery", label: "Entregadores", icon: Bike },
    ],
  },
  {
    title: "Produtos",
    items: [
      { to: "/painel/produtos", label: "Catalogo", icon: Package, exact: true },
      { to: "/painel/produtos/sincronizados", label: "Sincronizados", icon: PackageCheck },
      { to: "/painel/produtos/nao-sincronizados", label: "Pendentes", icon: PackageX },
      { to: "/painel/produtos/categorias", label: "Categorias e listas", icon: LayoutList },
      { to: "/painel/cupons", label: "Cupons", icon: Ticket },
    ],
  },
  {
    title: "Configuracoes",
    items: [
      { to: "/painel/configuracoes", label: "Configuracoes", icon: Settings2 },
    ],
  },
  {
    title: "Atendimento",
    items: [
      { to: "/painel/atendimento/conversas", label: "Conversas", icon: MessageSquare },
      { to: "/painel/atendimento/contatos", label: "Contatos", icon: Users },
      { to: "/painel/atendimento/automacoes", label: "Automacoes", icon: Zap },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { to: "/painel/financeiro", label: "Fluxo de caixa", icon: Wallet, exact: true },
      { to: "/painel/financeiro/extratos", label: "Extratos", icon: FileText },
      { to: "/painel/fiscal", label: "Fiscal e notas", icon: FileText, exact: true },
      { to: "/painel/financeiro/saques", label: "Repasses MP", icon: Banknote },
    ],
  },
  {
    title: "Desempenho",
    items: [
      { to: "/painel/relatorios/vendas", label: "Historico de pedidos", icon: History },
      { to: "/painel/relatorios/produtos", label: "Produtos e categorias", icon: TrendingUp },
      { to: "/painel/relatorios/delivery", label: "Delivery", icon: Truck },
      { to: "/painel/relatorios/operacao", label: "Operacao", icon: ChefHat },
      { to: "/painel/relatorios/estoque", label: "Estoque", icon: Package },
      { to: "/painel/relatorios/crm", label: "CRM", icon: MessageCircle },
      { to: "/painel/clientes", label: "Clientes", icon: Users },
    ],
  },
];

export function getAllSidebarItems(): SidebarItem[] {
  return [sidebarHomeItem, ...sidebarSections.flatMap((section) => section.items)];
}

/** Evita marcar item pai quando uma rota filha mais especifica esta ativa. */
export function isSidebarItemActive(pathname: string, item: SidebarItem, allItems: SidebarItem[]) {
  if (item.exact) return pathname === item.to;
  if (pathname === item.to) return true;
  if (!pathname.startsWith(`${item.to}/`)) return false;

  const childMatch = allItems.some(
    (other) =>
      other.to !== item.to &&
      other.to.length > item.to.length &&
      other.to.startsWith(`${item.to}/`) &&
      (pathname === other.to || pathname.startsWith(`${other.to}/`)),
  );

  return !childMatch;
}
