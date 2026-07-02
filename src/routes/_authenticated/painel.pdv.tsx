import { createFileRoute } from "@tanstack/react-router";
import { BalcaoPos } from "@/components/balcao/balcao-pos";

export const Route = createFileRoute("/_authenticated/painel/pdv")({
  component: BalcaoPage,
});

function BalcaoPage() {
  return <BalcaoPos />;
}
