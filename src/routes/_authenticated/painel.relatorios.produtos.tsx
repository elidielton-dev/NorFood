import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosInteligenciaPage } from "./painel.relatorios";

export const Route = createFileRoute("/_authenticated/painel/relatorios/produtos")({
  component: RelatorioProdutosPage,
});

function RelatorioProdutosPage() {
  return <RelatoriosInteligenciaPage forcedReport="produtos" />;
}
