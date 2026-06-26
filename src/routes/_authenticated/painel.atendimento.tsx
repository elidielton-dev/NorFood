import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/atendimento")({
  component: AtendimentoLayout,
});

function AtendimentoLayout() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Outlet />
    </div>
  );
}
