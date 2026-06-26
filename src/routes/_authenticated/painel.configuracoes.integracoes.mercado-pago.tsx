import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracaoIntegracaoDetalhePage } from "./-painel.configuracoes.shared";

export const Route = createFileRoute(
  "/_authenticated/painel/configuracoes/integracoes/mercado-pago",
)({
  component: MercadoPagoConfiguracaoPage,
});

function MercadoPagoConfiguracaoPage() {
  return <ConfiguracaoIntegracaoDetalhePage integrationKey="mercadoPago" />;
}
