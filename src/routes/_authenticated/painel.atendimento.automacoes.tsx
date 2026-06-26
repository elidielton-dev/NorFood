import { createFileRoute } from "@tanstack/react-router";
import { AtendimentoAutomacoes } from "@/components/atendimento/atendimento-automacoes";

export const Route = createFileRoute("/_authenticated/painel/atendimento/automacoes")({
  component: AtendimentoAutomacoes,
});
