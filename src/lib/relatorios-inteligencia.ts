export type CanalVenda =
  | "pdv"
  | "mesas"
  | "delivery"
  | "qrcode"
  | "whatsapp"
  | "quero_delivery"
  | "ifood";
export type FormaPagamento = "dinheiro" | "pix" | "cartao" | "online";
export type StatusRelatorio = "concluido" | "cancelado" | "em_preparo" | "entregue";

export type RelatorioProduto = {
  id: string;
  nome: string;
  categoria: string;
  preco: number;
  custo: number;
  estoque: number;
  estoqueMinimo: number;
  tempoPreparo: number;
  ativo: boolean;
};

export type RelatorioCliente = {
  id: string;
  nome: string;
  bairro: string;
  ultimoPedidoDias: number;
  pontos: number;
  aniversarioMes: boolean;
};

export type RelatorioMotoboy = {
  id: string;
  nome: string;
  taxaBase: number;
};

export type RelatorioAtendente = {
  id: string;
  nome: string;
  funcao: "garcom" | "caixa" | "atendente";
};

export type RelatorioPedidoItem = {
  produtoId: string;
  nome: string;
  categoria: string;
  quantidade: number;
  precoUnitario: number;
  custoUnitario: number;
};

export type RelatorioPedido = {
  id: string;
  numero: number;
  data: string;
  canal: CanalVenda;
  pagamento: FormaPagamento;
  status: StatusRelatorio;
  clienteId: string;
  clienteNome: string;
  bairro: string;
  motoboyId: string | null;
  atendenteId: string;
  atendenteNome: string;
  mesa: string | null;
  tempoPreparo: number;
  tempoEntrega: number | null;
  taxaEntrega: number;
  subtotal: number;
  total: number;
  custo: number;
  campanhaId: string | null;
  itens: RelatorioPedidoItem[];
};

export type RelatorioFinanceiro = {
  id: string;
  data: string;
  tipo: "entrada" | "saida";
  categoria: string;
  descricao: string;
  valor: number;
  forma: string;
};

export type RelatorioNotaFiscal = {
  id: string;
  data: string;
  tipo: "NFC-e" | "NF-e";
  status: "emitida" | "cancelada";
  valor: number;
  xmlEnviado: boolean;
};

export type RelatorioCampanha = {
  id: string;
  nome: string;
  canal: "whatsapp";
  enviadas: number;
  entregues: number;
  respondidas: number;
  conversoes: number;
  receita: number;
};

export type RelatorioCaixa = {
  id: string;
  data: string;
  abertura: number;
  fechamento: number;
  sangrias: number;
  suprimentos: number;
  diferenca: number;
  operador: string;
};

export type RelatorioDataset = {
  pedidos: RelatorioPedido[];
  produtos: RelatorioProduto[];
  clientes: RelatorioCliente[];
  motoboys: RelatorioMotoboy[];
  atendentes: RelatorioAtendente[];
  financeiro: RelatorioFinanceiro[];
  notas: RelatorioNotaFiscal[];
  campanhas: RelatorioCampanha[];
  caixas: RelatorioCaixa[];
};

const STORAGE_KEY = "abelha-mel-relatorios-inteligencia-v1";

const produtoBase: Omit<RelatorioProduto, "estoque">[] = [
  {
    id: "p1",
    nome: "Bolo de Mel Premium",
    categoria: "Bolos",
    preco: 34.9,
    custo: 12.4,
    estoqueMinimo: 8,
    tempoPreparo: 18,
    ativo: true,
  },
  {
    id: "p2",
    nome: "Brigadeiro Belga",
    categoria: "Doces",
    preco: 7.9,
    custo: 2.1,
    estoqueMinimo: 20,
    tempoPreparo: 6,
    ativo: true,
  },
  {
    id: "p3",
    nome: "Cheesecake de Frutas",
    categoria: "Sobremesas",
    preco: 19.9,
    custo: 7.8,
    estoqueMinimo: 10,
    tempoPreparo: 12,
    ativo: true,
  },
  {
    id: "p4",
    nome: "Brownie Pistache",
    categoria: "Doces",
    preco: 12.9,
    custo: 4.3,
    estoqueMinimo: 14,
    tempoPreparo: 9,
    ativo: true,
  },
  {
    id: "p5",
    nome: "Cappuccino Cremoso",
    categoria: "Bebidas",
    preco: 11.5,
    custo: 3.2,
    estoqueMinimo: 12,
    tempoPreparo: 5,
    ativo: true,
  },
  {
    id: "p6",
    nome: "Torta de Limão",
    categoria: "Tortas",
    preco: 16.9,
    custo: 6.4,
    estoqueMinimo: 9,
    tempoPreparo: 10,
    ativo: true,
  },
  {
    id: "p7",
    nome: "Macaron de Mel",
    categoria: "Doces",
    preco: 9.5,
    custo: 3.6,
    estoqueMinimo: 18,
    tempoPreparo: 7,
    ativo: true,
  },
  {
    id: "p8",
    nome: "Waffle da Casa",
    categoria: "Cafeteria",
    preco: 23.9,
    custo: 8.9,
    estoqueMinimo: 7,
    tempoPreparo: 14,
    ativo: true,
  },
  {
    id: "p9",
    nome: "Cookie Recheado",
    categoria: "Padaria",
    preco: 8.9,
    custo: 2.9,
    estoqueMinimo: 24,
    tempoPreparo: 4,
    ativo: true,
  },
  {
    id: "p10",
    nome: "Croissant de Chocolate",
    categoria: "Padaria",
    preco: 13.9,
    custo: 4.8,
    estoqueMinimo: 10,
    tempoPreparo: 8,
    ativo: false,
  },
  {
    id: "p11",
    nome: "Bolo Vulcao de Cenoura",
    categoria: "Bolos",
    preco: 29.9,
    custo: 10.7,
    estoqueMinimo: 6,
    tempoPreparo: 17,
    ativo: true,
  },
  {
    id: "p12",
    nome: "Milkshake de Doce de Leite",
    categoria: "Bebidas",
    preco: 17.9,
    custo: 6.5,
    estoqueMinimo: 5,
    tempoPreparo: 6,
    ativo: true,
  },
];

const clientesBase: RelatorioCliente[] = [
  {
    id: "c1",
    nome: "Larissa Moura",
    bairro: "Centro",
    ultimoPedidoDias: 2,
    pontos: 180,
    aniversarioMes: false,
  },
  {
    id: "c2",
    nome: "Pedro Campos",
    bairro: "Redencao",
    ultimoPedidoDias: 7,
    pontos: 95,
    aniversarioMes: false,
  },
  {
    id: "c3",
    nome: "Amanda Freitas",
    bairro: "Pindoba",
    ultimoPedidoDias: 38,
    pontos: 260,
    aniversarioMes: true,
  },
  {
    id: "c4",
    nome: "Rafael Duarte",
    bairro: "Centro",
    ultimoPedidoDias: 14,
    pontos: 70,
    aniversarioMes: false,
  },
  {
    id: "c5",
    nome: "Juliana Nery",
    bairro: "Cohab",
    ultimoPedidoDias: 62,
    pontos: 140,
    aniversarioMes: false,
  },
  {
    id: "c6",
    nome: "Fabio Lopes",
    bairro: "Mandacaru",
    ultimoPedidoDias: 1,
    pontos: 310,
    aniversarioMes: true,
  },
  {
    id: "c7",
    nome: "Helena Rezende",
    bairro: "Santa Luzia",
    ultimoPedidoDias: 93,
    pontos: 35,
    aniversarioMes: false,
  },
  {
    id: "c8",
    nome: "Matheus Lima",
    bairro: "Perpetuo Socorro",
    ultimoPedidoDias: 4,
    pontos: 210,
    aniversarioMes: false,
  },
  {
    id: "c9",
    nome: "Camila Torres",
    bairro: "Vila Pomar",
    ultimoPedidoDias: 28,
    pontos: 155,
    aniversarioMes: false,
  },
  {
    id: "c10",
    nome: "Paulo Viana",
    bairro: "Centro",
    ultimoPedidoDias: 12,
    pontos: 120,
    aniversarioMes: true,
  },
];

const motoboysBase: RelatorioMotoboy[] = [
  { id: "m1", nome: "Joao Moto", taxaBase: 7 },
  { id: "m2", nome: "Carlos Giro", taxaBase: 7.5 },
  { id: "m3", nome: "Diego Flash", taxaBase: 8 },
  { id: "m4", nome: "Bruno Rota", taxaBase: 7 },
];

const atendentesBase: RelatorioAtendente[] = [
  { id: "a1", nome: "Melissa", funcao: "caixa" },
  { id: "a2", nome: "Tiago", funcao: "garcom" },
  { id: "a3", nome: "Patricia", funcao: "atendente" },
  { id: "a4", nome: "Nina", funcao: "garcom" },
];

const campanhasBase: RelatorioCampanha[] = [
  {
    id: "w1",
    nome: "Combo da tarde",
    canal: "whatsapp",
    enviadas: 280,
    entregues: 264,
    respondidas: 72,
    conversoes: 21,
    receita: 1438,
  },
  {
    id: "w2",
    nome: "Reativacao 30 dias",
    canal: "whatsapp",
    enviadas: 190,
    entregues: 173,
    respondidas: 49,
    conversoes: 15,
    receita: 980,
  },
  {
    id: "w3",
    nome: "Aniversariantes do mes",
    canal: "whatsapp",
    enviadas: 55,
    entregues: 53,
    respondidas: 28,
    conversoes: 12,
    receita: 756,
  },
];

const notasBase: RelatorioNotaFiscal[] = [
  { id: "n1", data: daysAgoIso(1), tipo: "NFC-e", status: "emitida", valor: 920, xmlEnviado: true },
  { id: "n2", data: daysAgoIso(2), tipo: "NFC-e", status: "emitida", valor: 680, xmlEnviado: true },
  {
    id: "n3",
    data: daysAgoIso(3),
    tipo: "NF-e",
    status: "emitida",
    valor: 1210,
    xmlEnviado: false,
  },
  {
    id: "n4",
    data: daysAgoIso(5),
    tipo: "NFC-e",
    status: "cancelada",
    valor: 74,
    xmlEnviado: false,
  },
  { id: "n5", data: daysAgoIso(6), tipo: "NF-e", status: "emitida", valor: 530, xmlEnviado: true },
];

export type RelatorioFiltros = {
  dataInicial: string;
  dataFinal: string;
  canal: string;
  pagamento: string;
  status: string;
  categoria: string;
  produto: string;
  cliente: string;
  motoboy: string;
  atendente: string;
};

export function getDefaultFiltros(): RelatorioFiltros {
  return {
    dataInicial: daysAgoIso(29),
    dataFinal: daysAgoIso(0),
    canal: "todos",
    pagamento: "todos",
    status: "todos",
    categoria: "todos",
    produto: "",
    cliente: "",
    motoboy: "todos",
    atendente: "todos",
  };
}

export function carregarRelatorioDataset(): RelatorioDataset {
  if (typeof window === "undefined") {
    return gerarDataset();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as RelatorioDataset;
    } catch {
      const novo = gerarDataset();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(novo));
      return novo;
    }
  }

  const dataset = gerarDataset();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
  return dataset;
}

export function aplicarFiltros(pedidos: RelatorioPedido[], filtros: RelatorioFiltros) {
  const inicio = new Date(`${filtros.dataInicial}T00:00:00`).getTime();
  const fim = new Date(`${filtros.dataFinal}T23:59:59`).getTime();

  return pedidos.filter((pedido) => {
    const data = new Date(pedido.data).getTime();
    const matchData =
      Number.isNaN(inicio) || Number.isNaN(fim) ? true : data >= inicio && data <= fim;
    const matchCanal = filtros.canal === "todos" || pedido.canal === filtros.canal;
    const matchPagamento = filtros.pagamento === "todos" || pedido.pagamento === filtros.pagamento;
    const matchStatus = filtros.status === "todos" || pedido.status === filtros.status;
    const matchCliente =
      !filtros.cliente || pedido.clienteNome.toLowerCase().includes(filtros.cliente.toLowerCase());
    const matchMotoboy = filtros.motoboy === "todos" || pedido.motoboyId === filtros.motoboy;
    const matchAtendente =
      filtros.atendente === "todos" || pedido.atendenteId === filtros.atendente;
    const matchProduto =
      !filtros.produto ||
      pedido.itens.some((item) => item.nome.toLowerCase().includes(filtros.produto.toLowerCase()));
    const matchCategoria =
      filtros.categoria === "todos" ||
      pedido.itens.some((item) => item.categoria === filtros.categoria);

    return (
      matchData &&
      matchCanal &&
      matchPagamento &&
      matchStatus &&
      matchCliente &&
      matchMotoboy &&
      matchAtendente &&
      matchProduto &&
      matchCategoria
    );
  });
}

export function filtrarFinanceiro(financeiro: RelatorioFinanceiro[], filtros: RelatorioFiltros) {
  const inicio = new Date(`${filtros.dataInicial}T00:00:00`).getTime();
  const fim = new Date(`${filtros.dataFinal}T23:59:59`).getTime();
  return financeiro.filter((item) => {
    const data = new Date(item.data).getTime();
    return Number.isNaN(inicio) || Number.isNaN(fim) ? true : data >= inicio && data <= fim;
  });
}

export function filtrarCaixas(caixas: RelatorioCaixa[], filtros: RelatorioFiltros) {
  const inicio = new Date(`${filtros.dataInicial}T00:00:00`).getTime();
  const fim = new Date(`${filtros.dataFinal}T23:59:59`).getTime();
  return caixas.filter((item) => {
    const data = new Date(item.data).getTime();
    return Number.isNaN(inicio) || Number.isNaN(fim) ? true : data >= inicio && data <= fim;
  });
}

export function filtrarNotas(notas: RelatorioNotaFiscal[], filtros: RelatorioFiltros) {
  const inicio = new Date(`${filtros.dataInicial}T00:00:00`).getTime();
  const fim = new Date(`${filtros.dataFinal}T23:59:59`).getTime();
  return notas.filter((item) => {
    const data = new Date(item.data).getTime();
    return Number.isNaN(inicio) || Number.isNaN(fim) ? true : data >= inicio && data <= fim;
  });
}

export function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

export function gerarDataset(): RelatorioDataset {
  const produtos = produtoBase.map((produto, index) => ({
    ...produto,
    estoque: Math.max(0, produto.estoqueMinimo + ((index * 7) % 18) - 4),
  }));
  const clientes = clientesBase;
  const motoboys = motoboysBase;
  const atendentes = atendentesBase;

  const pedidos: RelatorioPedido[] = [];
  for (let i = 0; i < 180; i += 1) {
    const data = new Date();
    data.setHours(8 + (i % 11), 8 + ((i * 7) % 45), 0, 0);
    data.setDate(data.getDate() - (i % 45));

    const cliente = clientes[i % clientes.length];
    const atendente = atendentes[i % atendentes.length];
    const canal = escolherCanal(i);
    const status = escolherStatus(i, canal);
    const quantidadeItens = 1 + (i % 4);
    const itens: RelatorioPedidoItem[] = [];

    for (let j = 0; j < quantidadeItens; j += 1) {
      const produto = produtos[(i + j * 2) % produtos.length];
      const quantidade = 1 + ((i + j) % 3);
      itens.push({
        produtoId: produto.id,
        nome: produto.nome,
        categoria: produto.categoria,
        quantidade,
        precoUnitario: produto.preco,
        custoUnitario: produto.custo,
      });
    }

    const subtotal = itens.reduce((sum, item) => sum + item.quantidade * item.precoUnitario, 0);
    const custo = itens.reduce((sum, item) => sum + item.quantidade * item.custoUnitario, 0);
    const deliveryChannel = ["delivery", "whatsapp", "quero_delivery", "ifood"].includes(canal);
    const motoboy = deliveryChannel ? motoboys[i % motoboys.length] : null;
    const taxaEntrega = deliveryChannel ? 5 : 0;
    const total = subtotal + taxaEntrega;

    pedidos.push({
      id: `pedido-${i + 1}`,
      numero: 3200 + i,
      data: data.toISOString(),
      canal,
      pagamento: escolherPagamento(i, canal),
      status,
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      bairro: cliente.bairro,
      motoboyId: motoboy?.id ?? null,
      atendenteId: atendente.id,
      atendenteNome: atendente.nome,
      mesa: canal === "mesas" ? `Mesa ${(i % 8) + 1}` : null,
      tempoPreparo: 8 + (i % 14),
      tempoEntrega: deliveryChannel ? 18 + ((i * 3) % 24) : null,
      taxaEntrega,
      subtotal,
      total,
      custo,
      campanhaId:
        canal === "whatsapp" && i % 2 === 0 ? campanhasBase[i % campanhasBase.length].id : null,
      itens,
    });
  }

  const financeiro = gerarFinanceiro(pedidos);
  const caixas = gerarCaixas(pedidos);

  return {
    pedidos,
    produtos,
    clientes,
    motoboys,
    atendentes,
    financeiro,
    notas: notasBase,
    campanhas: campanhasBase,
    caixas,
  };
}

function gerarFinanceiro(pedidos: RelatorioPedido[]): RelatorioFinanceiro[] {
  const entradas = pedidos
    .filter((pedido) => pedido.status !== "cancelado")
    .map((pedido) => ({
      id: `fin-e-${pedido.id}`,
      data: pedido.data,
      tipo: "entrada" as const,
      categoria: `Vendas ${labelCanal(pedido.canal)}`,
      descricao: `Pedido #${pedido.numero}`,
      valor: Number(pedido.total.toFixed(2)),
      forma: pedido.pagamento,
    }));

  const saidasBase = [
    { categoria: "Folha", descricao: "Equipe operacional", valor: 1280, forma: "transferencia" },
    { categoria: "Fornecedor", descricao: "Laticinios e chocolate", valor: 860, forma: "pix" },
    {
      categoria: "Marketing",
      descricao: "Campanhas e impulsionamento",
      valor: 320,
      forma: "cartao",
    },
    { categoria: "Delivery", descricao: "Pagamento de motoboys", valor: 440, forma: "pix" },
    { categoria: "Despesas fixas", descricao: "Aluguel e energia", valor: 1120, forma: "boleto" },
  ];

  const saidas: RelatorioFinanceiro[] = saidasBase.map((item, index) => ({
    id: `fin-s-${index + 1}`,
    data: daysAgoIso(index * 6 + 2),
    tipo: "saida",
    categoria: item.categoria,
    descricao: item.descricao,
    valor: item.valor,
    forma: item.forma,
  }));

  return [...entradas, ...saidas].sort((a, b) => +new Date(b.data) - +new Date(a.data));
}

function gerarCaixas(pedidos: RelatorioPedido[]): RelatorioCaixa[] {
  const caixas: RelatorioCaixa[] = [];
  for (let i = 0; i < 12; i += 1) {
    const data = daysAgoIso(i);
    const pedidosDoDia = pedidos.filter(
      (pedido) => pedido.data.slice(0, 10) === data && pedido.status !== "cancelado",
    );
    const vendas = pedidosDoDia.reduce((sum, pedido) => sum + pedido.total, 0);
    const sangrias = 40 + (i % 3) * 25;
    const suprimentos = i % 4 === 0 ? 60 : 20;
    caixas.push({
      id: `caixa-${i + 1}`,
      data,
      abertura: 200,
      fechamento: Number((200 + vendas - sangrias + suprimentos + ((i % 2) * 12 - 6)).toFixed(2)),
      sangrias,
      suprimentos,
      diferenca: i % 5 === 0 ? -12 : i % 4 === 0 ? 8 : 0,
      operador: atendentesBase[i % atendentesBase.length].nome,
    });
  }
  return caixas;
}

function escolherCanal(i: number): CanalVenda {
  const canais: CanalVenda[] = [
    "pdv",
    "mesas",
    "delivery",
    "qrcode",
    "whatsapp",
    "quero_delivery",
    "ifood",
  ];
  return canais[i % canais.length];
}

function escolherPagamento(i: number, canal: CanalVenda): FormaPagamento {
  if (canal === "ifood" || canal === "quero_delivery") return "online";
  const formas: FormaPagamento[] = ["pix", "cartao", "dinheiro", "online"];
  return formas[i % formas.length];
}

function escolherStatus(i: number, canal: CanalVenda): StatusRelatorio {
  if (i % 11 === 0) return "cancelado";
  if (["delivery", "whatsapp", "quero_delivery", "ifood"].includes(canal) && i % 5 === 0)
    return "entregue";
  if (i % 4 === 0) return "em_preparo";
  return "concluido";
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function labelCanal(canal: string) {
  const map: Record<string, string> = {
    pdv: "PDV",
    mesas: "Mesas",
    delivery: "Delivery",
    qrcode: "QR Code",
    whatsapp: "WhatsApp",
    quero_delivery: "Quero Delivery",
    ifood: "iFood",
  };
  return map[canal] ?? canal;
}
