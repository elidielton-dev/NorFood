import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ConfiguracoesShell } from "@/components/configuracoes/configuracoes-shell";

export const Route = createFileRoute("/_authenticated/painel/configuracoes")({
  component: ConfiguracoesLayout,
});

function ConfiguracoesLayout() {
  return (
    <ConfiguracoesShell>
      <Outlet />
    </ConfiguracoesShell>
  );
}
