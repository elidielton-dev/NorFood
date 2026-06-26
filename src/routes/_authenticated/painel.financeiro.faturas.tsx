import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/financeiro/faturas")({
  component: () => <Navigate to="/painel/fiscal" replace />,
});
