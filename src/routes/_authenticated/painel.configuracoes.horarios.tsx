import { createFileRoute } from "@tanstack/react-router";
import { HorariosPage } from "@/components/painel/painel-horarios-page";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/horarios")({
  component: ConfiguracoesHorariosPage,
});

function ConfiguracoesHorariosPage() {
  return <HorariosPage backTo="/painel/configuracoes" />;
}
