import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/parceiro/restaurantes")({
  component: () => <Outlet />,
});
