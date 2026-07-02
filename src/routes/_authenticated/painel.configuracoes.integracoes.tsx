import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { getIntegrationStatus } from "@/lib/api/integrations.functions";
import { StatusBadge } from "@/components/painel-configuracoes-ui";
import {
  ConfigSection,
  ConfiguracoesPageFrame,
} from "@/components/configuracoes/configuracoes-page-frame";
import { integrationConfigs } from "@/lib/painel-configuracoes";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/integracoes")({
  component: ConfiguracoesIntegracoesPage,
});

function ConfiguracoesIntegracoesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => getIntegrationStatus(),
  });

  return (
    <ConfiguracoesPageFrame
      title="Integrações"
      description="Mercado Pago, Banco Inter, fiscal e canais externos."
    >
      <ConfigSection
        title="Integrações disponíveis"
        description="Conecte serviços de pagamento, banco e emissão fiscal."
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando status...</p>
        ) : (
          <div className="divide-y divide-[#F3F4F6]">
            {integrationConfigs.map((integration) => (
              <Link
                key={integration.key}
                to={integration.route}
                className="flex items-center gap-4 py-4 transition hover:bg-[#FAFAFA] -mx-2 px-2 rounded-lg"
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#F3F4F6]">
                  <integration.icon className="size-5 text-[#6B7280]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[#1F2937]">{integration.titulo}</p>
                    <StatusBadge ativo={integration.isActive(data)} />
                  </div>
                  <p className="mt-0.5 text-sm text-[#6B7280]">{integration.descricao}</p>
                  {integration.details(data).length ? (
                    <p className="mt-1 text-xs text-[#9CA3AF]">
                      {integration.details(data)[0]}
                    </p>
                  ) : null}
                </div>
                <ChevronRight className="size-5 shrink-0 text-[#9CA3AF]" />
              </Link>
            ))}
          </div>
        )}
      </ConfigSection>
    </ConfiguracoesPageFrame>
  );
}
