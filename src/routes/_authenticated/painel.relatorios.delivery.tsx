import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosInteligenciaPage } from "./painel.relatorios";

export const Route = createFileRoute("/_authenticated/painel/relatorios/delivery")({
  component: RelatorioDeliveryPage,
});

function RelatorioDeliveryPage() {
  return <RelatoriosInteligenciaPage forcedReport="delivery" />;
}
