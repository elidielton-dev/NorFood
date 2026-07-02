import { createFileRoute } from "@tanstack/react-router";
import { PlanoNorfoodPage } from "@/components/painel/painel-plano-page";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/plano")({
  component: ConfiguracoesPlanoPage,
});

function ConfiguracoesPlanoPage() {
  return <PlanoNorfoodPage backTo="/painel/configuracoes" />;
}
