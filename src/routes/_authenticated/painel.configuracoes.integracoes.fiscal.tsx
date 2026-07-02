import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/configuracoes/integracoes/fiscal")({
  beforeLoad: () => {
    throw redirect({ to: "/painel/fiscal/configuracoes" });
  },
});
