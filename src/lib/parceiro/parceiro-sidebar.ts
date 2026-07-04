import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Award,
  BarChart3,
  Building2,
  GraduationCap,
  HelpCircle,
  Home,
  KeyRound,
  Megaphone,
  Settings,
  Target,
  Users,
  Wallet,
} from "lucide-react";

export type ParceiroSidebarItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Chave para badge dinâmico (pendencias | crm) */
  badgeKey?: "pendencias" | "crm";
  badge?: string;
};

export type ParceiroSidebarSection = {
  id: string;
  title: string;
  items: ParceiroSidebarItem[];
};

export const parceiroSidebarHomeItem: ParceiroSidebarItem = {
  id: "home",
  label: "Pagina inicial",
  to: "/parceiro",
  icon: Home,
  exact: true,
};

/** Itens prioritários com badge (estilo Hiperador) */
export const PARCEIRO_SIDEBAR_PRIORITY_ITEMS: ParceiroSidebarItem[] = [
  {
    id: "pendencias",
    label: "Pendencias",
    to: "/parceiro/pendencias",
    icon: AlertCircle,
    badgeKey: "pendencias",
  },
  {
    id: "crm",
    label: "CRM",
    to: "/parceiro/crm",
    icon: Target,
    badgeKey: "crm",
  },
];

export const PARCEIRO_SIDEBAR_SECTIONS: ParceiroSidebarSection[] = [
  {
    id: "visao",
    title: "Visao geral",
    items: [{ id: "relatorios", label: "Relatorios", to: "/parceiro/relatorios", icon: BarChart3 }],
  },
  {
    id: "carteira",
    title: "Carteira",
    items: [
      { id: "restaurantes", label: "Restaurantes", to: "/parceiro/restaurantes", icon: Building2 },
      { id: "tokens", label: "Tokens de ativacao", to: "/parceiro/tokens", icon: KeyRound },
    ],
  },
  {
    id: "crescimento",
    title: "Crescimento",
    items: [
      { id: "marketing", label: "Marketing", to: "/parceiro/marketing", icon: Megaphone },
      { id: "academia", label: "Academia", to: "/parceiro/academia", icon: GraduationCap },
      { id: "conquistas", label: "Conquistas", to: "/parceiro/conquistas", icon: Award },
    ],
  },
  {
    id: "operacao",
    title: "Operacao",
    items: [
      { id: "financeiro", label: "Financeiro", to: "/parceiro/financeiro", icon: Wallet },
      { id: "equipe", label: "Equipe", to: "/parceiro/equipe", icon: Users },
    ],
  },
  {
    id: "suporte",
    title: "Suporte",
    items: [
      { id: "ajuda", label: "Central de ajuda", to: "/parceiro/ajuda", icon: HelpCircle },
      { id: "configuracoes", label: "Configuracoes", to: "/parceiro/configuracoes", icon: Settings },
    ],
  },
];

export function getAllParceiroSidebarItems(): ParceiroSidebarItem[] {
  return [
    parceiroSidebarHomeItem,
    ...PARCEIRO_SIDEBAR_PRIORITY_ITEMS,
    ...PARCEIRO_SIDEBAR_SECTIONS.flatMap((s) => s.items),
  ];
}

export function resolveParceiroSidebarBadge(
  item: ParceiroSidebarItem,
  counts: { pendencias: number; crmLeadsOpen: number },
): string | undefined {
  if (item.badgeKey === "pendencias" && counts.pendencias > 0) return String(counts.pendencias);
  if (item.badgeKey === "crm" && counts.crmLeadsOpen > 0) return String(counts.crmLeadsOpen);
  return item.badge;
}

/** Evita marcar item pai quando uma rota filha mais especifica esta ativa. */
export function isParceiroSidebarItemActive(
  pathname: string,
  item: ParceiroSidebarItem,
  allItems: ParceiroSidebarItem[],
) {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const target = item.to.replace(/\/$/, "") || "/";

  if (item.exact) {
    return normalized === target || (target === "/parceiro" && normalized === "/parceiro");
  }
  if (normalized === target) return true;
  if (!normalized.startsWith(`${target}/`)) return false;

  const childMatch = allItems.some(
    (other) =>
      other.to !== item.to &&
      other.to.length > item.to.length &&
      other.to.startsWith(`${target}/`) &&
      (normalized === other.to.replace(/\/$/, "") ||
        normalized.startsWith(`${other.to.replace(/\/$/, "")}/`)),
  );

  return !childMatch;
}
