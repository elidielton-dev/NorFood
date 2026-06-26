import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosInteligenciaPage } from "./painel.relatorios";

export const Route = createFileRoute("/_authenticated/painel/relatorios/estoque")({
  component: RelatorioEstoquePage,
});

function RelatorioEstoquePage() {
  return <RelatoriosInteligenciaPage forcedReport="estoque" />;
}
