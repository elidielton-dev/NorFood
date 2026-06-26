import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosInteligenciaPage } from "./painel.relatorios";

export const Route = createFileRoute("/_authenticated/painel/relatorios/financeiro")({
  component: RelatorioFinanceiroPage,
});

function RelatorioFinanceiroPage() {
  return <RelatoriosInteligenciaPage forcedReport="financeiro" />;
}
