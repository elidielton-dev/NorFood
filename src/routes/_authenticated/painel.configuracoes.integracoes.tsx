import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getIntegrationStatus } from "@/lib/api/integrations.functions";
import { StatusBadge } from "@/components/painel-configuracoes-ui";
import { GestaoInteractiveCard, GestaoPage } from "@/components/gestao-ui";
import { ConfigPageBack } from "@/components/config-hub-ui";
import { integrationConfigs } from "@/lib/painel-configuracoes";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/integracoes")({
  component: ConfiguracoesIntegracoesPage,
});

function ConfiguracoesIntegracoesPage() {
  const { data } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => getIntegrationStatus(),
  });

  return (
    <GestaoPage
      title="Integracoes"
      subtitle="Mercado Pago, Banco Inter, fiscal e canais externos."
      actions={<ConfigPageBack />}
    >
      <section className="grid gap-4 xl:grid-cols-2">
        {integrationConfigs.map((integration) => (
          <Link key={integration.key} to={integration.route} className="block">
            <GestaoInteractiveCard>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-xl bg-muted">
                    <integration.icon className="size-5 text-sage" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl text-[color:var(--gestao-ink)] sm:text-2xl">
                      {integration.titulo}
                    </h2>
                    <p className="text-sm text-muted-foreground">{integration.descricao}</p>
                  </div>
                </div>
                <StatusBadge ativo={integration.isActive(data)} />
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                {integration.details(data).map((detail) => (
                  <p key={detail}>{detail}</p>
                ))}
              </div>
            </GestaoInteractiveCard>
          </Link>
        ))}
      </section>
    </GestaoPage>
  );
}
