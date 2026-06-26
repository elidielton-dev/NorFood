import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracaoImpressoraDetalhePage } from "./-painel.configuracoes.shared";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/impressoras/delivery")({
  component: DeliveryPrinterPage,
});

function DeliveryPrinterPage() {
  return <ConfiguracaoImpressoraDetalhePage panelKey="delivery" />;
}
