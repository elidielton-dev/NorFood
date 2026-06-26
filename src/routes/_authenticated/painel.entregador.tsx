import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/entregador")({
  beforeLoad: () => {
    throw redirect({ to: "/entregador", replace: true });
  },
});
