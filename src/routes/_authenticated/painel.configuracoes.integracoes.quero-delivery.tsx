import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracaoIntegracaoDetalhePage } from "./-painel.configuracoes.shared";

export const Route = createFileRoute(
  "/_authenticated/painel/configuracoes/integracoes/quero-delivery",
)({
  component: QueroDeliveryIntegracaoPage,
});

function QueroDeliveryIntegracaoPage() {
  return <ConfiguracaoIntegracaoDetalhePage integrationKey="queroDelivery" />;
}
