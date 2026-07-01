import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { createBalcaoOrderServer } from "@/lib/api/balcao.functions";
import { formatBRL, listarProdutos, type Produto } from "@/lib/db";
import { ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  GestaoButton,
  GestaoCard,
  GestaoEmptyState,
  GestaoField,
  GestaoPage,
  GestaoSectionTitle,
  GestaoSelect,
} from "@/components/gestao-ui";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { tenantQueryKey } from "@/lib/tenant/query-keys";

export const Route = createFileRoute("/_authenticated/painel/pdv")({
  component: BalcaoPage,
});

type CarrinhoItem = {
  produto: Produto;
  quantidade: number;
};

function BalcaoPage() {
  const qc = useQueryClient();
  const tenantSlug = useTenantSlug();
  const { data: produtos = [] } = useQuery({
    queryKey: tenantQueryKey("produtos", tenantSlug),
    queryFn: listarProdutos,
  });
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);
  const [forma, setForma] = useState("pix");
  const [salvando, setSalvando] = useState(false);

  const total = useMemo(
    () => carrinho.reduce((sum, item) => sum + item.produto.preco * item.quantidade, 0),
    [carrinho],
  );

  function adicionar(produto: Produto) {
    setCarrinho((atual) => {
      const existente = atual.find((item) => item.produto.id === produto.id);
      if (existente) {
        return atual.map((item) =>
          item.produto.id === produto.id ? { ...item, quantidade: item.quantidade + 1 } : item,
        );
      }
      return [...atual, { produto, quantidade: 1 }];
    });
  }

  function alterarQuantidade(produtoId: string, delta: number) {
    setCarrinho((atual) =>
      atual
        .map((item) =>
          item.produto.id === produtoId
            ? { ...item, quantidade: Math.max(0, item.quantidade + delta) }
            : item,
        )
        .filter((item) => item.quantidade > 0),
    );
  }

  async function finalizarPedido() {
    if (!carrinho.length) {
      toast.error("Adicione pelo menos um produto.");
      return;
    }

    setSalvando(true);
    try {
      await createBalcaoOrderServer({
        data: {
          tenantSlug: tenantSlug!,
          forma_pagamento: forma,
          observacoes: "Pedido criado no balcão",
          itens: carrinho.map((item) => ({
            produto_id: item.produto.id,
            quantidade: item.quantidade,
          })),
        },
      });
      setCarrinho([]);
      toast.success("Pedido do balcão criado com sucesso.");
      qc.invalidateQueries({ queryKey: tenantQueryKey("pedidos", tenantSlug) });
      qc.invalidateQueries({ queryKey: tenantQueryKey("dashboard", tenantSlug) });
      qc.invalidateQueries({ queryKey: tenantQueryKey("financeiro", tenantSlug) });
    } catch (error: any) {
      toast.error(error.message ?? "Não foi possível criar o pedido.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <GestaoPage
      title="Balcão"
      subtitle="Tela exclusiva para pedidos de balcão, sem seleção de mesa."
    >
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <GestaoCard>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {produtos.map((produto) => (
              <button
                key={produto.id}
                onClick={() => adicionar(produto)}
                className="rounded-2xl border border-[color:var(--honey-line)] bg-background p-4 text-left transition hover:-translate-y-0.5 hover:border-sage hover:shadow-soft"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{produto.nome}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {produto.descricao || "Produto disponível no balcão"}
                    </p>
                  </div>
                  <ShoppingCart className="size-4 text-muted-foreground shrink-0" />
                </div>
                <p className="font-semibold text-sage">{formatBRL(produto.preco)}</p>
              </button>
            ))}
          </div>
        </GestaoCard>

        <GestaoCard>
          <GestaoSectionTitle
            title="Pedido atual"
            description={`${carrinho.length} itens no carrinho`}
            action={
              carrinho.length ? (
                <GestaoButton variant="secondary" size="sm" onClick={() => setCarrinho([])}>
                  <Trash2 className="size-3" /> Limpar
                </GestaoButton>
              ) : undefined
            }
          />

          <div className="mt-4 space-y-3">
            {carrinho.length === 0 ? (
              <GestaoEmptyState
                title="Carrinho vazio"
                description="Adicione produtos para criar um pedido de balcão."
              />
            ) : (
              carrinho.map((item) => (
                <div
                  key={item.produto.id}
                  className="rounded-2xl border border-[color:var(--honey-line)] bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.produto.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBRL(item.produto.preco)} cada
                      </p>
                    </div>
                    <p className="font-semibold">
                      {formatBRL(item.produto.preco * item.quantidade)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <GestaoButton
                      variant="secondary"
                      size="sm"
                      className="size-9 rounded-full p-0"
                      onClick={() => alterarQuantidade(item.produto.id, -1)}
                    >
                      -
                    </GestaoButton>
                    <div className="min-w-10 text-center text-sm font-semibold">
                      {item.quantidade}
                    </div>
                    <GestaoButton
                      variant="secondary"
                      size="sm"
                      className="size-9 rounded-full p-0"
                      onClick={() => alterarQuantidade(item.produto.id, 1)}
                    >
                      +
                    </GestaoButton>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 space-y-4 border-t border-[color:var(--honey-line)] pt-4">
            <GestaoField label="Forma de pagamento">
              <GestaoSelect value={forma} onChange={(e) => setForma(e.target.value)}>
                <option value="pix">Pix</option>
                <option value="credito">Cartão de crédito</option>
                <option value="debito">Cartão de débito</option>
                <option value="dinheiro">Dinheiro</option>
              </GestaoSelect>
            </GestaoField>

            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-semibold">{formatBRL(total)}</span>
            </div>

            <GestaoButton
              className="w-full"
              size="lg"
              onClick={finalizarPedido}
              disabled={salvando || !carrinho.length}
            >
              {salvando ? "Salvando pedido..." : "Fechar pedido do balcão"}
            </GestaoButton>
          </div>
        </GestaoCard>
      </div>
    </GestaoPage>
  );
}
