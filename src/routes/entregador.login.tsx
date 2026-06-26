import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/entregador/login")({
  beforeLoad: () => {
    throw redirect({ to: "/entregador" });
  },
});
