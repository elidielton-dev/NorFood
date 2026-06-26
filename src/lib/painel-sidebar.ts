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
      { to: "/painel/mesas", label: "Mesas", icon: Utensils },
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
    title: "Estabelecimento",
    items: [
      { to: "/painel/estabelecimento/horarios", label: "Horarios", icon: Clock },
      { to: "/painel/configuracoes/operacao", label: "Operacao da loja", icon: Store },
      {
        to: "/painel/estabelecimento/pagamentos",
        label: "Meios de pagamento",
        icon: CreditCard,
      },
      { to: "/painel/colaboradores", label: "Colaboradores", icon: UserCog },
      { to: "/painel/estabelecimento/visual", label: "Visual e descricao", icon: Palette },
      {
        to: "/painel/configuracoes/impressoras",
        label: "Impressao",
        icon: Printer,
        exact: true,
      },
      {
        to: "/painel/configuracoes/integracoes",
        label: "Integracoes",
        icon: Settings2,
        exact: true,
      },
    ],
  },
  {
    title: "Atendimento",
    items: [
      { to: "/painel/atendimento/conversas", label: "Conversas", icon: MessageSquare },
      { to: "/painel/atendimento/contatos", label: "Contatos", icon: Users },
      { to: "/painel/atendimento/automacoes", label: "Automacoes", icon: Zap },
      { to: "/painel/atendimento/configuracoes", label: "Configuracoes", icon: Headphones },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { to: "/painel/financeiro/mercado-pago", label: "Conta Mercado Pago", icon: Landmark },
      { to: "/painel/financeiro", label: "Fluxo de caixa", icon: Wallet, exact: true },
      { to: "/painel/financeiro/extratos", label: "Extratos", icon: FileText },
      { to: "/painel/fiscal", label: "Fiscal e notas", icon: Receipt, exact: true },
      { to: "/painel/fiscal/configuracoes", label: "Config. fiscal", icon: FileText },
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
      { to: "/painel/relatorios/estoque", label: "Estoque", icon: Boxes },
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
