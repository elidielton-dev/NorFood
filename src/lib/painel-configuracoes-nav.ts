import type { LucideIcon } from "lucide-react";
import { mapLegacyPainelPath, tenantPath } from "@/lib/tenant/painel-routes";

export type ConfigNavBadge = "novo";

export type ConfigNavItem = {
  key: string;
  label: string;
  /** Segmento após /t/:slug/ */
  path: string;
  badge?: ConfigNavBadge;
};

export type ConfigNavGroup = {
  key: string;
  title: string;
  items: ConfigNavItem[];
};

export const CONFIG_NAV_GROUPS: ConfigNavGroup[] = [
  {
    key: "empresa",
    title: "Empresa",
    items: [
      { key: "loja", label: "Dados e aparência", path: "configuracoes/loja" },
      { key: "horarios", label: "Horários de funcionamento", path: "configuracoes/horarios" },
      { key: "operacao", label: "Operação da loja", path: "configuracoes/operacao" },
      { key: "equipe", label: "Colaboradores", path: "configuracoes/equipe" },
      { key: "plano", label: "Plano Norfood", path: "configuracoes/plano", badge: "novo" },
    ],
  },
  {
    key: "salao",
    title: "Salão",
    items: [
      { key: "mesas", label: "Mesas do salão", path: "configuracoes/mesas" },
      { key: "impressoras-mesas", label: "Impressora do salão", path: "configuracoes/impressoras/mesas" },
    ],
  },
  {
    key: "delivery",
    title: "Delivery",
    items: [
      { key: "delivery", label: "Configurações de delivery", path: "configuracoes/delivery" },
      {
        key: "impressoras-delivery",
        label: "Impressora expedição",
        path: "configuracoes/impressoras/delivery",
      },
    ],
  },
  {
    key: "pagamentos",
    title: "Pagamentos",
    items: [
      { key: "pagamentos", label: "Meios de pagamento", path: "configuracoes/pagamentos" },
      { key: "integracoes", label: "Integrações", path: "configuracoes/integracoes" },
      { key: "mp", label: "Conta Mercado Pago", path: "financeiro/mercado-pago" },
      { key: "whatsapp", label: "WhatsApp / atendimento", path: "atendimento/configuracoes" },
    ],
  },
  {
    key: "fiscal",
    title: "Fiscal",
    items: [
      { key: "fiscal-cfg", label: "Configuração fiscal", path: "fiscal/configuracoes" },
      { key: "impressoras", label: "Impressoras", path: "configuracoes/impressoras" },
      { key: "impressoras-kds", label: "Impressora KDS", path: "configuracoes/impressoras/kds" },
      { key: "impressoras-fiscal", label: "Impressora fiscal", path: "configuracoes/impressoras/fiscal" },
    ],
  },
];

const ALL_ITEMS = CONFIG_NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group })),
).sort((a, b) => b.path.length - a.path.length);

export function configNavHref(tenantSlug: string, path: string) {
  return tenantPath(tenantSlug, path);
}

export function resolveConfigNavFromPathname(pathname: string) {
  const tenantMatch = pathname.match(/\/t\/([^/]+)\/(.+)$/);
  if (tenantMatch) {
    const splat = tenantMatch[2]!.replace(/\/+$/, "");
    const item = ALL_ITEMS.find(
      (entry) => entry.path === splat || splat.startsWith(`${entry.path}/`),
    );
    if (item) {
      return {
        tenantSlug: tenantMatch[1]!,
        splat,
        item,
        group: item.group,
      };
    }
    if (splat === "configuracoes" || splat.startsWith("configuracoes/")) {
      return { tenantSlug: tenantMatch[1]!, splat, item: null, group: CONFIG_NAV_GROUPS[0]! };
    }
    return { tenantSlug: tenantMatch[1]!, splat, item: null, group: null };
  }

  if (pathname.startsWith("/painel/")) {
    const legacy = mapLegacyPainelPath(pathname) ?? pathname;
    return resolveConfigNavFromPathname(legacy);
  }

  return null;
}

/** Rota pertence à área de configurações (sidebar + shell de conteúdo). */
export function isConfigAreaPathname(pathname: string) {
  const resolved = resolveConfigNavFromPathname(pathname);
  if (!resolved) return false;
  return Boolean(resolved.item);
}

export function findConfigNavItem(path: string) {
  return ALL_ITEMS.find((entry) => entry.path === path) ?? null;
}

export function getDefaultConfigNavPath() {
  return CONFIG_NAV_GROUPS[0]!.items[0]!.path;
}

/** Hub vazio `/t/:slug/configuracoes` (sem subpágina). */
export function isConfigHubIndexPathname(pathname: string, tenantSlug: string) {
  const hub = configNavHref(tenantSlug, "configuracoes");
  return pathname === hub || pathname === `${hub}/`;
}
