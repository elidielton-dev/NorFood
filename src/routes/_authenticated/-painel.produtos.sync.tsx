import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package, Pencil } from "lucide-react";
import { CHANNEL_LABELS } from "@/lib/produtos-module";
import { resolveProductImage } from "@/lib/cardapio";
import { formatBRL } from "@/lib/db";
import {
  fetchModuleProducts,
  isModuleProductSincronizado,
  labelMotivoModuloNaoSincronizado,
  partitionProdutosBySync,
  PRODUTOS_MODULE_PRODUCTS_QUERY_KEY,
} from "@/lib/produtos-sync";
import {
  GestaoButton,
  GestaoEmptyState,
  GestaoPage,
  GestaoTable,
  GestaoTableHead,
  StatusPill,
} from "@/components/gestao-ui";

export function ProdutosSyncPage({ mode }: { mode: "sincronizados" | "pendentes" }) {
  const { data: produtos = [], isLoading } = useQuery({
    queryKey: PRODUTOS_MODULE_PRODUCTS_QUERY_KEY,
    queryFn: fetchModuleProducts,
  });

  const { sincronizados, pendentes } = partitionProdutosBySync(produtos);
  const filtrados = mode === "sincronizados" ? sincronizados : pendentes;

  const titulo = mode === "sincronizados" ? "Sincronizados" : "Pendentes";
  const subtitulo =
    mode === "sincronizados"
      ? `${sincronizados.length} prontos na vitrine · ${pendentes.length} pendentes no catalogo.`
      : `${pendentes.length} precisam de ajuste · ${sincronizados.length} ja sincronizados.`;

  return (
    <GestaoPage
      title={titulo}
      subtitle={subtitulo}
      actions={
        <Link to="/painel/produtos">
          <GestaoButton variant="secondary">
            <Pencil className="size-4" /> Abrir catalogo
          </GestaoButton>
        </Link>
      }
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando catalogo...</p>
      ) : filtrados.length === 0 ? (
        <GestaoEmptyState
          icon={<Package className="size-8" />}
          title={mode === "sincronizados" ? "Nenhum produto sincronizado" : "Nenhum pendente"}
          description={
            mode === "sincronizados"
              ? "Cadastre produtos no catalogo com foto, preco e canais ativos."
              : "Todos os produtos do catalogo estao prontos para venda."
          }
        />
      ) : (
        <GestaoTable>
          <GestaoTableHead>
            <tr>
              <th className="p-3">Produto</th>
              <th className="hidden p-3 sm:table-cell">Categoria</th>
              <th className="hidden p-3 md:table-cell">Canais</th>
              {mode === "pendentes" ? <th className="p-3">Pendencia</th> : null}
              <th className="p-3 text-right">Preco</th>
              {mode === "pendentes" ? <th className="p-3 text-right">Acao</th> : null}
            </tr>
          </GestaoTableHead>
          <tbody>
            {filtrados.map((produto) => (
              <tr key={produto.id} className="border-t border-[color:var(--honey-line)]">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={resolveProductImage(produto.foto, produto.foto)}
                      alt={produto.nome}
                      className="size-10 rounded-lg border border-[color:var(--honey-line)] object-cover"
                    />
                    <span className="font-medium">{produto.nome}</span>
                  </div>
                </td>
                <td className="hidden p-3 sm:table-cell">{produto.categoria}</td>
                <td className="hidden p-3 text-xs md:table-cell">
                  {produto.disponivelCanais
                    .map((canal) => CHANNEL_LABELS[canal] ?? canal)
                    .join(", ")}
                </td>
                {mode === "pendentes" ? (
                  <td className="p-3">
                    <StatusPill tone="warning">
                      {labelMotivoModuloNaoSincronizado(produto)}
                    </StatusPill>
                  </td>
                ) : null}
                <td className="p-3 text-right">{formatBRL(Number(produto.precoVenda))}</td>
                {mode === "pendentes" ? (
                  <td className="p-3 text-right">
                    <Link to="/painel/produtos" search={{ tab: "produtos", editar: produto.id }}>
                      <GestaoButton size="sm" variant="secondary">
                        Corrigir
                      </GestaoButton>
                    </Link>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </GestaoTable>
      )}
    </GestaoPage>
  );
}
