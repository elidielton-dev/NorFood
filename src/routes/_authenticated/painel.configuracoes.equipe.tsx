import { createFileRoute } from "@tanstack/react-router";
import { ColaboradoresPage } from "./painel.colaboradores";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/equipe")({
  component: ConfiguracoesEquipePage,
});

function ConfiguracoesEquipePage() {
  return <ColaboradoresPage backTo="/painel/configuracoes" />;
}
