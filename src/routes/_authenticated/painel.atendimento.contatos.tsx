import { createFileRoute } from "@tanstack/react-router";
import { AtendimentoContatos } from "@/components/atendimento/atendimento-contatos";

export const Route = createFileRoute("/_authenticated/painel/atendimento/contatos")({
  component: AtendimentoContatos,
});
