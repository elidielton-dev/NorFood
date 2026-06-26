import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosInteligenciaPage } from "./painel.relatorios";

export const Route = createFileRoute("/_authenticated/painel/relatorios/vendas")({
  component: RelatorioVendasPage,
});

function RelatorioVendasPage() {
  return <RelatoriosInteligenciaPage forcedReport="vendas" />;
}
