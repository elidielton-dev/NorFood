
import { createFileRoute, redirect } from "@tanstack/react-router";


export const Route = createFileRoute("/_authenticated/painel/estabelecimento/visual")({
  beforeLoad: () => {
    throw redirect({ to: "/painel/configuracoes/loja" });
  },
});
