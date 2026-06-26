import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { CreditCard, Printer } from "lucide-react";
import { StatusBadge } from "@/components/painel-configuracoes-ui";
import {
  GestaoCard,
  GestaoInteractiveCard,
  GestaoPage,
  GestaoSectionTitle,
} from "@/components/gestao-ui";
import { integrationConfigs, printerPanels } from "@/lib/painel-configuracoes";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/")({
  component: ConfiguracoesIndexPage,
});

function ConfiguracoesIndexPage() {
  return (
    <GestaoPage
      title="Configuracoes"
      subtitle="Impressoras, integracoes e ajustes tecnicos da operacao."
    >
      <div className="space-y-4 sm:space-y-6">
        <section className="grid gap-4 xl:grid-cols-2">
          <OverviewGroup
            title="Impressoras"
            description="Cada painel com sua propria rota de configuracao."
            icon={<Printer className="size-5" />}
            items={printerPanels.map((panel) => ({
              key: panel.key,
              title: panel.titulo,
              description: panel.descricao,
              to: panel.route,
              active: panel.autoPrint,
            }))}
          />
          <OverviewGroup
            title="Integracoes"
            description="Cada integracao com tela propria para leitura e revisao."
            icon={<CreditCard className="size-5" />}
            items={integrationConfigs.map((integration) => ({
              key: integration.key,
              title: integration.titulo,
              description: integration.descricao,
              to: integration.route,
              active: true,
            }))}
          />
        </section>
      </div>
    </GestaoPage>
  );
}

function OverviewGroup({
  title,
  description,
  icon,
  items,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  items: Array<{
    key: string;
    title: string;
    description: string;
    to: string;
    active: boolean;
  }>;
}) {
  return (
    <GestaoCard>
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-sage text-primary-foreground sm:size-12 sm:rounded-2xl">
          {icon}
        </div>
        <GestaoSectionTitle title={title} description={description} />
      </div>

      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <Link key={item.key} to={item.to} className="block">
            <GestaoInteractiveCard className="flex items-start justify-between gap-3 bg-[linear-gradient(145deg,#fffefb,#f8f2e8)]">
              <div className="min-w-0">
                <p className="font-display text-lg text-[color:var(--gestao-ink)] sm:text-xl">
                  {item.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
              <StatusBadge ativo={item.active} ativoLabel="Rota pronta" />
            </GestaoInteractiveCard>
          </Link>
        ))}
      </div>
    </GestaoCard>
  );
}
