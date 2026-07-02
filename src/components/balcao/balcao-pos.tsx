import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createBalcaoOrderServer } from "@/lib/api/balcao.functions";
import { fetchColaboradoresServer } from "@/lib/api/colaboradores.functions";
import {
  formatBRL,
  listarClientes,
  listarPedidos,
  listarProdutos,
  type Cliente,
  type Pedido,
  type Produto,
} from "@/lib/db";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { tenantQueryKey } from "@/lib/tenant/query-keys";
import { cn } from "@/lib/utils";

type CarrinhoItem = {
  produto: Produto;
  quantidade: number;
};

type PagamentoParcial = {
  id: string;
  label: string;
  forma: string;
  valor: number;
};

type Step = "venda" | "pagamento";

const PAYMENT_OPTIONS = [
  { id: "dinheiro", label: "Dinheiro", forma: "dinheiro" },
  { id: "credito", label: "Cartão de crédito", forma: "credito" },
  { id: "debito", label: "Cartão de débito", forma: "debito" },
  { id: "pix", label: "Pix", forma: "pix" },
  { id: "vale", label: "Vale / convênio", forma: "vale" },
  { id: "online", label: "Pagamento online", forma: "online" },
] as const;

function nextSaleNumber() {
  return Math.floor(100 + Math.random() * 900);
}

export function BalcaoPos() {
  const qc = useQueryClient();
  const tenantSlug = useTenantSlug();
  const saleCounter = useRef(nextSaleNumber());

  const { data: produtos = [] } = useQuery({
    queryKey: tenantQueryKey("produtos", tenantSlug),
    queryFn: listarProdutos,
  });
  const { data: clientes = [] } = useQuery({
    queryKey: tenantQueryKey("clientes", tenantSlug),
    queryFn: listarClientes,
  });
  const { data: pedidos = [] } = useQuery({
    queryKey: tenantQueryKey("pedidos", tenantSlug),
    queryFn: listarPedidos,
  });
  const { data: colaboradores = [] } = useQuery({
    queryKey: ["colaboradores", tenantSlug],
    queryFn: () => fetchColaboradoresServer({ data: tenantSlug! }),
    enabled: Boolean(tenantSlug),
  });

  const [step, setStep] = useState<Step>("venda");
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<CarrinhoItem[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [vendedorId, setVendedorId] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [usoConsumo, setUsoConsumo] = useState(false);
  const [pagamentos, setPagamentos] = useState<PagamentoParcial[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [saleNumber] = useState(() => saleCounter.current);

  const termo = busca.trim().toLowerCase();

  const produtosFiltrados = useMemo(() => {
    if (!termo) return [];
    return produtos
      .filter(
        (p) =>
          p.ativo &&
          (p.nome.toLowerCase().includes(termo) ||
            p.id.toLowerCase().includes(termo) ||
            String(p.preco).includes(termo)),
      )
      .slice(0, 8);
  }, [produtos, termo]);

  const clientesFiltrados = useMemo(() => {
    if (!termo) return [];
    return clientes
      .filter(
        (c) =>
          c.nome.toLowerCase().includes(termo) ||
          (c.telefone ?? "").includes(termo) ||
          (c.email ?? "").toLowerCase().includes(termo),
      )
      .slice(0, 6);
  }, [clientes, termo]);

  const pedidosFiltrados = useMemo(() => {
    if (!termo) return [];
    return pedidos
      .filter(
        (p) =>
          String(p.numero).includes(termo) ||
          p.observacoes?.toLowerCase().includes(termo),
      )
      .slice(0, 6);
  }, [pedidos, termo]);

  const subtotal = useMemo(
    () => carrinho.reduce((sum, item) => sum + item.produto.preco * item.quantidade, 0),
    [carrinho],
  );
  const total = Math.max(0, subtotal - desconto);
  const quantidadeItens = carrinho.reduce((sum, item) => sum + item.quantidade, 0);
  const totalPago = pagamentos.reduce((sum, p) => sum + p.valor, 0);
  const restante = Math.max(0, total - totalPago);
  const vendaIniciada = carrinho.length > 0;

  function adicionarProduto(produto: Produto) {
    setCarrinho((atual) => {
      const existente = atual.find((item) => item.produto.id === produto.id);
      if (existente) {
        return atual.map((item) =>
          item.produto.id === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item,
        );
      }
      return [...atual, { produto, quantidade: 1 }];
    });
    setBusca("");
  }

  function removerItem(produtoId: string) {
    setCarrinho((atual) => atual.filter((item) => item.produto.id !== produtoId));
  }

  function cancelarVenda() {
    setCarrinho([]);
    setCliente(null);
    setDesconto(0);
    setUsoConsumo(false);
    setPagamentos([]);
    setStep("venda");
    setBusca("");
  }

  function irParaPagamento() {
    if (!carrinho.length) {
      toast.error("Adicione pelo menos um produto.");
      return;
    }
    setPagamentos([]);
    setStep("pagamento");
  }

  function aplicarPagamento(option: (typeof PAYMENT_OPTIONS)[number]) {
    if (restante <= 0) {
      toast.message("Valor já quitado.");
      return;
    }
    setPagamentos((atual) => [
      ...atual,
      {
        id: `${option.id}-${Date.now()}`,
        label: option.label,
        forma: option.forma,
        valor: restante,
      },
    ]);
  }

  async function concluirVenda() {
    if (!carrinho.length) return;
    if (restante > 0.009) {
      toast.error("Selecione um meio de pagamento para quitar o total.");
      return;
    }

    const formaPrincipal = pagamentos[0]?.forma ?? "dinheiro";
    setSalvando(true);
    try {
      await createBalcaoOrderServer({
        data: {
          tenantSlug: tenantSlug!,
          forma_pagamento: formaPrincipal,
          observacoes: [
            `Pedido balcão #${saleNumber}`,
            cliente ? `cliente=${cliente.nome}` : null,
            vendedorId ? `vendedor=${vendedorId}` : null,
            usoConsumo ? "uso_consumo=1" : null,
            desconto > 0 ? `desconto=${desconto.toFixed(2)}` : null,
            pagamentos.length > 1
              ? `pagamentos=${pagamentos.map((p) => `${p.forma}:${p.valor.toFixed(2)}`).join(",")}`
              : null,
          ]
            .filter(Boolean)
            .join("; "),
          itens: carrinho.map((item) => ({
            produto_id: item.produto.id,
            quantidade: item.quantidade,
          })),
        },
      });
      toast.success(`Venda #${saleNumber} registrada com sucesso.`);
      qc.invalidateQueries({ queryKey: tenantQueryKey("pedidos", tenantSlug) });
      qc.invalidateQueries({ queryKey: tenantQueryKey("dashboard", tenantSlug) });
      qc.invalidateQueries({ queryKey: tenantQueryKey("financeiro", tenantSlug) });
      cancelarVenda();
      saleCounter.current = nextSaleNumber();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar a venda.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F6F7F9] text-[#111111]">
      <BalcaoTopBar
        vendedorId={vendedorId}
        onVendedorChange={setVendedorId}
        colaboradores={colaboradores.map((c) => ({ id: c.id, nome: c.nome ?? "Sem nome" }))}
      />

      {step === "pagamento" ? (
        <div className="flex min-h-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col border-r border-[#E5E7EB] bg-white">
            <header className="flex items-center gap-3 border-b border-[#E5E7EB] px-5 py-4">
              <button
                type="button"
                onClick={() => setStep("venda")}
                className="grid size-9 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F6F7F9]"
              >
                <ArrowLeft className="size-5" />
              </button>
              <h2 className="text-lg font-semibold">Meios de pagamento</h2>
            </header>
            <div className="grid flex-1 content-start gap-3 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3">
              {PAYMENT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => aplicarPagamento(option)}
                  className="rounded-xl border border-[#E5E7EB] bg-[#FF9100] px-4 py-8 text-center text-base font-semibold text-white shadow-sm transition hover:bg-[#E68200] active:scale-[0.99]"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
          <ResumoPagamento
            saleNumber={saleNumber}
            cliente={cliente}
            subtotal={subtotal}
            desconto={desconto}
            total={total}
            pagamentos={pagamentos}
            restante={restante}
            salvando={salvando}
            onConcluir={() => void concluirVenda()}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <section className="flex w-[42%] min-w-[320px] flex-col border-r border-[#E5E7EB] bg-white">
            <div className="border-b border-[#E5E7EB] p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Busque produtos, clientes e pedidos de venda"
                  className="h-11 w-full rounded-lg border border-[#E5E7EB] bg-white pl-10 pr-10 text-sm outline-none focus:border-[#FF9100] focus:ring-2 focus:ring-[#FF9100]/20"
                  autoFocus
                />
                {busca ? (
                  <button
                    type="button"
                    onClick={() => setBusca("")}
                    className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-[#FF9100] hover:bg-[#FF9100]/10"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!termo ? (
                <p className="px-2 py-16 text-center text-sm italic text-[#9CA3AF]">
                  Busque pelo nome ou código de um produto, cliente ou pedido.
                </p>
              ) : (
                <div className="space-y-6">
                  {produtosFiltrados.length > 0 ? (
                    <ResultSection title="Produtos">
                      {produtosFiltrados.map((produto) => (
                        <button
                          key={produto.id}
                          type="button"
                          onClick={() => adicionarProduto(produto)}
                          className="flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-3 text-left transition hover:border-[#FF9100]/30 hover:bg-[#FF9100]/5"
                        >
                          <span className="text-sm font-medium">{produto.nome}</span>
                          <span className="text-sm font-semibold text-[#FF9100]">
                            {formatBRL(produto.preco)}
                          </span>
                        </button>
                      ))}
                    </ResultSection>
                  ) : null}

                  {clientesFiltrados.length > 0 ? (
                    <ResultSection title="Clientes">
                      {clientesFiltrados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCliente(c);
                            setBusca("");
                          }}
                          className="w-full rounded-lg px-3 py-3 text-left transition hover:bg-[#F6F7F9]"
                        >
                          <p className="text-sm font-medium">{c.nome}</p>
                          <p className="text-xs text-[#6B7280]">
                            {[c.telefone, c.email].filter(Boolean).join(" · ") || "Sem contato"}
                          </p>
                        </button>
                      ))}
                    </ResultSection>
                  ) : null}

                  {pedidosFiltrados.length > 0 ? (
                    <ResultSection title="Pedidos de venda">
                      {pedidosFiltrados.map((pedido) => (
                        <PedidoResult key={pedido.id} pedido={pedido} />
                      ))}
                    </ResultSection>
                  ) : null}

                  {produtosFiltrados.length === 0 &&
                  clientesFiltrados.length === 0 &&
                  pedidosFiltrados.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[#6B7280]">
                      Nenhum resultado para &quot;{busca}&quot;.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-w-0 flex-1 flex-col bg-white">
            <header className="flex flex-wrap items-center gap-3 border-b border-[#E5E7EB] px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold">
                  {vendaIniciada ? `Venda: #${saleNumber}` : "Venda não iniciada"}
                </p>
                {cliente ? (
                  <p className="mt-1 text-sm text-[#6B7280]">
                    Cliente:{" "}
                    <span className="rounded bg-[#FF9100]/10 px-2 py-0.5 text-xs font-medium text-[#C45A00]">
                      {cliente.nome}
                    </span>
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-[#6B7280]">
                  <input
                    type="checkbox"
                    checked={usoConsumo}
                    onChange={(e) => setUsoConsumo(e.target.checked)}
                    className="rounded border-[#D1D5DB] text-[#FF9100] focus:ring-[#FF9100]"
                  />
                  Venda para uso ou consumo
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const valor = window.prompt("Desconto em reais (ex: 5.00):", String(desconto));
                    if (valor === null) return;
                    const n = Number(valor.replace(",", "."));
                    if (Number.isFinite(n) && n >= 0) setDesconto(n);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#F6F7F9]"
                >
                  Desconto
                  <ChevronDown className="size-3.5" />
                </button>
                {vendaIniciada ? (
                  <button
                    type="button"
                    onClick={cancelarVenda}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              {!vendaIniciada ? (
                <p className="px-6 py-20 text-center text-sm text-[#9CA3AF]">
                  Quando você lançar um item na busca ao lado ele será exibido aqui.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-[#E5E7EB] bg-[#FAFAFA] text-left text-xs uppercase tracking-wide text-[#6B7280]">
                    <tr>
                      <th className="px-5 py-3 w-16">#</th>
                      <th className="px-5 py-3">Item</th>
                      <th className="px-5 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carrinho.map((item, index) => (
                      <tr key={item.produto.id} className="border-b border-[#F3F4F6]">
                        <td className="px-5 py-4">
                          <span className="inline-flex min-w-[2.5rem] justify-center rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                            {String(index + 1).padStart(4, "0").slice(-4)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => removerItem(item.produto.id)}
                            className="text-left"
                          >
                            <p className="font-medium">{item.produto.nome}</p>
                            <p className="text-xs text-[#6B7280]">
                              {item.quantidade} UN x {formatBRL(item.produto.preco)}
                            </p>
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right font-semibold">
                          {formatBRL(item.produto.preco * item.quantidade)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <footer className="border-t border-[#E5E7EB] bg-[#FAFAFA]">
              <div className="grid grid-cols-2 gap-4 px-5 py-4 text-sm sm:grid-cols-4 lg:grid-cols-6">
                <FooterStat label="Itens" value={String(carrinho.length)} />
                <FooterStat label="Quantidade" value={String(quantidadeItens)} />
                <FooterStat label="Descontos" value={formatBRL(desconto)} highlight />
                <FooterStat label="Subtotal" value={formatBRL(subtotal)} />
              </div>
              <button
                type="button"
                onClick={irParaPagamento}
                disabled={!vendaIniciada}
                className="flex w-full items-center justify-between bg-[#111111] px-6 py-4 text-left transition enabled:hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="text-base font-semibold text-white">Finalizar venda</span>
                <span className="text-xl font-bold text-[#FF9100]">{formatBRL(total)}</span>
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function BalcaoTopBar({
  vendedorId,
  onVendedorChange,
  colaboradores,
}: {
  vendedorId: string;
  onVendedorChange: (id: string) => void;
  colaboradores: { id: string; nome: string }[];
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#E5E7EB] bg-white px-4 py-2.5 text-sm">
      <TopSelect
        label="Vendedor"
        value={vendedorId}
        onChange={onVendedorChange}
        options={[
          { value: "", label: "(nenhum)" },
          ...colaboradores.map((c) => ({ value: c.id, label: c.nome })),
        ]}
      />
      <TopSelect
        label="Tabela de preço"
        value="padrao"
        onChange={() => undefined}
        options={[{ value: "padrao", label: "Padrão" }]}
      />
      <TopSelect
        label="Local de estoque"
        value="loja"
        onChange={() => undefined}
        options={[{ value: "loja", label: "Loja principal" }]}
      />
      <TopSelect
        label="Tipo de venda"
        value="presencial"
        onChange={() => undefined}
        options={[{ value: "presencial", label: "Presencial" }]}
      />
      <button
        type="button"
        className="ml-auto inline-flex items-center gap-1 text-[#FF9100] hover:underline"
      >
        Outras ações
        <MoreHorizontal className="size-4" />
      </button>
    </header>
  );
}

function TopSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[#6B7280]">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer border-none bg-transparent pr-5 text-sm font-medium text-[#FF9100] outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="-ml-4 size-3.5 text-[#FF9100]" />
    </label>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
        {title}
      </p>
      <div className="divide-y divide-[#F3F4F6] rounded-lg border border-[#E5E7EB]">{children}</div>
    </div>
  );
}

function PedidoResult({ pedido }: { pedido: Pedido }) {
  return (
    <div className="flex items-center justify-between px-3 py-3">
      <div>
        <p className="text-sm font-medium">
          Pedido #{pedido.numero} —{" "}
          {new Date(pedido.created_at).toLocaleDateString("pt-BR")}
        </p>
        <p className="text-xs capitalize text-[#6B7280]">
          {pedido.canal} · {pedido.status}
        </p>
      </div>
      <span className="text-sm font-semibold">{formatBRL(pedido.total)}</span>
    </div>
  );
}

function FooterStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">{label}</p>
      <p className={cn("font-semibold", highlight ? "text-emerald-600" : "text-[#111111]")}>
        {value}
      </p>
    </div>
  );
}

function ResumoPagamento({
  saleNumber,
  cliente,
  subtotal,
  desconto,
  total,
  pagamentos,
  restante,
  salvando,
  onConcluir,
}: {
  saleNumber: number;
  cliente: Cliente | null;
  subtotal: number;
  desconto: number;
  total: number;
  pagamentos: PagamentoParcial[];
  restante: number;
  salvando: boolean;
  onConcluir: () => void;
}) {
  return (
    <aside className="flex w-[min(420px,38%)] shrink-0 flex-col border-l border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] px-5 py-4">
        <p className="text-base font-bold">Venda: #{saleNumber}</p>
        {cliente ? (
          <p className="mt-2 text-sm text-[#6B7280]">
            Cliente:{" "}
            <span className="rounded bg-[#FF9100]/10 px-2 py-0.5 text-xs font-medium text-[#C45A00]">
              {cliente.nome}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
        <div className="flex justify-between border-b border-[#F3F4F6] pb-3">
          <span className="text-[#6B7280]">Subtotal</span>
          <span className="font-medium">{formatBRL(subtotal)}</span>
        </div>
        {desconto > 0 ? (
          <div className="flex justify-between text-emerald-600">
            <span>Descontos</span>
            <span>- {formatBRL(desconto)}</span>
          </div>
        ) : null}
        {pagamentos.map((p) => (
          <div key={p.id} className="flex justify-between text-emerald-600">
            <span>{p.label}</span>
            <span>{formatBRL(p.valor)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-[#E5E7EB] pt-4 text-base font-bold">
          <span>Total a pagar</span>
          <span>{formatBRL(restante)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onConcluir}
        disabled={salvando || restante > 0.009}
        className="m-4 rounded-lg border-2 border-[#FF9100] bg-[#FF9100] px-4 py-3.5 text-sm font-semibold text-white transition enabled:hover:bg-[#E68200] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {salvando ? "Processando..." : "Concluir e registrar venda"}
      </button>
    </aside>
  );
}
