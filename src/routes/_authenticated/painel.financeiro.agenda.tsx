import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/financeiro/agenda")({
  component: () => <Navigate to="/painel/financeiro/extratos" replace />,
});
