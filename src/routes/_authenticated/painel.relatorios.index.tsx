import { createFileRoute } from "@tanstack/react-router";
import { RelatoriosInteligenciaPage } from "./painel.relatorios";

export const Route = createFileRoute("/_authenticated/painel/relatorios/")({
  component: RelatoriosIndexPage,
});

function RelatoriosIndexPage() {
  return <RelatoriosInteligenciaPage />;
}
