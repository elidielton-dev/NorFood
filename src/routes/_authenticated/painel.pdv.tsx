import { createFileRoute } from "@tanstack/react-router";

import { BalcaoPage } from "@/components/balcao/balcao-page";


export const Route = createFileRoute("/_authenticated/painel/pdv")({
  component: BalcaoPage,
});
