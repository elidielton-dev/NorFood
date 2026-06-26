import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/configuracoes")({
  component: ConfiguracoesLayout,
});

function ConfiguracoesLayout() {
  return <Outlet />;
}
