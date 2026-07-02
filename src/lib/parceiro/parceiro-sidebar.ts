import type { LucideIcon } from "lucide-react";
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  GraduationCap,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

export type ParceiroSidebarItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
};

export type ParceiroSidebarSection = {
  id: string;
  label: string;
  items: ParceiroSidebarItem[];
};

export const PARCEIRO_SIDEBAR_SECTIONS: ParceiroSidebarSection[] = [
  {
    id: "visao",
    label: "Visão geral",
    items: [
      { id: "dashboard", label: "Início", to: "/parceiro", icon: LayoutDashboard },
      { id: "relatorios", label: "Relatórios", to: "/parceiro/relatorios", icon: BarChart3 },
    ],
  },
  {
    id: "carteira",
    label: "Carteira",
    items: [
      { id: "restaurantes", label: "Restaurantes", to: "/parceiro/restaurantes", icon: Building2 },
      { id: "tokens", label: "Tokens", to: "/parceiro/tokens", icon: KeyRound },
    ],
  },
  {
    id: "crescimento",
    label: "Crescimento",
    items: [
      { id: "marketing", label: "Marketing", to: "/parceiro/marketing", icon: Megaphone },
      { id: "academia", label: "Academia", to: "/parceiro/academia", icon: GraduationCap },
      { id: "conquistas", label: "Conquistas", to: "/parceiro/conquistas", icon: Award },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    items: [
      { id: "financeiro", label: "Financeiro", to: "/parceiro/financeiro", icon: Wallet },
      { id: "equipe", label: "Equipe", to: "/parceiro/equipe", icon: Users },
    ],
  },
  {
    id: "suporte",
    label: "Suporte",
    items: [
      { id: "ajuda", label: "Central de ajuda", to: "/parceiro/ajuda", icon: HelpCircle },
      { id: "configuracoes", label: "Configurações", to: "/parceiro/configuracoes", icon: Settings },
    ],
  },
];

export function getAllParceiroSidebarItems() {
  return PARCEIRO_SIDEBAR_SECTIONS.flatMap((s) => s.items);
}

export function isParceiroSidebarItemActive(pathname: string, itemTo: string) {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const target = itemTo.replace(/\/$/, "") || "/";
  if (target === "/parceiro") {
    return normalized === "/parceiro" || normalized === "/parceiro/";
  }
  return normalized === target || normalized.startsWith(`${target}/`);
}
