import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracaoImpressoraDetalhePage } from "./-painel.configuracoes.shared";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/impressoras/mesas")({
  component: MesasPrinterPage,
});

function MesasPrinterPage() {
  return <ConfiguracaoImpressoraDetalhePage panelKey="mesas" />;
}
