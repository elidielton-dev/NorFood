import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Info, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/db";
import {
  GestaoButton,
  GestaoField,
  GestaoInput,
  GestaoModalFooter,
  GestaoSegmentedControl,
  GestaoSelect,
  GestaoUnderlineTabs,
  gestao,
} from "@/components/gestao-ui";
import { ORIGEM_MERCADORIA_OPTIONS } from "@/lib/fiscal/fiscal-types";
import {
  CHANNEL_LABELS,
  PRODUCT_IMAGES,
  createId,
  type ProductCategory,
  type ProductRecord,
  type ProductStatus,
  type ProductVariation,
  type SellChannel,
} from "@/lib/produtos-module";

type ProductFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ProductRecord;
  setForm: React.Dispatch<React.SetStateAction<ProductRecord>>;
  editingId: string | null;
  categorias: ProductCategory[];
  onSave: () => void;
};

type ModalTab = "geral" | "variacao" | "estoque" | "fiscal" | "disponibilidade";

function calcDiscountPercent(base: number, promo: number | null) {
  if (!promo || base <= 0 || promo >= base) return 0;
  return Math.round(((base - promo) / base) * 100);
}

function promoPriceFromDiscount(base: number, percent: number) {
  if (base <= 0 || percent <= 0) return null;
  return Number((base * (1 - percent / 100)).toFixed(2));
}

export function ProductFormModal({
  open,
  onOpenChange,
  form,
  setForm,
  editingId,
  categorias,
  onSave,
}: ProductFormModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>("geral");
  const emPromocao = form.precoPromocional != null;
  const descontoPercent = calcDiscountPercent(form.precoVenda, form.precoPromocional);
  const precoAtual = emPromocao ? (form.precoPromocional ?? form.precoVenda) : form.precoVenda;

  const stockAlert = useMemo(() => {
    if (form.estoque <= 0) return form.estoque;
    if (form.estoque < form.estoqueMinimo) return form.estoque - form.estoqueMinimo;
    return null;
  }, [form.estoque, form.estoqueMinimo]);

  useEffect(() => {
    if (open) setActiveTab("geral");
  }, [open, editingId]);

  function patchForm(patch: Partial<ProductRecord>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function updateVariation(variationId: string, patch: Partial<ProductVariation>) {
    setForm((current) => ({
      ...current,
      variacoes: current.variacoes.map((variacao) =>
        variacao.id === variationId ? { ...variacao, ...patch } : variacao,
      ),
    }));
  }

  function handleToggleCanal(canal: SellChannel) {
    setForm((current) => {
      const checked = current.disponivelCanais.includes(canal);
      return {
        ...current,
        disponivelCanais: checked
          ? current.disponivelCanais.filter((item) => item !== canal)
          : [...current.disponivelCanais, canal],
      };
    });
  }

  const tabItems = [
    { id: "geral", label: "Geral" },
    { id: "variacao", label: "Variação" },
    { id: "estoque", label: "Estoque",
      badge:
        stockAlert != null && stockAlert < 0 ? (
          <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {stockAlert}
          </span>
        ) : undefined,
    },
    { id: "fiscal", label: "Fiscal" },
    { id: "disponibilidade", label: "Disponibilidade" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,900px)] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-[color:var(--honey-line)] p-0 sm:w-full">
        <DialogHeader className="shrink-0 border-b border-[color:var(--honey-line)] px-4 py-4 sm:px-6">
          <DialogTitle className="font-display text-xl lowercase text-sage sm:text-2xl">
            {editingId ? "editar produto" : "novo produto"}
          </DialogTitle>
        </DialogHeader>

        <GestaoUnderlineTabs
          value={activeTab}
          onChange={(id) => setActiveTab(id as ModalTab)}
          items={tabItems}
          className="shrink-0 px-2 sm:px-4"
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {activeTab === "geral" ? (
            <div className="grid gap-6 md:grid-cols-[minmax(140px,200px)_1fr]">
              <div className="space-y-3">
                <div className="overflow-hidden rounded-2xl border border-dashed border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40">
                  <img
                    src={form.foto || PRODUCT_IMAGES[0]}
                    alt={form.nome || "Preview"}
                    className="aspect-square w-full object-cover md:max-h-48"
                  />
                </div>
                <GestaoField label="URL da foto">
                  <GestaoInput
                    value={form.foto}
                    onChange={(e) => patchForm({ foto: e.target.value })}
                    placeholder="https://..."
                  />
                </GestaoField>
                <GestaoButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    patchForm({
                      foto: PRODUCT_IMAGES[Math.floor(Math.random() * PRODUCT_IMAGES.length)],
                    })
                  }
                >
                  <ImagePlus className="size-3.5" />
                  Imagem sugerida
                </GestaoButton>
              </div>

              <div className="space-y-4">
                <GestaoField label="Nome do produto" required>
                  <GestaoInput
                    value={form.nome}
                    onChange={(e) => patchForm({ nome: e.target.value })}
                  />
                </GestaoField>

                <div className="grid gap-3 sm:grid-cols-3">
                  <GestaoField label="Preço" required>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">
                        R$
                      </span>
                      <GestaoInput
                        type="number"
                        step="0.01"
                        value={precoAtual}
                        onChange={(e) => {
                          const value = Number(e.target.value) || 0;
                          if (emPromocao) patchForm({ precoPromocional: value });
                          else patchForm({ precoVenda: value, precoPromocional: null });
                        }}
                        className="pl-9"
                      />
                    </div>
                  </GestaoField>
                  <GestaoField label="Preço antigo">
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">
                        R$
                      </span>
                      <GestaoInput
                        type="number"
                        step="0.01"
                        value={form.precoVenda}
                        disabled={!emPromocao}
                        onChange={(e) => patchForm({ precoVenda: Number(e.target.value) || 0 })}
                        className="pl-9 disabled:opacity-50"
                      />
                    </div>
                  </GestaoField>
                  <GestaoField label="Desconto %">
                    <GestaoInput
                      type="number"
                      value={descontoPercent}
                      disabled={!emPromocao}
                      onChange={(e) => {
                        const percent = Number(e.target.value) || 0;
                        patchForm({
                          precoPromocional: promoPriceFromDiscount(form.precoVenda, percent),
                        });
                      }}
                      className="disabled:opacity-50"
                    />
                  </GestaoField>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <GestaoField label="Código de barras">
                    <GestaoInput
                      value={form.codigoBarras}
                      onChange={(e) => patchForm({ codigoBarras: e.target.value })}
                    />
                  </GestaoField>
                  <GestaoField label="Código interno">
                    <GestaoInput
                      value={form.sku}
                      onChange={(e) => patchForm({ sku: e.target.value })}
                    />
                  </GestaoField>
                </div>

                <GestaoField label="Categoria" required>
                  <GestaoSelect
                    value={form.categoria}
                    onChange={(e) => patchForm({ categoria: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    {categorias.map((categoria) => (
                      <option key={categoria.id} value={categoria.nome}>
                        {categoria.nome}
                      </option>
                    ))}
                  </GestaoSelect>
                </GestaoField>

                <GestaoField label="Status">
                  <GestaoSegmentedControl
                    value={form.status}
                    onChange={(value) => patchForm({ status: value })}
                    options={[
                      { value: "ativo", label: "ativo" },
                      { value: "indisponivel", label: "em falta" },
                      { value: "pausado", label: "oculto" },
                    ]}
                  />
                </GestaoField>

                <div className="grid gap-2 sm:grid-cols-2">
                  <FeatureToggle
                    label="Quero Desconto"
                    checked={form.queroDesconto}
                    onChange={(checked) => patchForm({ queroDesconto: checked })}
                  />
                  <FeatureToggle
                    label="Em promoção"
                    checked={emPromocao}
                    onChange={(checked) =>
                      patchForm({
                        precoPromocional: checked
                          ? (promoPriceFromDiscount(form.precoVenda, 10) ?? form.precoVenda)
                          : null,
                      })
                    }
                  />
                  <FeatureToggle
                    label="Frete Grátis"
                    checked={form.freteGratis}
                    onChange={(checked) => patchForm({ freteGratis: checked })}
                  />
                  <FeatureToggle
                    label="Primeiro Pedido"
                    checked={form.primeiroPedido}
                    onChange={(checked) => patchForm({ primeiroPedido: checked })}
                  />
                </div>

                <FeatureToggle
                  label="Pesável"
                  checked={form.pesavel}
                  onChange={(checked) =>
                    patchForm({
                      pesavel: checked,
                      unidade: checked ? "kg" : form.unidade === "kg" ? "unidade" : form.unidade,
                    })
                  }
                />

                <GestaoField label="Descrição curta">
                  <textarea
                    value={form.descricaoCurta}
                    onChange={(e) => patchForm({ descricaoCurta: e.target.value })}
                    rows={2}
                    className={gestao.input}
                  />
                </GestaoField>
              </div>
            </div>
          ) : null}

          {activeTab === "variacao" ? (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Variações de tamanho, sabor ou embalagem.
                </p>
                <GestaoButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    patchForm({
                      variacoes: [
                        ...form.variacoes,
                        {
                          id: createId("var"),
                          nome: "Nova variação",
                          preco: form.precoVenda,
                          estoque: form.estoque,
                          tempoPreparo: form.tempoPreparo,
                          status: "ativo",
                        },
                      ],
                    })
                  }
                >
                  <Plus className="size-3.5" />
                  Adicionar variação
                </GestaoButton>
              </div>
              {form.variacoes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[color:var(--honey-line)] px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhuma variação cadastrada.
                </div>
              ) : (
                <div className="space-y-3">
                  {form.variacoes.map((variacao) => (
                    <div
                      key={variacao.id}
                      className="grid gap-2 rounded-xl border border-[color:var(--honey-line)] p-3 sm:grid-cols-[1.2fr_repeat(3,1fr)_auto]"
                    >
                      <GestaoInput
                        value={variacao.nome}
                        onChange={(e) => updateVariation(variacao.id, { nome: e.target.value })}
                        placeholder="Nome"
                      />
                      <GestaoInput
                        type="number"
                        value={variacao.preco}
                        onChange={(e) =>
                          updateVariation(variacao.id, { preco: Number(e.target.value) || 0 })
                        }
                        placeholder="Preço"
                      />
                      <GestaoInput
                        type="number"
                        value={variacao.estoque}
                        onChange={(e) =>
                          updateVariation(variacao.id, { estoque: Number(e.target.value) || 0 })
                        }
                        placeholder="Estoque"
                      />
                      <GestaoInput
                        type="number"
                        value={variacao.tempoPreparo}
                        onChange={(e) =>
                          updateVariation(variacao.id, {
                            tempoPreparo: Number(e.target.value) || 0,
                          })
                        }
                        placeholder="Min"
                      />
                      <GestaoButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          patchForm({
                            variacoes: form.variacoes.filter((item) => item.id !== variacao.id),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </GestaoButton>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {activeTab === "estoque" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <GestaoField label="Quantidade em estoque">
                  <GestaoInput
                    type="number"
                    value={form.estoque}
                    onChange={(e) => patchForm({ estoque: Number(e.target.value) || 0 })}
                  />
                </GestaoField>
                <GestaoField label="Estoque mínimo">
                  <GestaoInput
                    type="number"
                    value={form.estoqueMinimo}
                    onChange={(e) => patchForm({ estoqueMinimo: Number(e.target.value) || 0 })}
                  />
                </GestaoField>
                <GestaoField label="Unidade">
                  <GestaoSelect
                    value={form.unidade}
                    onChange={(e) =>
                      patchForm({ unidade: e.target.value as ProductRecord["unidade"] })
                    }
                  >
                    {["unidade", "fatia", "kg", "grama", "caixa", "cento"].map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </GestaoSelect>
                </GestaoField>
                <GestaoField label="Custo de produção">
                  <GestaoInput
                    type="number"
                    step="0.01"
                    value={form.custoProducao}
                    onChange={(e) => patchForm({ custoProducao: Number(e.target.value) || 0 })}
                  />
                </GestaoField>
                <GestaoField label="Tempo de preparo (min)">
                  <GestaoInput
                    type="number"
                    value={form.tempoPreparo}
                    onChange={(e) => patchForm({ tempoPreparo: Number(e.target.value) || 0 })}
                  />
                </GestaoField>
                <div className="flex items-end">
                  <FeatureToggle
                    label="Pausar quando acabar estoque"
                    checked={form.autoPauseSemEstoque}
                    onChange={(checked) => patchForm({ autoPauseSemEstoque: checked })}
                  />
                </div>
              </div>
              {stockAlert != null ? (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {form.estoque <= 0
                    ? "Produto sem estoque. Considere marcar como em falta."
                    : `Estoque abaixo do mínimo (${form.estoque} / mín. ${form.estoqueMinimo}).`}
                </div>
              ) : null}
            </>
          ) : null}

          {activeTab === "fiscal" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Campos exigidos pela SEFAZ para emissao de NFC-e (NCM, CFOP, CSOSN).
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <GestaoField label="NCM (8 digitos)" required>
                  <GestaoInput
                    value={form.ncm}
                    onChange={(e) =>
                      patchForm({ ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })
                    }
                    placeholder="19059090"
                  />
                </GestaoField>
                <GestaoField label="CFOP">
                  <GestaoInput
                    value={form.cfop}
                    onChange={(e) =>
                      patchForm({ cfop: e.target.value.replace(/\D/g, "").slice(0, 4) })
                    }
                    placeholder="5102"
                  />
                </GestaoField>
                <GestaoField label="CSOSN (Simples Nacional)">
                  <GestaoInput
                    value={form.csosn}
                    onChange={(e) => patchForm({ csosn: e.target.value })}
                    placeholder="102"
                  />
                </GestaoField>
                <GestaoField label="Origem da mercadoria">
                  <GestaoSelect
                    value={String(form.origem)}
                    onChange={(e) => patchForm({ origem: Number(e.target.value) })}
                  >
                    {ORIGEM_MERCADORIA_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </GestaoSelect>
                </GestaoField>
                <GestaoField label="GTIN / EAN" className="sm:col-span-2">
                  <GestaoInput
                    value={form.gtin}
                    onChange={(e) => patchForm({ gtin: e.target.value })}
                    placeholder="Deixe vazio se nao houver codigo de barras"
                  />
                </GestaoField>
              </div>
            </div>
          ) : null}

          {activeTab === "disponibilidade" ? (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                Escolha em quais canais este produto aparece para venda.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(CHANNEL_LABELS).map(([canal, label]) => {
                  const checked = form.disponivelCanais.includes(canal as SellChannel);
                  return (
                    <div
                      key={canal}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--honey-line)] bg-background px-4 py-3 text-sm"
                    >
                      <span>{label}</span>
                      <GestaoButton
                        type="button"
                        variant={checked ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => handleToggleCanal(canal as SellChannel)}
                      >
                        {checked ? "Ativo" : "Inativo"}
                      </GestaoButton>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        <GestaoModalFooter>
          <p className="text-sm text-muted-foreground">
            Preço atual: <span className="font-semibold text-sage">{formatBRL(precoAtual)}</span>
          </p>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <GestaoButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </GestaoButton>
            <GestaoButton type="button" onClick={onSave}>
              {editingId ? "Salvar alterações" : "Cadastrar produto"}
            </GestaoButton>
          </div>
        </GestaoModalFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeatureToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--honey-line)] bg-background px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm">{label}</span>
        <Info className="size-3.5 shrink-0 text-muted-foreground" />
      </div>
      <GestaoButton
        type="button"
        variant={checked ? "primary" : "danger"}
        size="sm"
        onClick={() => onChange(!checked)}
      >
        {checked ? "ativo" : "inativo"}
      </GestaoButton>
    </div>
  );
}
