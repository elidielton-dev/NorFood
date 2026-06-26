import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracaoImpressoraDetalhePage } from "./-painel.configuracoes.shared";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/impressoras/kds")({
  component: KdsPrinterPage,
});

function KdsPrinterPage() {
  return <ConfiguracaoImpressoraDetalhePage panelKey="kds" />;
}
