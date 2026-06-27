import { lazy, Suspense, type ComponentType } from "react";
import { PainelDashboardPage } from "@/components/painel/painel-dashboard-page";

function painelPageSkeleton() {
  return <div className="animate-pulse rounded-xl bg-[#E5E7EB] p-8" />;
}

function painelPageUnavailable(title: string) {
  return function PainelPageUnavailable() {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 text-sm text-[#6B7280]">
        Não foi possível carregar <strong className="text-[#111111]">{title}</strong> no modo demo
        local.
      </div>
    );
  };
}

function painelPage(loader: () => Promise<Record<string, unknown>>): ComponentType {
  const LazyPage = lazy(async () => {
    try {
      const mod = await loader();
      const route = mod.Route as { options?: { component?: ComponentType } } | undefined;
      const Comp = route?.options?.component;
      if (Comp) return { default: Comp };
    } catch (error) {
      console.warn("[painel] Falha ao carregar rota:", error);
    }
    return { default: painelPageUnavailable("pagina") };
  });

  return function RegistryRoutePage() {
    return (
      <Suspense fallback={painelPageSkeleton()}>
        <LazyPage />
      </Suspense>
    );
  };
}

/** Splat path (após /t/:slug/) → componente do painel (paridade Abelha & Mel) */
export const TENANT_PAINEL_REGISTRY: Record<string, ComponentType> = {
  dashboard: PainelDashboardPage,

  // Pedidos
  kds: painelPage(() => import("@/routes/_authenticated/painel.kds")),
  pdv: painelPage(() => import("@/routes/_authenticated/painel.pdv")),
  mesas: painelPage(() => import("@/routes/_authenticated/painel.mesas")),
  delivery: painelPage(() => import("@/routes/_authenticated/painel.delivery")),

  // Produtos
  produtos: painelPage(() => import("@/routes/_authenticated/painel.produtos")),
  "produtos/sincronizados": painelPage(
    () => import("@/routes/_authenticated/painel.produtos.sincronizados"),
  ),
  "produtos/nao-sincronizados": painelPage(
    () => import("@/routes/_authenticated/painel.produtos.nao-sincronizados"),
  ),
  "produtos/categorias": painelPage(
    () => import("@/routes/_authenticated/painel.produtos.categorias"),
  ),
  cupons: painelPage(() => import("@/routes/_authenticated/painel.cupons")),

  // Estabelecimento
  "estabelecimento/horarios": painelPage(
    () => import("@/routes/_authenticated/painel.estabelecimento.horarios"),
  ),
  "configuracoes/operacao": painelPage(
    () => import("@/routes/_authenticated/painel.configuracoes.operacao"),
  ),
  "estabelecimento/pagamentos": painelPage(
    () => import("@/routes/_authenticated/painel.estabelecimento.pagamentos"),
  ),
  "estabelecimento/plano": painelPage(
    () => import("@/routes/_authenticated/painel.estabelecimento.plano"),
  ),
  colaboradores: painelPage(() => import("@/routes/_authenticated/painel.colaboradores")),
  "estabelecimento/visual": painelPage(
    () => import("@/routes/_authenticated/painel.estabelecimento.visual"),
  ),
  "configuracoes/impressoras": painelPage(
    () => import("@/routes/_authenticated/painel.configuracoes.impressoras"),
  ),
  "configuracoes/integracoes": painelPage(
    () => import("@/routes/_authenticated/painel.configuracoes.integracoes"),
  ),

  // Atendimento
  "atendimento/conversas": painelPage(
    () => import("@/routes/_authenticated/painel.atendimento.conversas"),
  ),
  "atendimento/contatos": painelPage(
    () => import("@/routes/_authenticated/painel.atendimento.contatos"),
  ),
  "atendimento/automacoes": painelPage(
    () => import("@/routes/_authenticated/painel.atendimento.automacoes"),
  ),
  "atendimento/configuracoes": painelPage(
    () => import("@/routes/_authenticated/painel.atendimento.configuracoes"),
  ),
  atendimento: painelPage(() => import("@/routes/_authenticated/painel.atendimento.conversas")),

  // Financeiro
  "financeiro/mercado-pago": painelPage(
    () => import("@/routes/_authenticated/painel.financeiro.mercado-pago"),
  ),
  financeiro: painelPage(() => import("@/routes/_authenticated/painel.financeiro.index")),
  "financeiro/extratos": painelPage(
    () => import("@/routes/_authenticated/painel.financeiro.extratos"),
  ),
  fiscal: painelPage(() => import("@/routes/_authenticated/painel.fiscal.index")),
  "fiscal/configuracoes": painelPage(
    () => import("@/routes/_authenticated/painel.fiscal.configuracoes"),
  ),
  "financeiro/saques": painelPage(() => import("@/routes/_authenticated/painel.financeiro.saques")),

  // Desempenho
  "relatorios/vendas": painelPage(() => import("@/routes/_authenticated/painel.relatorios.vendas")),
  "relatorios/produtos": painelPage(
    () => import("@/routes/_authenticated/painel.relatorios.produtos"),
  ),
  "relatorios/delivery": painelPage(
    () => import("@/routes/_authenticated/painel.relatorios.delivery"),
  ),
  "relatorios/operacao": painelPage(
    () => import("@/routes/_authenticated/painel.relatorios.operacao"),
  ),
  "relatorios/estoque": painelPage(
    () => import("@/routes/_authenticated/painel.relatorios.estoque"),
  ),
  "relatorios/crm": painelPage(() => import("@/routes/_authenticated/painel.relatorios.crm")),
  clientes: painelPage(() => import("@/routes/_authenticated/painel.clientes")),
  relatorios: painelPage(() => import("@/routes/_authenticated/painel.relatorios.vendas")),

  // Aliases legados
  cozinha: painelPage(() => import("@/routes/_authenticated/painel.kds")),
  pedidos: painelPage(() => import("@/routes/_authenticated/painel.kds")),
  categorias: painelPage(() => import("@/routes/_authenticated/painel.produtos.categorias")),
  configuracoes: painelPage(() => import("@/routes/_authenticated/painel.configuracoes.integracoes")),
  "configuracoes/empresa": painelPage(
    () => import("@/routes/_authenticated/painel.configuracoes.operacao"),
  ),
  "configuracoes/usuarios": painelPage(() => import("@/routes/_authenticated/painel.colaboradores")),
  "configuracoes/aparencia": painelPage(
    () => import("@/routes/_authenticated/painel.estabelecimento.visual"),
  ),
  "configuracoes/pagamentos": painelPage(
    () => import("@/routes/_authenticated/painel.estabelecimento.pagamentos"),
  ),
  caixa: painelPage(() => import("@/routes/_authenticated/painel.financeiro.index")),
  fidelidade: painelPage(() => import("@/routes/_authenticated/painel.clientes")),
  entregador: painelPage(() => import("@/routes/_authenticated/painel.delivery")),
};

export function resolveTenantPainelPage(splat: string | undefined) {
  const path = (splat ?? "dashboard").replace(/^\/+|\/+$/g, "");
  return TENANT_PAINEL_REGISTRY[path] ?? TENANT_PAINEL_REGISTRY.dashboard;
}
