import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, HelpCircle, ImagePlus, Info, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { uploadProductImageServer } from "@/lib/api/produtos-module.functions";
import { useTenantOptional } from "@/lib/tenant/tenant-context";
import { hasBrowserSupabaseConfig } from "@/lib/runtime";
import { toast } from "sonner";

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [variacaoHelpOpen, setVariacaoHelpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tenantSlug = useTenantOptional()?.tenant.slug;
  const useSupabase = hasBrowserSupabaseConfig();
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

  async function handlePhotoFileSelected(file: File | null) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (JPG, PNG ou WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande. Tamanho máximo: 5 MB.");
      return;
    }

    setUploadingPhoto(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
      });

      if (!useSupabase) {
        patchForm({ foto: dataUrl });
        toast.success("Foto aplicada (modo demo local).");
        return;
      }

      const { url } = await uploadProductImageServer({
        data: {
          tenantSlug,
          productId: editingId,
          mimeType: file.type,
          base64: dataUrl,
        },
      });
      patchForm({ foto: url });
      toast.success("Foto enviada com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar foto.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
          <DialogTitle className="font-display text-xl text-sage sm:text-2xl">
            {editingId ? "Editar produto" : "Novo produto"}
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
                <div className="relative overflow-hidden rounded-2xl border border-dashed border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40">
                  <img
                    src={form.foto || PRODUCT_IMAGES[0]}
                    alt={form.nome || "Pré-visualização do produto"}
                    className="aspect-square w-full object-cover md:max-h-48"
                  />
                  {uploadingPhoto ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="size-8 animate-spin text-white" />
                    </div>
                  ) : null}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handlePhotoFileSelected(e.target.files?.[0] ?? null)}
                />

                <GestaoButton
                  type="button"
                  variant="primary"
                  size="sm"
                  className="w-full"
                  disabled={uploadingPhoto}
                  onClick={() => {
                    fileInputRef.current?.removeAttribute("capture");
                    fileInputRef.current?.click();
                  }}
                >
                  {uploadingPhoto ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  {uploadingPhoto ? "Enviando..." : "Escolher foto"}
                </GestaoButton>

                <GestaoButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full sm:hidden"
                  disabled={uploadingPhoto}
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = "image/*";
                      fileInputRef.current.setAttribute("capture", "environment");
                      fileInputRef.current.click();
                    }
                  }}
                >
                  <Camera className="size-3.5" />
                  Tirar foto
                </GestaoButton>

                <GestaoField label="Ou cole a URL da foto">
                  <GestaoInput
                    value={form.foto.startsWith("data:") ? "" : form.foto}
                    onChange={(e) => patchForm({ foto: e.target.value })}
                    placeholder="https://..."
                  />
                </GestaoField>
                <GestaoButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={uploadingPhoto}
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
                  {categorias.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Cadastre uma categoria antes de salvar o produto. Vá em{" "}
                      <strong>Produtos → Categorias</strong> e clique em{" "}
                      <strong>Criar categoria</strong>.
                    </div>
                  ) : (
                    <GestaoSelect
                      value={form.categoria}
                      onChange={(e) => patchForm({ categoria: e.target.value })}
                    >
                      <option value="">Selecione uma categoria</option>
                      {categorias.map((categoria) => (
                        <option key={categoria.id} value={categoria.nome}>
                          {categoria.icone ? `${categoria.icone} ` : ""}
                          {categoria.nome}
                        </option>
                      ))}
                    </GestaoSelect>
                  )}
                </GestaoField>

                <GestaoField label="Status">
                  <GestaoSegmentedControl
                    value={form.status}
                    onChange={(value) => patchForm({ status: value })}
                    options={[
                      { value: "ativo", label: "Ativo" },
                      { value: "indisponivel", label: "Em falta" },
                      { value: "pausado", label: "Oculto" },
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
              <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-4 text-sm text-sky-950">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">O que são variações?</p>
                    <p className="mt-1 text-sky-900/90">
                      Use quando o mesmo produto tem tamanhos, sabores ou opções com preços
                      diferentes. Na loja, o cliente escolhe a variação antes de adicionar ao
                      carrinho.
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-sky-900/80">
                      <li>
                        <strong>Pipocaria:</strong> Pequena R$ 12 · Média R$ 18 · Grande R$ 25
                      </li>
                      <li>
                        <strong>Combo:</strong> Individual · Duplo · Família
                      </li>
                      <li>
                        <strong>Sabor:</strong> Tradicional · Caramelo · Chocolate
                      </li>
                    </ul>
                  </div>
                  <GestaoButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setVariacaoHelpOpen(true)}
                  >
                    <HelpCircle className="size-3.5" />
                    Guia completo
                  </GestaoButton>
                </div>
              </div>

              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {form.variacoes.length > 0
                    ? `${form.variacoes.length} variação(ões) cadastrada(s).`
                    : "Nenhuma variação — o produto usa apenas o preço da aba Geral."}
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
                          nome: "",
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
                <div className="rounded-2xl border border-dashed border-[color:var(--honey-line)] px-4 py-10 text-center">
                  <p className="text-sm font-medium text-[color:var(--gestao-ink)]">
                    Produto sem variações
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    Se o preço é único, não precisa cadastrar variação. Clique em{" "}
                    <strong>Adicionar variação</strong> para criar tamanhos ou sabores com preços
                    próprios.
                  </p>
                  <GestaoButton
                    type="button"
                    variant="primary"
                    size="sm"
                    className="mt-4"
                    onClick={() =>
                      patchForm({
                        variacoes: [
                          {
                            id: createId("var"),
                            nome: "Pequena",
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
                    Começar com exemplo (Pequena)
                  </GestaoButton>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="hidden gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground sm:grid sm:grid-cols-[1.2fr_repeat(3,1fr)_auto]">
                    <span>Nome da opção</span>
                    <span>Preço (R$)</span>
                    <span>Estoque</span>
                    <span>Preparo (min)</span>
                    <span className="text-right">Remover</span>
                  </div>
                  {form.variacoes.map((variacao) => (
                    <div
                      key={variacao.id}
                      className="grid gap-2 rounded-xl border border-[color:var(--honey-line)] p-3 sm:grid-cols-[1.2fr_repeat(3,1fr)_auto]"
                    >
                      <GestaoInput
                        value={variacao.nome}
                        onChange={(e) => updateVariation(variacao.id, { nome: e.target.value })}
                        placeholder="Ex.: Média"
                      />
                      <GestaoInput
                        type="number"
                        value={variacao.preco}
                        onChange={(e) =>
                          updateVariation(variacao.id, { preco: Number(e.target.value) || 0 })
                        }
                        placeholder="0,00"
                      />
                      <GestaoInput
                        type="number"
                        value={variacao.estoque}
                        onChange={(e) =>
                          updateVariation(variacao.id, { estoque: Number(e.target.value) || 0 })
                        }
                        placeholder="Qtd."
                      />
                      <GestaoInput
                        type="number"
                        value={variacao.tempoPreparo}
                        onChange={(e) =>
                          updateVariation(variacao.id, {
                            tempoPreparo: Number(e.target.value) || 0,
                          })
                        }
                        placeholder="Minutos"
                      />
                      <GestaoButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Remover variação"
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

              <AlertDialog open={variacaoHelpOpen} onOpenChange={setVariacaoHelpOpen}>
                <AlertDialogContent className="max-w-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Como cadastrar variações</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3 text-left text-sm text-muted-foreground">
                        <p>
                          Variações servem para o cliente escolher tamanho, sabor ou tipo do mesmo
                          produto, cada um com preço e estoque próprios.
                        </p>
                        <div>
                          <p className="font-medium text-foreground">Passo a passo</p>
                          <ol className="mt-2 list-decimal space-y-1 pl-5">
                            <li>Clique em <strong>Adicionar variação</strong>.</li>
                            <li>
                              Informe o <strong>nome</strong> (ex.: Pequena, Média, Grande).
                            </li>
                            <li>
                              Defina o <strong>preço</strong> e o <strong>estoque</strong> de cada
                              opção.
                            </li>
                            <li>
                              Salve o produto. Na loja online, o cliente verá as opções antes de
                              comprar.
                            </li>
                          </ol>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Quando usar</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5">
                            <li>Pipoca em tamanhos diferentes</li>
                            <li>Combos individual ou família</li>
                            <li>Mesmo item com sabores distintos</li>
                          </ul>
                        </div>
                        <p>
                          Se o produto tem preço único, deixe esta aba vazia e use apenas o preço
                          da aba <strong>Geral</strong>.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Fechar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => setVariacaoHelpOpen(false)}>
                      Entendi
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
        {checked ? "Ativo" : "Inativo"}
      </GestaoButton>
    </div>
  );
}
