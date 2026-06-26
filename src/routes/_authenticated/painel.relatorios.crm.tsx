import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosInteligenciaPage } from "./painel.relatorios";

export const Route = createFileRoute("/_authenticated/painel/relatorios/crm")({
  component: RelatorioCrmPage,
});

function RelatorioCrmPage() {
  return <RelatoriosInteligenciaPage forcedReport="crm" />;
}
