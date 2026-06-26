import { createFileRoute } from "@tanstack/react-router";
import { FinanceiroFluxoPage } from "./-painel.financeiro.shared";

export const Route = createFileRoute("/_authenticated/painel/financeiro/")({
  component: FinanceiroFluxoPage,
});
