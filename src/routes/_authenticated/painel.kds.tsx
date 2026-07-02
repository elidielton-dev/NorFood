import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Rota legada: redireciona para Gestao delivery. */
export const Route = createFileRoute("/_authenticated/painel/kds")({
  component: () => <Navigate to="/painel/gestao-delivery" replace />,
});
