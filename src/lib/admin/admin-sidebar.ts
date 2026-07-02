import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  Plus,
  Server,
  Settings,
  Shield,
  Tags,
  Users,
  Wallet,
} from "lucide-react";

export type AdminSidebarItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  badge?: string;
};

export type AdminSidebarSection = {
  id: string;
  label: string;
  items: AdminSidebarItem[];
};

export const ADMIN_SIDEBAR_SECTIONS: AdminSidebarSection[] = [
  {
    id: "visao",
    label: "Visão geral",
    items: [
      { id: "dashboard", label: "Dashboard", to: "/admin", icon: LayoutDashboard },
      { id: "metricas", label: "Métricas", to: "/admin/metricas", icon: BarChart3 },
      { id: "alertas", label: "Alertas", to: "/admin/alertas", icon: AlertTriangle },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    items: [
      { id: "empresas", label: "Empresas", to: "/admin/empresas", icon: Building2 },
      { id: "nova", label: "Nova empresa", to: "/admin/nova", icon: Plus },
      { id: "revendedoras", label: "Revendedoras", to: "/admin/revendedoras", icon: Users },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    items: [
      { id: "faturamento", label: "Faturamento", to: "/admin/faturamento", icon: Wallet },
      {
        id: "faturamento-rev",
        label: "Faturas parceiros",
        to: "/admin/faturamento/revendedoras",
        icon: CreditCard,
      },
      { id: "planos", label: "Planos e preços", to: "/admin/planos", icon: Tags },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [
      { id: "sistema", label: "Capacidade VPS", to: "/admin/sistema", icon: Server },
      { id: "acessos", label: "Acessos admin", to: "/admin/acessos", icon: Shield },
      { id: "configuracoes", label: "Configurações", to: "/admin/configuracoes", icon: Settings },
    ],
  },
];

export function isAdminSidebarItemActive(pathname: string, itemTo: string) {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const target = itemTo.replace(/\/$/, "") || "/";

  if (target === "/admin") {
    return normalized === "/admin";
  }

  if (target === "/admin/empresas") {
    if (normalized === "/admin/empresas" || normalized === "/admin/nova") return true;
    if (/^\/admin\/[0-9a-f-]{36}$/i.test(normalized)) return true;
    return false;
  }

  return normalized === target || normalized.startsWith(`${target}/`);
}

export function getAdminBreadcrumb(pathname: string): string {
  const normalized = pathname.replace(/\/$/, "") || "/";
  const item = ADMIN_SIDEBAR_SECTIONS.flatMap((s) => s.items).find((i) =>
    isAdminSidebarItemActive(normalized, i.to),
  );
  if (item) return item.label;
  if (normalized.match(/^\/admin\/[^/]+$/)) return "Empresa";
  return "Admin";
}
