import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/motoboy")({
  beforeLoad: () => {
    throw redirect({ to: "/entregador", replace: true });
  },
});
