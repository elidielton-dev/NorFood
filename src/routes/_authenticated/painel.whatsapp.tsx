import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/painel/whatsapp")({
  beforeLoad: () => {
    throw redirect({ to: "/painel/atendimento/conversas" });
  },
});
