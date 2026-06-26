import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Doce } from "./cardapio";

export type CarrinhoAdicional = {
  id: string;
  nome: string;
  quantidade: number;
  preco: number;
};

export type ItemCarrinho = {
  doce: Doce;
  quantidade: number;
  variacaoId?: string;
  variacaoNome?: string;
  adicionais?: CarrinhoAdicional[];
  precoUnitario?: number;
};

type CarrinhoCtx = {
  itens: ItemCarrinho[];
  adicionar: (
    d: Doce,
    qtd?: number,
    extras?: Pick<ItemCarrinho, "variacaoId" | "variacaoNome" | "adicionais" | "precoUnitario">,
  ) => void;
  remover: (key: string) => void;
  ajustar: (key: string, delta: number) => void;
  limpar: () => void;
  total: number;
  totalItens: number;
};

const Ctx = createContext<CarrinhoCtx | null>(null);

export function getCarrinhoUnitPrice(item: ItemCarrinho) {
  const base = item.precoUnitario ?? item.doce.preco;
  const addons = (item.adicionais ?? []).reduce(
    (sum, addon) => sum + addon.preco * addon.quantidade,
    0,
  );
  return base + addons;
}

export function buildCarrinhoItemKey(item: ItemCarrinho) {
  const addonKey = (item.adicionais ?? [])
    .map((addon) => `${addon.id}:${addon.quantidade}`)
    .sort()
    .join("|");
  return `${item.doce.id}:${item.variacaoId ?? "base"}:${addonKey}`;
}

/** Provider do carrinho. Estado em memória — basta um Provider em volta do app. */
export function CarrinhoProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);

  const adicionar = useCallback(
    (
      d: Doce,
      qtd = 1,
      extras?: Pick<ItemCarrinho, "variacaoId" | "variacaoNome" | "adicionais" | "precoUnitario">,
    ) => {
      const nextItem: ItemCarrinho = {
        doce: d,
        quantidade: qtd,
        variacaoId: extras?.variacaoId,
        variacaoNome: extras?.variacaoNome,
        adicionais: extras?.adicionais,
        precoUnitario: extras?.precoUnitario,
      };
      const key = buildCarrinhoItemKey(nextItem);

      setItens((prev) => {
        const i = prev.findIndex((p) => buildCarrinhoItemKey(p) === key);
        if (i >= 0) {
          const copy = [...prev];
          copy[i] = { ...copy[i], quantidade: copy[i].quantidade + qtd };
          return copy;
        }
        return [...prev, nextItem];
      });
    },
    [],
  );

  const remover = useCallback((key: string) => {
    setItens((prev) => prev.filter((p) => buildCarrinhoItemKey(p) !== key));
  }, []);

  const ajustar = useCallback((key: string, delta: number) => {
    setItens((prev) =>
      prev
        .map((p) =>
          buildCarrinhoItemKey(p) === key ? { ...p, quantidade: p.quantidade + delta } : p,
        )
        .filter((p) => p.quantidade > 0),
    );
  }, []);

  const limpar = useCallback(() => setItens([]), []);

  const total = useMemo(
    () => itens.reduce((s, i) => s + getCarrinhoUnitPrice(i) * i.quantidade, 0),
    [itens],
  );
  const totalItens = useMemo(() => itens.reduce((s, i) => s + i.quantidade, 0), [itens]);

  return (
    <Ctx.Provider value={{ itens, adicionar, remover, ajustar, limpar, total, totalItens }}>
      {children}
    </Ctx.Provider>
  );
}

export function mapCartItemToOrderItem(item: ItemCarrinho) {
  return {
    produto_id: item.doce.id,
    quantidade: item.quantidade,
    variacao_id: item.variacaoId ?? null,
    adicionais: (item.adicionais ?? []).map((addon) => ({
      id: addon.id,
      quantidade: addon.quantidade,
    })),
  };
}

/** Hook de acesso ao carrinho. */
export function useCarrinho() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCarrinho precisa estar dentro de <CarrinhoProvider />");
  return v;
}
