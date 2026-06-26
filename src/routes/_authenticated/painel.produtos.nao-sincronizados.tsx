import { createFileRoute } from "@tanstack/react-router";
import { ProdutosSyncPage } from "./-painel.produtos.sync";

export const Route = createFileRoute("/_authenticated/painel/produtos/nao-sincronizados")({
  component: () => <ProdutosSyncPage mode="pendentes" />,
});
