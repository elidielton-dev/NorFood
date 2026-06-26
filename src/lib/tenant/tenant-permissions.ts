import type { TenantRole } from "@/lib/tenant/types";

const STAFF_ROLES: TenantRole[] = [
  "owner",
  "admin",
  "gerente",
  "atendente",
  "cozinha",
  "entregador",
  "financeiro",
];

const MANAGEMENT_ROLES: TenantRole[] = ["owner", "admin", "gerente"];

export function isTenantStaffRole(role: TenantRole) {
  return STAFF_ROLES.includes(role);
}

export function isTenantManagementRole(role: TenantRole) {
  return MANAGEMENT_ROLES.includes(role);
}

/** Segmento da rota interna (após /t/:slug/) */
const ROUTE_ACCESS: Record<string, TenantRole[]> = {
  dashboard: STAFF_ROLES,
  kds: ["owner", "admin", "gerente", "cozinha", "atendente"],
  pdv: ["owner", "admin", "gerente", "atendente"],
  mesas: ["owner", "admin", "gerente", "atendente"],
  pedidos: ["owner", "admin", "gerente", "atendente"],
  cozinha: ["owner", "admin", "gerente", "cozinha"],
  delivery: ["owner", "admin", "gerente", "atendente", "entregador"],
  produtos: ["owner", "admin", "gerente"],
  categorias: ["owner", "admin", "gerente"],
  cupons: ["owner", "admin", "gerente"],
  clientes: ["owner", "admin", "gerente", "atendente"],
  colaboradores: MANAGEMENT_ROLES,
  estabelecimento: MANAGEMENT_ROLES,
  configuracoes: MANAGEMENT_ROLES,
  atendimento: ["owner", "admin", "gerente", "atendente"],
  financeiro: ["owner", "admin", "gerente", "financeiro"],
  fiscal: ["owner", "admin", "gerente", "financeiro"],
  relatorios: ["owner", "admin", "gerente", "financeiro"],
  entregadores: ["owner", "admin", "gerente"],
  caixa: ["owner", "admin", "gerente", "financeiro"],
  fidelidade: ["owner", "admin", "gerente"],
};

function firstSegment(path: string) {
  const clean = path.replace(/^\/+/, "").split("/")[0] ?? "";
  return clean || "dashboard";
}

export function canAccessTenantRoute(role: TenantRole, path: string) {
  if (role === "owner" || role === "admin") return true;
  const segment = firstSegment(path);
  const allowed = ROUTE_ACCESS[segment];
  if (!allowed) return isTenantStaffRole(role);
  return allowed.includes(role);
}

export function getRoleLabel(role: TenantRole) {
  const labels: Record<TenantRole, string> = {
    owner: "Proprietário",
    admin: "Administrador",
    gerente: "Gerente",
    atendente: "Atendente",
    cozinha: "Cozinha",
    entregador: "Entregador",
    financeiro: "Financeiro",
    cliente: "Cliente",
  };
  return labels[role];
}
