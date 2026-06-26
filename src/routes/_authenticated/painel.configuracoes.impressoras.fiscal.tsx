import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracaoImpressoraDetalhePage } from "./-painel.configuracoes.shared";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/impressoras/fiscal")({
  component: FiscalPrinterPage,
});

function FiscalPrinterPage() {
  return <ConfiguracaoImpressoraDetalhePage panelKey="fiscal" />;
}
