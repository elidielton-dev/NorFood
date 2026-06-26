import { createFileRoute } from "@tanstack/react-router";
import { AtendimentoConfiguracoes } from "@/components/atendimento/atendimento-configuracoes";

export const Route = createFileRoute("/_authenticated/painel/atendimento/configuracoes")({
  component: AtendimentoConfiguracoes,
});
