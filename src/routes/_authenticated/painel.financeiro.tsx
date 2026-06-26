import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/financeiro")({
  component: FinanceiroLayout,
});

function FinanceiroLayout() {
  return <Outlet />;
}
