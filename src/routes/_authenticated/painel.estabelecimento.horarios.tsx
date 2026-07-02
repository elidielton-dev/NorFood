import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/estabelecimento/horarios")({
  beforeLoad: () => {
    throw redirect({ to: "/painel/configuracoes/horarios" });
  },
});
