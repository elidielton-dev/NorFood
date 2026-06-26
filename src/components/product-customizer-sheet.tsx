import { useMemo, useState } from "react";
import type { Doce } from "@/lib/cardapio";
import type { CatalogExtras } from "@/lib/api/catalog-extras.functions";
import { formatBRL } from "@/lib/db";
import type { CarrinhoAdicional } from "@/lib/carrinho";

type ProductCustomizerSheetProps = {
  doce: Doce;
  extras: CatalogExtras | null;
  onClose: () => void;
  onConfirm: (payload: {
    quantidade: number;
    variacaoId?: string;
    variacaoNome?: string;
    adicionais?: CarrinhoAdicional[];
    precoUnitario: number;
  }) => void;
};

export function ProductCustomizerSheet({
  doce,
  extras,
  onClose,
  onConfirm,
}: ProductCustomizerSheetProps) {
  const variacoes = extras?.variacoesByProduto[doce.id] ?? [];
  const promo = extras?.promocoesByProduto[doce.id];
  const basePrice = promo?.precoPromocional ?? doce.preco;

  const [quantidade, setQuantidade] = useState(1);
  const [variacaoId, setVariacaoId] = useState(variacoes[0]?.id ?? "");
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});

  const variacao = variacoes.find((item) => item.id === variacaoId);
  const unitBase = variacao?.preco ?? basePrice;

  const adicionais = useMemo(() => {
    return (extras?.adicionais ?? [])
      .map((addon) => ({
        ...addon,
        qty: selectedAddons[addon.id] ?? 0,
      }))
      .filter((addon) => addon.qty > 0)
      .map((addon) => ({
        id: addon.id,
        nome: addon.nome,
        quantidade: addon.qty,
        preco: addon.preco,
      }));
  }, [extras?.adicionais, selectedAddons]);

  const totalUnit =
    unitBase + adicionais.reduce((sum, addon) => sum + addon.preco * addon.quantidade, 0);

  const hasCustomization = variacoes.length > 0 || (extras?.adicionais?.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-3xl bg-card p-5 shadow-2xl">
        <div className="mb-4">
          <h3 className="font-display text-2xl">{doce.nome}</h3>
          <p className="text-sm text-muted-foreground">{doce.descricao}</p>
        </div>

        {variacoes.length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-medium">Variação</p>
            <div className="flex flex-wrap gap-2">
              {variacoes.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setVariacaoId(item.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    variacaoId === item.id ? "border-sage bg-sage/10" : "border-border"
                  }`}
                >
                  {item.nome} · {formatBRL(item.preco)}
                </button>
              ))}
            </div>
          </div>
        )}

        {(extras?.adicionais?.length ?? 0) > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-sm font-medium">Adicionais</p>
            <div className="space-y-2">
              {extras?.adicionais.map((addon) => (
                <div
                  key={addon.id}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{addon.nome}</p>
                    <p className="text-xs text-muted-foreground">{formatBRL(addon.preco)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-full border px-2"
                      onClick={() =>
                        setSelectedAddons((current) => ({
                          ...current,
                          [addon.id]: Math.max(0, (current[addon.id] ?? 0) - 1),
                        }))
                      }
                    >
                      -
                    </button>
                    <span>{selectedAddons[addon.id] ?? 0}</span>
                    <button
                      className="rounded-full border px-2"
                      onClick={() =>
                        setSelectedAddons((current) => ({
                          ...current,
                          [addon.id]: Math.min(addon.max, (current[addon.id] ?? 0) + 1),
                        }))
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm">Quantidade</span>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border px-2"
              onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
            >
              -
            </button>
            <span>{quantidade}</span>
            <button
              className="rounded-full border px-2"
              onClick={() => setQuantidade((q) => q + 1)}
            >
              +
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-sage">{formatBRL(totalUnit * quantidade)}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm">
              Cancelar
            </button>
            <button
              onClick={() =>
                onConfirm({
                  quantidade,
                  variacaoId: variacao?.id,
                  variacaoNome: variacao?.nome,
                  adicionais,
                  precoUnitario: unitBase,
                })
              }
              className="rounded-xl bg-sage px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Adicionar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
