import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/produtos/categorias")({
  component: () => <Navigate to="/painel/produtos" search={{ tab: "categorias" }} />,
});
