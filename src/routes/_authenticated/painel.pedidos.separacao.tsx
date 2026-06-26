import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/pedidos/separacao")({
  component: () => <Navigate to="/painel/kds" replace />,
});
