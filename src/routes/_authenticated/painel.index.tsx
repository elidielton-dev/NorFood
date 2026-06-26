import { createFileRoute } from "@tanstack/react-router";
import { PainelDashboardPage } from "@/components/painel/painel-dashboard-page";

export const Route = createFileRoute("/_authenticated/painel/")({
  component: PainelDashboardPage,
});
