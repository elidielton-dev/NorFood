import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/aprovacoes")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
