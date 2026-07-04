/** Labels de breadcrumb por rota do portal parceiro. */
export function getParceiroBreadcrumbs(pathname: string): { label: string; to?: string }[] {
  const normalized = pathname.replace(/\/$/, "") || "/parceiro";
  const crumbs: { label: string; to?: string }[] = [{ label: "Início", to: "/parceiro" }];

  const map: Record<string, string> = {
    "/parceiro/pendencias": "Pendências",
    "/parceiro/crm": "CRM",
    "/parceiro/relatorios": "Relatórios",
    "/parceiro/restaurantes": "Restaurantes",
    "/parceiro/restaurantes/nova": "Novo restaurante",
    "/parceiro/tokens": "Tokens de ativação",
    "/parceiro/marketing": "Marketing",
    "/parceiro/academia": "Academia",
    "/parceiro/conquistas": "Conquistas",
    "/parceiro/financeiro": "Financeiro",
    "/parceiro/equipe": "Equipe",
    "/parceiro/ajuda": "Central de ajuda",
    "/parceiro/configuracoes": "Configurações",
  };

  if (normalized === "/parceiro") return crumbs;

  const label = map[normalized];
  if (label) {
    crumbs.push({ label });
    return crumbs;
  }

  if (normalized.startsWith("/parceiro/restaurantes")) {
    crumbs.push({ label: "Restaurantes", to: "/parceiro/restaurantes" });
    crumbs.push({ label: "Detalhe" });
  }

  return crumbs;
}

export function getParceiroPageTitle(pathname: string): string | null {
  const normalized = pathname.replace(/\/$/, "") || "/parceiro";
  if (normalized === "/parceiro") return null;
  const crumbs = getParceiroBreadcrumbs(pathname);
  return crumbs[crumbs.length - 1]?.label ?? null;
}
