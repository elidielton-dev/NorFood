import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/mesa")({
  beforeLoad: async () => {
    throw redirect({ to: "/painel/mesas" });
  },
  component: () => null,
});
