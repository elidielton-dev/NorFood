import { lazy, Suspense, type ComponentType } from "react";
import { PainelDashboardPage } from "@/components/painel/painel-dashboard-page";

import { wrapConfigPainelPage } from "@/lib/configuracoes/wrap-config-page";


function painelPageSkeleton() {
  return <div className="animate-pulse rounded-xl bg-[#E5E7EB] p-8" />;
}

function painelPageUnavailable(title: string, blocked = false) {
  return function PainelPageUnavailable() {
    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 text-sm text-[#6B7280]">
        {blocked ? (
          <>
            <p className="font-medium text-[#111111]">Recurso bloqueado pelo navegador</p>
            <p className="mt-2">
              Seu bloqueador de anuncios ou protecao contra rastreadores impediu o carregamento de{" "}
              <strong className="text-[#111111]">{title}</strong>. Desative o bloqueio para este site
              ou adicione uma excecao.
            </p>
          </>
        ) : (
          <>
            Não foi possível carregar <strong className="text-[#111111]">{title}</strong> no modo demo
            local.
          </>
        )}
      </div>
    );
  };
}

function painelPage(
  loader: () => Promise<Record<string, unknown>>,
  title = "esta pagina",
): ComponentType {
  const LazyPage = lazy(async () => {
    try {
      const mod = await loader();
      const route = mod.Route as { options?: { component?: ComponentType } } | undefined;
      const Comp = route?.options?.component;
      if (Comp) return { default: Comp };
    } catch (error) {
      console.warn("[painel] Falha ao carregar rota:", error);
      if (isChunkLoadError(error)) {
        return { default: painelPageUnavailable(title, true) };
      }
    }
    return { default: painelPageUnavailable(title) };
  });

  return function RegistryRoutePage() {
    return (
      <Suspense fallback={painelPageSkeleton()}>
        <LazyPage />
      </Suspense>
    );
  };
}

const configPage = wrapConfigPainelPage;

/** Splat path (após /t/:slug/) → componente do painel (paridade Abelha & Mel) */
export const TENANT_PAINEL_REGISTRY: Record<string, ComponentType> = {
  dashboard: PainelDashboardPage,

  // Pedidos
  kds: painelPage(() => import("@/routes/_authenticated/painel.kds")),
  "gestao-delivery": painelPage(() => import("@/routes/_authenticated/painel.gestao-delivery")),
  cozinha: painelPage(() => import("@/routes/_authenticated/painel.cozinha")),
  pdv: painelPage(() =>
    import("@/components/balcao/balcao-page").then((mod) => ({
      Route: { options: { component: mod.BalcaoPage } },
    })),
  ),
  mesas: painelPage(() => import("@/routes/_authenticated/painel.mesas")),
  delivery: painelPage(() => import("@/routes/_authenticated/painel.delivery"), "Delivery"),

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

  // Configuracoes
  configuracoes: configPage(() => import("@/routes/_authenticated/painel.configuracoes.index")),
  "configuracoes/loja": configPage(() => import("@/routes/_authenticated/painel.configuracoes.loja")),
  "configuracoes/horarios": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.horarios"),
  ),
  "configuracoes/mesas": configPage(() => import("@/routes/_authenticated/painel.configuracoes.mesas")),
  "configuracoes/pagamentos": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.pagamentos"),
  ),
  "configuracoes/delivery": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.delivery"),
  ),
  "configuracoes/equipe": configPage(() => import("@/routes/_authenticated/painel.configuracoes.equipe")),
  "configuracoes/plano": configPage(() => import("@/routes/_authenticated/painel.configuracoes.plano")),
  "configuracoes/operacao": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.operacao"),
  ),
  "configuracoes/impressoras": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.impressoras"),
  ),
  "configuracoes/impressoras/mesas": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.impressoras.mesas"),
  ),
  "configuracoes/impressoras/delivery": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.impressoras.delivery"),
  ),
  "configuracoes/impressoras/kds": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.impressoras.kds"),
  ),
  "configuracoes/impressoras/fiscal": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.impressoras.fiscal"),
  ),
  "configuracoes/integracoes": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.integracoes"),
  ),
  "configuracoes/integracoes/mercado-pago": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.integracoes.mercado-pago"),
  ),
  "configuracoes/integracoes/inter": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.integracoes.inter"),
  ),
  "configuracoes/integracoes/fiscal": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.integracoes.fiscal"),
  ),
  "configuracoes/integracoes/quero-delivery": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.integracoes.quero-delivery"),
  ),
  colaboradores: painelPage(() => import("@/routes/_authenticated/painel.colaboradores")),
  "estabelecimento/horarios": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.horarios"),
  ),
  "estabelecimento/pagamentos": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.pagamentos"),
  ),
  "estabelecimento/plano": configPage(() => import("@/routes/_authenticated/painel.configuracoes.plano")),
  "estabelecimento/visual": configPage(() => import("@/routes/_authenticated/painel.configuracoes.loja")),

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
  "atendimento/configuracoes": configPage(
    () => import("@/routes/_authenticated/painel.atendimento.configuracoes"),
  ),
  atendimento: painelPage(() => import("@/routes/_authenticated/painel.atendimento.conversas")),

  // Financeiro
  "financeiro/mercado-pago": configPage(
    () => import("@/routes/_authenticated/painel.financeiro.mercado-pago"),
  ),
  financeiro: painelPage(() => import("@/routes/_authenticated/painel.financeiro.index")),
  "financeiro/extratos": painelPage(
    () => import("@/routes/_authenticated/painel.financeiro.extratos"),
  ),
  fiscal: painelPage(() => import("@/routes/_authenticated/painel.fiscal.index")),
  "fiscal/configuracoes": configPage(
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
  pedidos: painelPage(() => import("@/routes/_authenticated/painel.gestao-delivery")),
  categorias: painelPage(() => import("@/routes/_authenticated/painel.produtos.categorias")),
  "configuracoes/empresa": configPage(
    () => import("@/routes/_authenticated/painel.configuracoes.operacao"),
  ),
  "configuracoes/usuarios": configPage(() => import("@/routes/_authenticated/painel.configuracoes.equipe")),
  "configuracoes/aparencia": configPage(() => import("@/routes/_authenticated/painel.configuracoes.loja")),
  caixa: painelPage(() => import("@/routes/_authenticated/painel.financeiro.index")),
  fidelidade: painelPage(() => import("@/routes/_authenticated/painel.clientes")),
  entregador: painelPage(() => import("@/routes/_authenticated/painel.delivery"), "Delivery"),
};

export function resolveTenantPainelPage(splat: string | undefined) {
  const path = (splat ?? "dashboard").replace(/^\/+|\/+$/g, "");
  return TENANT_PAINEL_REGISTRY[path] ?? TENANT_PAINEL_REGISTRY.dashboard;
}
