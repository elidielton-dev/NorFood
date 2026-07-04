import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  Eraser,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Minus,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { usePainelNavigate } from "@/lib/painel/use-painel-navigate";
import { toast } from "sonner";
import { fetchColaboradoresServer } from "@/lib/api/colaboradores.functions";
import {
  createOmnichannelOrderServer,
  fetchBairrosEntregaPdvServer,
  fetchUltimoPedidoClienteServer,
  listClienteEnderecosServer,
  resolveDeliveryTaxaServer,
  saveClienteEnderecoServer,
  type ClienteEnderecoRow,
  type ClienteOmnichannelResult,
  type ModoVenda,
  type OrigemVenda,
} from "@/lib/api/omnichannel-order.functions";
import {
  addMesaOrderItemsServer,
  finalizeMesaOrderServer,
  listMesaPedidoItensServer,
  openMesaOrderServer,
} from "@/lib/api/mesas.functions";
import {
  formatBRL,
  listarClientes,
  listarPedidos,
  listarProdutos,
  type Pedido,
  type PedidoItem,
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

export type BalcaoPosMesaContext = {
  mesaId: string;
  mesaNumero: number;
  pedidoId?: string | null;
  pedidoNumero?: number | null;
  pedidoTotal?: number;
  mesasVinculadas?: number[];
};

export type BalcaoOmnichannelPrefill = {
  origem?: OrigemVenda;
  conversationId?: string;
  phone?: string;
  name?: string;
  clienteId?: string;
  wabaContactId?: string;
  modo?: ModoVenda;
};

export type BalcaoPosProps = {
  embedded?: boolean;
  mesa?: BalcaoPosMesaContext | null;
  prefill?: BalcaoOmnichannelPrefill | null;
  onClose?: () => void;
  onMesaUpdated?: () => void;
};

export function BalcaoPos({
  embedded = false,
  mesa = null,
  prefill = null,
  onClose,
  onMesaUpdated,
}: BalcaoPosProps = {}) {
  const qc = useQueryClient();
  const tenantSlug = useTenantSlug();
  const saleCounter = useRef(nextSaleNumber());
  const mesaMode = Boolean(mesa);

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
  const [vendedorId, setVendedorId] = useState("");
  const [desconto, setDesconto] = useState(0);
  const [usoConsumo, setUsoConsumo] = useState(false);
  const [pagamentos, setPagamentos] = useState<PagamentoParcial[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [saleNumber] = useState(() => saleCounter.current);
  const [localPedidoId, setLocalPedidoId] = useState<string | null>(null);
  const [pagarNaEntrega, setPagarNaEntrega] = useState(true);
  const [cliente, setCliente] = useState<ClienteOmnichannelResult | null>(null);
  const [modoVenda, setModoVenda] = useState<ModoVenda>("presencial");
  const [origemVenda, setOrigemVenda] = useState<OrigemVenda>("balcao");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [endereco, setEndereco] = useState<ClienteEnderecoRow | null>(null);
  const [taxaEntrega, setTaxaEntrega] = useState(0);
  const [formEndereco, setFormEndereco] = useState({
    endereco: "",
    numero: "",
    bairro: "",
  });
  const [salvandoEndereco, setSalvandoEndereco] = useState(false);
  const [observacaoPedido, setObservacaoPedido] = useState("");
  const [repetindoPedido, setRepetindoPedido] = useState(false);

  useEffect(() => {
    if (!prefill || mesaMode) return;
    if (prefill.name || prefill.phone) {
      setCliente({
        id: prefill.clienteId
          ? `profile:${prefill.clienteId}`
          : `waba:${prefill.wabaContactId ?? "wa"}`,
        tipo: prefill.clienteId ? "profile" : "waba",
        nome: prefill.name ?? prefill.phone ?? "Cliente",
        telefone: prefill.phone ?? null,
        email: null,
        cliente_id: prefill.clienteId ?? null,
        waba_contact_id: prefill.wabaContactId ?? null,
        pontos: null,
      });
    }
    setModoVenda(prefill.modo ?? "delivery");
    setOrigemVenda(prefill.origem ?? "whatsapp");
    setConversationId(prefill.conversationId ?? null);
  }, [
    mesaMode,
    prefill?.conversationId,
    prefill?.phone,
    prefill?.name,
    prefill?.clienteId,
    prefill?.wabaContactId,
    prefill?.modo,
    prefill?.origem,
  ]);

  const { data: enderecosCliente = [] } = useQuery({
    queryKey: [
      "cliente-enderecos",
      tenantSlug,
      cliente?.cliente_id,
      cliente?.waba_contact_id,
      cliente?.telefone,
    ],
    queryFn: () =>
      listClienteEnderecosServer({
        data: {
          tenantSlug: tenantSlug!,
          clienteId: cliente?.cliente_id,
          wabaContactId: cliente?.waba_contact_id,
          telefone: cliente?.telefone,
        },
      }),
    enabled: !mesaMode && modoVenda === "delivery" && Boolean(cliente) && Boolean(tenantSlug),
  });

  const { data: bairros = [] } = useQuery({
    queryKey: tenantQueryKey("bairros-pdv", tenantSlug),
    queryFn: () => fetchBairrosEntregaPdvServer({ data: tenantSlug! }),
    enabled: !mesaMode && modoVenda === "delivery" && Boolean(tenantSlug),
  });

  useEffect(() => {
    if (modoVenda !== "delivery") {
      setEndereco(null);
      setTaxaEntrega(0);
      setFormEndereco({ endereco: "", numero: "", bairro: "" });
      return;
    }
    if (enderecosCliente.length > 0) {
      const padrao = enderecosCliente.find((e) => e.is_default) ?? enderecosCliente[0];
      setEndereco(padrao);
    } else {
      setEndereco(null);
    }
  }, [modoVenda, enderecosCliente]);

  const bairroAtivo = endereco?.bairro || formEndereco.bairro;

  useEffect(() => {
    if (modoVenda !== "delivery" || !bairroAtivo || !tenantSlug) {
      if (modoVenda !== "delivery") setTaxaEntrega(0);
      return;
    }
    let cancelled = false;
    void resolveDeliveryTaxaServer({
      data: { tenantSlug, bairro: bairroAtivo },
    }).then((r) => {
      if (!cancelled) setTaxaEntrega(r.taxa);
    });
    return () => {
      cancelled = true;
    };
  }, [modoVenda, bairroAtivo, tenantSlug]);

  const activePedidoId = useMemo(() => {
    if (!mesa) return null;
    if (localPedidoId) return localPedidoId;
    if (mesa.pedidoId) return mesa.pedidoId;
    const pedido = pedidos.find(
      (p) =>
        p.mesa_id === mesa.mesaId &&
        p.status !== "entregue" &&
        p.status !== "cancelado",
    );
    return pedido?.id ?? null;
  }, [mesa, pedidos, localPedidoId]);

  useEffect(() => {
    if (!mesa) return;
    setStep("venda");
    setCarrinho([]);
    setBusca("");
    setPagamentos([]);
    setDesconto(0);
  }, [mesa?.mesaId]);

  useEffect(() => {
    if (!mesa?.pedidoId) return;
    setLocalPedidoId((atual) => atual ?? mesa.pedidoId!);
  }, [mesa?.pedidoId, mesa?.mesaId]);

  const { data: itensConta = [] } = useQuery({
    queryKey: ["itens-mesa", activePedidoId, tenantSlug],
    queryFn: () =>
      listMesaPedidoItensServer({
        data: { pedidoId: activePedidoId!, tenantSlug: tenantSlug! },
      }) as Promise<PedidoItem[]>,
    enabled: mesaMode && Boolean(activePedidoId) && Boolean(tenantSlug),
  });

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
  const totalContaExistente = useMemo(
    () =>
      itensConta.reduce(
        (sum, item) => sum + Number(item.quantidade) * Number(item.preco_unitario),
        0,
      ),
    [itensConta],
  );
  const taxaEntregaOmni = !mesaMode && modoVenda === "delivery" ? taxaEntrega : 0;
  const total = Math.max(
    0,
    (mesaMode ? totalContaExistente : 0) + subtotal - desconto + taxaEntregaOmni,
  );
  const quantidadeItens = carrinho.reduce((sum, item) => sum + item.quantidade, 0);
  const totalPago = pagamentos.reduce((sum, p) => sum + p.valor, 0);
  const restante = Math.max(0, total - totalPago);
  const vendaIniciada = carrinho.length > 0 || (mesaMode && itensConta.length > 0);
  const tituloVenda = mesaMode
    ? `Mesa #${mesa!.mesaNumero}${mesa!.mesasVinculadas?.length ? ` + ${mesa!.mesasVinculadas.join(", ")}` : ""}`
    : vendaIniciada
      ? `Venda: #${saleNumber}`
      : "Venda não iniciada";
  const pedidoLabel = activePedidoId
    ? mesa?.pedidoNumero
      ? `Pedido #${mesa.pedidoNumero}`
      : pedidos.find((p) => p.id === activePedidoId)
        ? `Pedido #${pedidos.find((p) => p.id === activePedidoId)!.numero}`
        : "Conta aberta"
    : null;

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

  function alterarQuantidade(produtoId: string, delta: number) {
    setCarrinho((atual) =>
      atual
        .map((item) =>
          item.produto.id === produtoId
            ? { ...item, quantidade: item.quantidade + delta }
            : item,
        )
        .filter((item) => item.quantidade > 0),
    );
  }

  function definirQuantidade(produtoId: string, quantidade: number) {
    const qtd = Math.floor(quantidade);
    if (!Number.isFinite(qtd)) return;
    if (qtd <= 0) {
      removerItem(produtoId);
      return;
    }
    setCarrinho((atual) =>
      atual.map((item) =>
        item.produto.id === produtoId ? { ...item, quantidade: qtd } : item,
      ),
    );
  }

  function cancelarVenda() {
    setCarrinho([]);
    setCliente(null);
    setEndereco(null);
    setTaxaEntrega(0);
    setFormEndereco({ endereco: "", numero: "", bairro: "" });
    setDesconto(0);
    setUsoConsumo(false);
    setPagamentos([]);
    setObservacaoPedido("");
    setStep("venda");
    setBusca("");
    if (!prefill) {
      setModoVenda("presencial");
      setOrigemVenda("balcao");
      setConversationId(null);
    }
  }

  function limparVenda() {
    cancelarVenda();
    toast.message("Venda limpa.");
  }

  function editarObservacao() {
    const valor = window.prompt(
      "Observação do pedido (cozinha / entrega):",
      observacaoPedido,
    );
    if (valor === null) return;
    setObservacaoPedido(valor.trim());
    toast.success(valor.trim() ? "Observação salva." : "Observação removida.");
  }

  async function repetirUltimoPedido() {
    if (!cliente || !tenantSlug) {
      toast.error("Selecione um cliente para repetir o último pedido.");
      return;
    }
    setRepetindoPedido(true);
    try {
      const data = await fetchUltimoPedidoClienteServer({
        data: {
          tenantSlug,
          clienteId: cliente.cliente_id,
          telefone: cliente.telefone,
        },
      });
      if (!data?.itens?.length) {
        toast.message("Nenhum pedido anterior encontrado para este cliente.");
        return;
      }
      setCarrinho((atual) => {
        const next = atual.map((item) => ({ ...item }));
        for (const item of data.itens) {
          const produto = produtos.find((p) => p.id === item.produto_id);
          if (!produto) continue;
          const existente = next.find((i) => i.produto.id === produto.id);
          if (existente) {
            existente.quantidade += item.quantidade;
          } else {
            next.push({ produto, quantidade: item.quantidade });
          }
        }
        return next;
      });
      toast.success(`Pedido #${data.pedido.numero} adicionado ao carrinho.`);
    } catch {
      toast.error("Não foi possível repetir o último pedido.");
    } finally {
      setRepetindoPedido(false);
    }
  }

  async function garantirEnderecoDelivery(): Promise<ClienteEnderecoRow | null> {
    if (endereco) return endereco;
    if (!cliente || !tenantSlug) return null;
    if (!formEndereco.endereco.trim() || !formEndereco.bairro.trim()) return null;

    setSalvandoEndereco(true);
    try {
      const salvo = await saveClienteEnderecoServer({
        data: {
          tenantSlug,
          clienteId: cliente.cliente_id,
          wabaContactId: cliente.waba_contact_id,
          telefone: cliente.telefone,
          endereco: formEndereco.endereco.trim(),
          numero: formEndereco.numero.trim() || null,
          bairro: formEndereco.bairro.trim(),
          isDefault: true,
        },
      });
      setEndereco(salvo);
      setFormEndereco({ endereco: "", numero: "", bairro: "" });
      qc.invalidateQueries({ queryKey: ["cliente-enderecos"] });
      return salvo;
    } catch {
      toast.error("Não foi possível salvar o endereço.");
      return null;
    } finally {
      setSalvandoEndereco(false);
    }
  }

  function validarPedidoOmnichannel() {
    if (modoVenda === "delivery") {
      if (!cliente) {
        toast.error("Busque e selecione o cliente para delivery.");
        return false;
      }
      if (!endereco && (!formEndereco.endereco.trim() || !formEndereco.bairro.trim())) {
        toast.error("Informe o endereço e selecione o bairro de entrega.");
        return false;
      }
    }
    if (modoVenda === "retirada" && !cliente) {
      toast.error("Busque e selecione o cliente para retirada.");
      return false;
    }
    return true;
  }

  async function registrarPedidoOmnichannel(pagoNoBalcao: boolean) {
    const formaPrincipal = pagamentos[0]?.forma ?? "dinheiro";
    const clienteNome = cliente?.nome ?? "Consumidor balcão";

    let enderecoPedido = endereco;
    if (modoVenda === "delivery") {
      enderecoPedido = await garantirEnderecoDelivery();
      if (!enderecoPedido) {
        toast.error("Informe o endereço e selecione o bairro de entrega.");
        return null;
      }
    }

    const pedido = await createOmnichannelOrderServer({
      data: {
        tenantSlug: tenantSlug!,
        modo: modoVenda,
        origem: origemVenda,
        forma_pagamento: formaPrincipal,
        troco_para: null,
        desconto,
        pago_no_balcao: pagoNoBalcao,
        vendedor_id: vendedorId || null,
        uso_consumo: usoConsumo,
        whatsapp_chat_id: conversationId,
        cliente: {
          cliente_id: cliente?.cliente_id ?? null,
          waba_contact_id: cliente?.waba_contact_id ?? null,
          nome: clienteNome,
          telefone: cliente?.telefone ?? null,
          email: cliente?.email ?? null,
        },
        endereco:
          modoVenda === "delivery" && enderecoPedido
            ? {
                endereco_id: enderecoPedido.id,
                endereco: enderecoPedido.endereco,
                numero: enderecoPedido.numero,
                complemento: enderecoPedido.complemento,
                bairro: enderecoPedido.bairro,
                cidade: enderecoPedido.cidade,
                estado: enderecoPedido.estado,
                cep: enderecoPedido.cep,
                referencia: enderecoPedido.referencia,
                latitude: enderecoPedido.latitude,
                longitude: enderecoPedido.longitude,
              }
            : undefined,
        observacoes_extra: [
          `Pedido PDV #${saleNumber}`,
          observacaoPedido ? `obs=${observacaoPedido}` : null,
        ]
          .filter(Boolean)
          .join("; "),
        itens: carrinho.map((item) => ({
          produto_id: item.produto.id,
          quantidade: item.quantidade,
        })),
      },
    });

    const msg =
      modoVenda === "delivery"
        ? `Pedido #${pedido.numero} enviado para delivery.`
        : modoVenda === "retirada"
          ? `Pedido #${pedido.numero} registrado para retirada.`
          : `Venda #${saleNumber} registrada com sucesso.`;

    toast.success(msg);
    qc.invalidateQueries({ queryKey: tenantQueryKey("pedidos", tenantSlug) });
    qc.invalidateQueries({ queryKey: tenantQueryKey("dashboard", tenantSlug) });
    qc.invalidateQueries({ queryKey: tenantQueryKey("financeiro", tenantSlug) });
    qc.invalidateQueries({ queryKey: ["delivery-panel-real", tenantSlug] });
    cancelarVenda();
    saleCounter.current = nextSaleNumber();
    return pedido;
  }

  function irParaPagamento() {
    if (mesaMode) {
      if (!activePedidoId && !carrinho.length) {
        toast.error("Adicione produtos antes de abrir a mesa.");
        return;
      }
      void (async () => {
        if (!activePedidoId && carrinho.length) {
          const ok = await abrirMesa();
          if (!ok) return;
        } else if (activePedidoId && carrinho.length) {
          const ok = await adicionarItensMesa();
          if (!ok) return;
        }
        setPagamentos([]);
        setStep("pagamento");
      })();
      return;
    }

    if (!carrinho.length) {
      toast.error("Adicione pelo menos um produto.");
      return;
    }

    if (!mesaMode && (modoVenda === "delivery" || modoVenda === "retirada")) {
      if (!validarPedidoOmnichannel()) return;
      if (pagarNaEntrega && modoVenda === "delivery") {
        void (async () => {
          setSalvando(true);
          try {
            await registrarPedidoOmnichannel(false);
          } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Não foi possível enviar o pedido.");
          } finally {
            setSalvando(false);
          }
        })();
        return;
      }
    }

    setPagamentos([]);
    setStep("pagamento");
  }

  async function abrirMesa() {
    if (!mesa || !carrinho.length) return false;
    const carrinhoAtual = carrinho;
    setSalvando(true);
    try {
      const pedido = await openMesaOrderServer({
        data: {
          mesaId: mesa.mesaId,
          tenantSlug: tenantSlug!,
          forma_pagamento: pagamentos[0]?.forma ?? "pix",
          observacoes: `Mesa ${mesa.mesaNumero}`,
          itens: carrinhoAtual.map((item) => ({
            produto_id: item.produto.id,
            quantidade: item.quantidade,
            preco_unitario: item.produto.preco,
          })),
        },
      });

      const itensOtimistas: PedidoItem[] = carrinhoAtual.map((item, index) => ({
        id: `otimista-${index}`,
        pedido_id: pedido.id,
        produto_id: item.produto.id,
        quantidade: item.quantidade,
        preco_unitario: item.produto.preco,
        observacao: null,
        produtos: { nome: item.produto.nome, imagem_url: item.produto.imagem_url ?? null },
      }));

      setLocalPedidoId(pedido.id);
      qc.setQueryData(["itens-mesa", pedido.id, tenantSlug], itensOtimistas);
      setCarrinho([]);
      toast.success(`Mesa ${mesa.mesaNumero} aberta com sucesso.`);

      await Promise.all([
        qc.refetchQueries({ queryKey: tenantQueryKey("pedidos", tenantSlug) }),
        qc.fetchQuery({
          queryKey: ["itens-mesa", pedido.id, tenantSlug],
          queryFn: () =>
            listMesaPedidoItensServer({
              data: { pedidoId: pedido.id, tenantSlug: tenantSlug! },
            }) as Promise<PedidoItem[]>,
        }),
      ]);
      qc.invalidateQueries({ queryKey: tenantQueryKey("mesas", tenantSlug) });
      onMesaUpdated?.();
      return true;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a mesa.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarItensMesa() {
    if (!mesa || !activePedidoId || !carrinho.length) return false;
    setSalvando(true);
    try {
      await addMesaOrderItemsServer({
        data: {
          mesaId: mesa.mesaId,
          pedidoId: activePedidoId,
          tenantSlug: tenantSlug!,
          itens: carrinho.map((item) => ({
            produto_id: item.produto.id,
            quantidade: item.quantidade,
          })),
        },
      });
      setCarrinho([]);
      toast.success("Itens adicionados à conta da mesa.");
      await qc.fetchQuery({
        queryKey: ["itens-mesa", activePedidoId, tenantSlug],
        queryFn: () =>
          listMesaPedidoItensServer({
            data: { pedidoId: activePedidoId!, tenantSlug: tenantSlug! },
          }) as Promise<PedidoItem[]>,
      });
      qc.invalidateQueries({ queryKey: tenantQueryKey("pedidos", tenantSlug) });
      onMesaUpdated?.();
      return true;
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar os itens.");
      return false;
    } finally {
      setSalvando(false);
    }
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
    if (mesaMode) {
      if (!mesa || !activePedidoId) return;
      if (restante > 0.009) {
        toast.error("Selecione um meio de pagamento para quitar o total.");
        return;
      }
      setSalvando(true);
      try {
        await finalizeMesaOrderServer({
          data: {
            mesaId: mesa.mesaId,
            pedidoId: activePedidoId,
            tenantSlug: tenantSlug!,
          },
        });
        toast.success(`Mesa ${mesa.mesaNumero} finalizada e liberada.`);
        qc.invalidateQueries({ queryKey: tenantQueryKey("mesas", tenantSlug) });
        qc.invalidateQueries({ queryKey: tenantQueryKey("pedidos", tenantSlug) });
        qc.invalidateQueries({ queryKey: tenantQueryKey("dashboard", tenantSlug) });
        qc.invalidateQueries({ queryKey: tenantQueryKey("financeiro", tenantSlug) });
        cancelarVenda();
        setLocalPedidoId(null);
        onMesaUpdated?.();
        onClose?.();
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Não foi possível finalizar a mesa.");
      } finally {
        setSalvando(false);
      }
      return;
    }

    if (!carrinho.length) return;
    if (restante > 0.009) {
      toast.error("Selecione um meio de pagamento para quitar o total.");
      return;
    }
    if (!validarPedidoOmnichannel()) return;

    setSalvando(true);
    try {
      await registrarPedidoOmnichannel(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível finalizar a venda.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-[#F6F7F9] text-[#111111]",
        embedded ? "h-full" : "h-full",
      )}
    >
      {embedded ? (
        <div className="flex shrink-0 items-center border-b border-[#E5E7EB] bg-white px-4 py-2 pr-12">
          <p className="text-sm font-semibold">{tituloVenda}</p>
        </div>
      ) : null}

      {!embedded ? (
        <BalcaoTopBar
          vendedorId={vendedorId}
          onVendedorChange={setVendedorId}
          modoVenda={modoVenda}
          onModoVendaChange={setModoVenda}
          colaboradores={colaboradores.map((c) => ({ id: c.id, nome: c.nome ?? "Sem nome" }))}
          hasCliente={Boolean(cliente)}
          conversationId={conversationId}
          observacaoPedido={observacaoPedido}
          repetindoPedido={repetindoPedido}
          onLimparVenda={limparVenda}
          onRepetirUltimoPedido={() => void repetirUltimoPedido()}
          onEditarObservacao={editarObservacao}
        />
      ) : null}

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
                  className="rounded-2xl border border-[#FF9100]/20 bg-[#FF9100] px-4 py-8 text-center text-base font-semibold text-white shadow-md shadow-[#FF9100]/20 transition hover:-translate-y-0.5 hover:bg-[#E68200] hover:shadow-lg active:scale-[0.99]"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
          <ResumoPagamento
            saleNumber={saleNumber}
            titulo={tituloVenda}
            clienteNome={cliente?.nome ?? null}
            subtotal={mesaMode ? total : subtotal}
            desconto={desconto}
            taxaEntrega={taxaEntregaOmni}
            total={total}
            pagamentos={pagamentos}
            restante={restante}
            salvando={salvando}
            concluirLabel={
              mesaMode
                ? "Concluir e liberar mesa"
                : modoVenda === "delivery"
                  ? "Concluir e enviar delivery"
                  : modoVenda === "retirada"
                    ? "Concluir retirada"
                    : "Concluir e registrar venda"
            }
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
                          className="flex w-full items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#FF9100]/40 hover:shadow-md"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#FFF7ED] text-[#FF9100]">
                            <Package className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 text-sm font-medium text-[#111111]">
                            {produto.nome}
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-[#FF9100]">
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
                            setCliente({
                              id: `profile:${c.id}`,
                              tipo: "profile",
                              nome: c.nome,
                              telefone: c.telefone,
                              email: c.email ?? null,
                              cliente_id: c.id,
                              waba_contact_id: null,
                              pontos: c.pontos_fidelidade ?? null,
                            });
                            setBusca("");
                          }}
                          className="flex w-full items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#FF9100]/40 hover:shadow-md"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F3F4F6] text-[#6B7280]">
                            <UserRound className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#111111]">{c.nome}</p>
                            <p className="truncate text-xs text-[#6B7280]">
                              {[c.telefone, c.email].filter(Boolean).join(" · ") || "Sem contato"}
                            </p>
                          </span>
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
                <p className="text-base font-bold">{tituloVenda}</p>
                {pedidoLabel ? (
                  <p className="mt-1 text-sm text-[#6B7280]">
                    {pedidoLabel}
                    {mesaMode && totalContaExistente > 0 ? (
                      <span className="ml-2 font-medium text-[#111111]">
                        · Conta: {formatBRL(totalContaExistente)}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {cliente ? (
                  <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-xl border border-[#FF9100]/20 bg-[#FFF7ED] px-3 py-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-[#FF9100] shadow-sm">
                      <UserRound className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#C45A00]">{cliente.nome}</p>
                      {cliente.telefone ? (
                        <p className="truncate text-[11px] text-[#9A3412]/80">{cliente.telefone}</p>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCliente(null);
                        setEndereco(null);
                        setFormEndereco({ endereco: "", numero: "", bairro: "" });
                      }}
                      className="ml-1 grid size-6 shrink-0 place-items-center rounded-full text-[#C45A00] hover:bg-[#FF9100]/15"
                      aria-label="Remover cliente"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : null}
                {observacaoPedido ? (
                  <p className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-lg bg-[#F3F4F6] px-2.5 py-1.5 text-xs text-[#6B7280]">
                    <MessageSquareText className="mt-0.5 size-3.5 shrink-0" />
                    <span className="line-clamp-2">{observacaoPedido}</span>
                  </p>
                ) : null}
                {!mesaMode && modoVenda === "delivery" && cliente ? (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
                    <div className="flex items-center gap-2 border-b border-[#F3F4F6] bg-[#FAFAFA] px-3.5 py-2.5">
                      <span className="grid size-7 place-items-center rounded-lg bg-[#FFF7ED] text-[#FF9100]">
                        <MapPin className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-[#6B7280]">
                          Entrega
                        </p>
                        {taxaEntrega > 0 ? (
                          <p className="text-xs font-semibold text-[#111111]">
                            Taxa {formatBRL(taxaEntrega)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3 p-3.5">
                      {enderecosCliente.length > 0 ? (
                        <label className="block space-y-1.5">
                          <span className="text-[11px] font-medium text-[#6B7280]">
                            Endereço salvo
                          </span>
                          <select
                            value={endereco?.id ?? ""}
                            onChange={(e) => {
                              const id = e.target.value;
                              if (!id) {
                                setEndereco(null);
                                return;
                              }
                              const escolhido =
                                enderecosCliente.find((item) => item.id === id) ?? null;
                              setEndereco(escolhido);
                            }}
                            className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] px-3 text-sm text-[#111111] outline-none transition focus:border-[#FF9100] focus:bg-white focus:ring-2 focus:ring-[#FF9100]/15"
                          >
                            <option value="">Novo endereço</option>
                            {enderecosCliente.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.endereco}
                                {item.numero ? `, ${item.numero}` : ""} — {item.bairro}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {!endereco ? (
                        <div className="grid gap-2 sm:grid-cols-[1.4fr_0.55fr_1fr]">
                          <label className="block space-y-1.5">
                            <span className="text-[11px] font-medium text-[#6B7280]">Rua</span>
                            <input
                              value={formEndereco.endereco}
                              onChange={(e) =>
                                setFormEndereco((atual) => ({
                                  ...atual,
                                  endereco: e.target.value,
                                }))
                              }
                              placeholder="Rua / avenida"
                              className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] px-3 text-sm outline-none transition focus:border-[#FF9100] focus:bg-white focus:ring-2 focus:ring-[#FF9100]/15"
                            />
                          </label>
                          <label className="block space-y-1.5">
                            <span className="text-[11px] font-medium text-[#6B7280]">Nº</span>
                            <input
                              value={formEndereco.numero}
                              onChange={(e) =>
                                setFormEndereco((atual) => ({ ...atual, numero: e.target.value }))
                              }
                              placeholder="Nº"
                              className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] px-3 text-sm outline-none transition focus:border-[#FF9100] focus:bg-white focus:ring-2 focus:ring-[#FF9100]/15"
                            />
                          </label>
                          <label className="block space-y-1.5">
                            <span className="text-[11px] font-medium text-[#6B7280]">Bairro</span>
                            <select
                              value={formEndereco.bairro}
                              onChange={(e) =>
                                setFormEndereco((atual) => ({ ...atual, bairro: e.target.value }))
                              }
                              className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] px-3 text-sm outline-none transition focus:border-[#FF9100] focus:bg-white focus:ring-2 focus:ring-[#FF9100]/15"
                            >
                              <option value="">Selecione</option>
                              {bairros.map((bairro) => (
                                <option key={bairro.id} value={bairro.nome}>
                                  {bairro.nome} ({formatBRL(bairro.taxa)})
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-[#F3F4F6] bg-[#FAFAFA] px-3 py-2.5">
                          <p className="text-sm font-medium text-[#111111]">
                            {endereco.endereco}
                            {endereco.numero ? `, ${endereco.numero}` : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-[#6B7280]">{endereco.bairro}</p>
                        </div>
                      )}

                      {bairros.length === 0 ? (
                        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                          Nenhum bairro cadastrado. Cadastre em Configurações → Operação.
                        </p>
                      ) : null}
                    </div>
                  </div>
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
              {mesaMode && itensConta.length > 0 ? (
                <ContaExistenteSection itens={itensConta} />
              ) : null}
              {!vendaIniciada && !(mesaMode && itensConta.length) ? (
                <p className="px-6 py-20 text-center text-sm text-[#9CA3AF]">
                  Quando você lançar um item na busca ao lado ele será exibido aqui.
                </p>
              ) : carrinho.length > 0 ? (
                <div className="space-y-2 p-4">
                  {carrinho.map((item, index) => (
                    <div
                      key={item.produto.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm"
                    >
                      <span className="inline-flex min-w-[2.5rem] justify-center rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        {String(index + 1).padStart(4, "0").slice(-4)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#111111]">
                          {item.produto.nome}
                        </p>
                        <p className="text-xs text-[#6B7280]">
                          {formatBRL(item.produto.preco)} / UN
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-1">
                        <button
                          type="button"
                          onClick={() => alterarQuantidade(item.produto.id, -1)}
                          className="grid size-8 place-items-center rounded-lg text-[#6B7280] transition hover:bg-white hover:text-[#111111]"
                          aria-label="Diminuir quantidade"
                        >
                          <Minus className="size-4" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={item.quantidade}
                          onChange={(e) =>
                            definirQuantidade(item.produto.id, Number(e.target.value))
                          }
                          className="h-8 w-12 border-none bg-transparent text-center text-sm font-semibold text-[#111111] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          aria-label="Quantidade"
                        />
                        <button
                          type="button"
                          onClick={() => alterarQuantidade(item.produto.id, 1)}
                          className="grid size-8 place-items-center rounded-lg text-[#6B7280] transition hover:bg-white hover:text-[#111111]"
                          aria-label="Aumentar quantidade"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                      <span className="min-w-[4.5rem] shrink-0 text-right text-sm font-semibold text-[#111111]">
                        {formatBRL(item.produto.preco * item.quantidade)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removerItem(item.produto.id)}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-[#9CA3AF] transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Remover item"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : mesaMode && itensConta.length > 0 ? (
                <p className="px-6 py-8 text-center text-sm text-[#9CA3AF]">
                  Novos itens aparecerão abaixo da conta aberta.
                </p>
              ) : null}
            </div>

            <footer className="border-t border-[#E5E7EB] bg-[#FAFAFA]">
              <div className="grid grid-cols-2 gap-2 px-4 py-3 text-sm sm:grid-cols-4 lg:grid-cols-5">
                <FooterStat label="Itens" value={String(carrinho.length + (mesaMode ? itensConta.length : 0))} />
                <FooterStat label="Quantidade" value={String(quantidadeItens + (mesaMode ? itensConta.reduce((s, i) => s + i.quantidade, 0) : 0))} />
                <FooterStat label="Descontos" value={formatBRL(desconto)} highlight />
                <FooterStat label="Subtotal" value={formatBRL(mesaMode ? totalContaExistente + subtotal : subtotal)} />
                {!mesaMode && taxaEntregaOmni > 0 ? (
                  <FooterStat label="Entrega" value={formatBRL(taxaEntregaOmni)} />
                ) : null}
              </div>
              {!mesaMode && modoVenda === "delivery" ? (
                <label className="mx-4 mb-3 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-xs text-[#6B7280] shadow-sm">
                  <input
                    type="checkbox"
                    checked={pagarNaEntrega}
                    onChange={(e) => setPagarNaEntrega(e.target.checked)}
                    className="rounded border-[#D1D5DB] text-[#FF9100]"
                  />
                  Cliente paga na entrega (envia direto para cozinha/delivery)
                </label>
              ) : null}
              {mesaMode && carrinho.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 border-t border-[#E5E7EB] px-4 py-3 sm:grid-cols-2">
                  {!activePedidoId ? (
                    <button
                      type="button"
                      onClick={() => void abrirMesa()}
                      disabled={salvando}
                      className="rounded-lg border border-[#FF9100] bg-white px-4 py-3 text-sm font-semibold text-[#FF9100] transition hover:bg-[#FF9100]/5 disabled:opacity-50"
                    >
                      {salvando ? "Abrindo..." : "Abrir mesa"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void adicionarItensMesa()}
                      disabled={salvando}
                      className="rounded-lg border border-[#FF9100] bg-white px-4 py-3 text-sm font-semibold text-[#FF9100] transition hover:bg-[#FF9100]/5 disabled:opacity-50"
                    >
                      {salvando ? "Salvando..." : "Adicionar à conta"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={irParaPagamento}
                    disabled={!vendaIniciada}
                    className="flex items-center justify-between rounded-lg bg-[#111111] px-4 py-3 text-left transition enabled:hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-sm font-semibold text-white">Fechar conta</span>
                    <span className="text-lg font-bold text-[#FF9100]">{formatBRL(total)}</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={irParaPagamento}
                  disabled={!vendaIniciada}
                  className="flex w-full items-center justify-between bg-[#111111] px-6 py-4 text-left transition enabled:hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-base font-semibold text-white">
                    {mesaMode
                      ? "Fechar conta"
                      : modoVenda === "delivery" && pagarNaEntrega
                        ? "Enviar para delivery"
                        : modoVenda === "retirada"
                          ? "Confirmar retirada"
                          : "Finalizar venda"}
                  </span>
                  <span className="text-xl font-bold text-[#FF9100]">{formatBRL(total)}</span>
                </button>
              )}
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
  modoVenda,
  onModoVendaChange,
  colaboradores,
  hasCliente,
  conversationId,
  observacaoPedido,
  repetindoPedido,
  onLimparVenda,
  onRepetirUltimoPedido,
  onEditarObservacao,
}: {
  vendedorId: string;
  onVendedorChange: (id: string) => void;
  modoVenda: ModoVenda;
  onModoVendaChange: (modo: ModoVenda) => void;
  colaboradores: { id: string; nome: string }[];
  hasCliente: boolean;
  conversationId: string | null;
  observacaoPedido: string;
  repetindoPedido: boolean;
  onLimparVenda: () => void;
  onRepetirUltimoPedido: () => void;
  onEditarObservacao: () => void;
}) {
  const navigate = usePainelNavigate();
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuAberto(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuAberto]);

  function runAction(action: () => void) {
    setMenuAberto(false);
    action();
  }

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
        value={modoVenda}
        onChange={(value) => onModoVendaChange(value as ModoVenda)}
        options={[
          { value: "presencial", label: "Presencial" },
          { value: "delivery", label: "Delivery" },
          { value: "retirada", label: "Retirada" },
        ]}
      />
      <div className="relative ml-auto" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuAberto((aberto) => !aberto)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[#FF9100] transition hover:bg-[#FFF7ED]"
        >
          Outras ações
          <MoreHorizontal className="size-4" />
        </button>
        {menuAberto ? (
          <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-1 shadow-lg">
            <button
              type="button"
              disabled={!hasCliente || repetindoPedido}
              onClick={() => runAction(onRepetirUltimoPedido)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#111111] hover:bg-[#F6F7F9] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className={cn("size-4", repetindoPedido && "animate-spin")} />
              Repetir último pedido
            </button>
            <button
              type="button"
              onClick={() => runAction(onEditarObservacao)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#111111] hover:bg-[#F6F7F9]"
            >
              <MessageSquareText className="size-4" />
              {observacaoPedido ? "Editar observação" : "Observação do pedido"}
            </button>
            {conversationId ? (
              <button
                type="button"
                onClick={() =>
                  runAction(() =>
                    navigate({
                      to: "/painel/atendimento/conversas",
                      search: { c: conversationId },
                    }),
                  )
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#111111] hover:bg-[#F6F7F9]"
              >
                <MessageCircle className="size-4" />
                Abrir WhatsApp
              </button>
            ) : null}
            <div className="my-1 border-t border-[#F3F4F6]" />
            <button
              type="button"
              onClick={() => runAction(onLimparVenda)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
            >
              <Eraser className="size-4" />
              Limpar venda
            </button>
          </div>
        ) : null}
      </div>
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
      <span className="shrink-0">{label}</span>
      <span className="relative inline-flex min-w-0 items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer appearance-none border-none bg-transparent py-1 pr-5 text-sm font-medium text-[#FF9100] outline-none"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 size-3.5 text-[#FF9100]" />
      </span>
    </label>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 px-1 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PedidoResult({ pedido }: { pedido: Pedido }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#111111]">
          Pedido #{pedido.numero} —{" "}
          {new Date(pedido.created_at).toLocaleDateString("pt-BR")}
        </p>
        <p className="text-xs capitalize text-[#6B7280]">
          {pedido.canal} · {pedido.status}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-[#111111]">
        {formatBRL(pedido.total)}
      </span>
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
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">{label}</p>
      <p className={cn("mt-0.5 font-semibold", highlight ? "text-emerald-600" : "text-[#111111]")}>
        {value}
      </p>
    </div>
  );
}

function ContaExistenteSection({ itens }: { itens: PedidoItem[] }) {
  return (
    <div className="border-b border-[#E5E7EB] bg-[#FFFBF5] p-4">
      <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[#C45A00]">
        Conta aberta
      </p>
      <div className="space-y-2">
        {itens.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[#FF9100]/15 bg-white px-3.5 py-3 shadow-sm"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#111111]">
                {item.produtos?.nome ?? "Item"}
              </p>
              <p className="text-xs text-[#6B7280]">
                {item.quantidade} UN x {formatBRL(item.preco_unitario)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-[#111111]">
              {formatBRL(item.quantidade * item.preco_unitario)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumoPagamento({
  saleNumber,
  titulo,
  clienteNome,
  subtotal,
  desconto,
  taxaEntrega = 0,
  total,
  pagamentos,
  restante,
  salvando,
  concluirLabel,
  onConcluir,
}: {
  saleNumber: number;
  titulo?: string;
  clienteNome?: string | null;
  subtotal: number;
  desconto: number;
  taxaEntrega?: number;
  total: number;
  pagamentos: PagamentoParcial[];
  restante: number;
  salvando: boolean;
  concluirLabel?: string;
  onConcluir: () => void;
}) {
  return (
    <aside className="flex w-[min(420px,38%)] shrink-0 flex-col border-l border-[#E5E7EB] bg-[#FAFAFA]">
      <div className="border-b border-[#E5E7EB] bg-white px-5 py-4">
        <p className="text-base font-bold">{titulo ?? `Venda: #${saleNumber}`}</p>
        {clienteNome ? (
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-[#FF9100]/20 bg-[#FFF7ED] px-2.5 py-1.5">
            <UserRound className="size-3.5 text-[#FF9100]" />
            <span className="text-xs font-semibold text-[#C45A00]">{clienteNome}</span>
          </div>
        ) : null}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4 text-sm">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex justify-between">
            <span className="text-[#6B7280]">Subtotal</span>
            <span className="font-medium">{formatBRL(subtotal)}</span>
          </div>
          {desconto > 0 ? (
            <div className="mt-2 flex justify-between text-emerald-600">
              <span>Descontos</span>
              <span>- {formatBRL(desconto)}</span>
            </div>
          ) : null}
          {taxaEntrega > 0 ? (
            <div className="mt-2 flex justify-between">
              <span className="text-[#6B7280]">Entrega</span>
              <span className="font-medium">{formatBRL(taxaEntrega)}</span>
            </div>
          ) : null}
          {pagamentos.map((p) => (
            <div key={p.id} className="mt-2 flex justify-between text-emerald-600">
              <span>{p.label}</span>
              <span>{formatBRL(p.valor)}</span>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-[#F3F4F6] pt-3 text-base font-bold">
            <span>Total a pagar</span>
            <span className="text-[#FF9100]">{formatBRL(restante)}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onConcluir}
        disabled={salvando || restante > 0.009}
        className="m-4 rounded-2xl bg-[#FF9100] px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-[#FF9100]/25 transition enabled:hover:bg-[#E68200] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {salvando ? "Processando..." : concluirLabel ?? "Concluir e registrar venda"}
      </button>
    </aside>
  );
}
