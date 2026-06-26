import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosInteligenciaPage } from "./painel.relatorios";

export const Route = createFileRoute("/_authenticated/painel/relatorios/operacao")({
  component: RelatorioOperacaoPage,
});

function RelatorioOperacaoPage() {
  return <RelatoriosInteligenciaPage forcedReport="operacao" />;
}
