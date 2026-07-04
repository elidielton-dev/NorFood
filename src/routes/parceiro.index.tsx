import { createFileRoute } from "@tanstack/react-router";
import { ParceiroDashboard } from "@/components/parceiro/parceiro-dashboard";

export const Route = createFileRoute("/parceiro/")({
  component: ParceiroDashboardPage,
});

function ParceiroDashboardPage() {
  return <ParceiroDashboard />;
}
