import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracaoIntegracaoDetalhePage } from "./-painel.configuracoes.shared";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/integracoes/inter")({
  component: InterConfiguracaoPage,
});

function InterConfiguracaoPage() {
  return <ConfiguracaoIntegracaoDetalhePage integrationKey="inter" />;
}
