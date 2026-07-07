import { getCityLabel } from "@/lib/shared/city-config";
import { canUseBrowserStorage } from "@/lib/shared/runtime";

const STORAGE_KEY = "abelha-mel-demo-db";

type DemoDatabase = {
  categorias: Array<{ id: string; nome: string; emoji: string; ordem: number; ativo: boolean }>;
  produtos: Array<Record<string, any>>;
  mesas: Array<Record<string, any>>;
  pedidos: Array<Record<string, any>>;
  pedido_itens: Array<Record<string, any>>;
  entregas: Array<Record<string, any>>;
  lancamentos_financeiros: Array<Record<string, any>>;
  cupons: Array<Record<string, any>>;
  profiles: Array<Record<string, any>>;
};

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function baseData(): DemoDatabase {
  const categorias = [
    { id: "cat-bolos", nome: "Bolos", emoji: "🎂", ordem: 1, ativo: true },
    { id: "cat-brigadeiros", nome: "Brigadeiros", emoji: "🍫", ordem: 2, ativo: true },
    { id: "cat-tortas", nome: "Tortas", emoji: "🥧", ordem: 3, ativo: true },
  ];

  const produtos = [
    {
      id: "prod-1",
      categoria_id: "cat-bolos",
      nome: "Bolo de Mel Premium",
      descricao: "Bolo artesanal com cobertura de mel.",
      preco: 84.9,
      imagem_url: null,
      tempo_preparo_min: 20,
      calorias: 420,
      destaque: true,
      ativo: true,
      estoque: 12,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "prod-2",
      categoria_id: "cat-brigadeiros",
      nome: "Brigadeiro Gold",
      descricao: "Brigadeiro gourmet com granulado belga.",
      preco: 6.5,
      imagem_url: null,
      tempo_preparo_min: 5,
      calorias: 125,
      destaque: true,
      ativo: true,
      estoque: 80,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "prod-3",
      categoria_id: "cat-tortas",
      nome: "Torta de Limão Siciliano",
      descricao: "Torta gelada com merengue maçaricado.",
      preco: 18.9,
      imagem_url: null,
      tempo_preparo_min: 12,
      calorias: 280,
      destaque: false,
      ativo: true,
      estoque: 18,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "prod-4",
      categoria_id: "cat-bolos",
      nome: "Fatia Ninho com Nutella",
      descricao: "Fatia generosa para delivery e salão.",
      preco: 16.9,
      imagem_url: null,
      tempo_preparo_min: 8,
      calorias: 350,
      destaque: false,
      ativo: true,
      estoque: 25,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "prod-5",
      categoria_id: "cat-brigadeiros",
      nome: "Caixa com 6 brigadeiros",
      descricao: "Mix da casa para presente.",
      preco: 29.9,
      imagem_url: null,
      tempo_preparo_min: 6,
      calorias: 520,
      destaque: true,
      ativo: true,
      estoque: 20,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  const mesas = Array.from({ length: 8 }, (_, index) => ({
    id: `mesa-${index + 1}`,
    numero: index + 1,
    capacidade: index < 4 ? 4 : 6,
    status: index === 1 ? "ocupada" : index === 4 ? "reservada" : "livre",
    qrcode_token: `qr-mesa-${index + 1}`,
    created_at: nowIso(),
  }));

  const profiles = [
    {
      id: "cli-1",
      nome: "Mariana Costa",
      telefone: "(11) 99999-0001",
      email: "mariana@abelhaemel.local",
      pontos_fidelidade: 185,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "cli-2",
      nome: "Paulo Henrique",
      telefone: "(11) 99999-0002",
      email: "paulo@abelhaemel.local",
      pontos_fidelidade: 120,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "cli-3",
      nome: "Aline Souza",
      telefone: "(11) 99999-0003",
      email: "aline@abelhaemel.local",
      pontos_fidelidade: 78,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  const pedidos = [
    {
      id: "ped-1",
      numero: 101,
      cliente_id: "cli-1",
      mesa_id: null,
      canal: "delivery",
      status: "em_entrega",
      subtotal: 58.3,
      desconto: 0,
      taxa_entrega: 5,
      total: 63.3,
      forma_pagamento: "pix",
      endereco: "Rua das Flores, 123",
      observacoes: "Sem canela",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "ped-2",
      numero: 102,
      cliente_id: "cli-2",
      mesa_id: "mesa-2",
      canal: "mesa",
      status: "em_preparo",
      subtotal: 46.8,
      desconto: 5,
      taxa_entrega: 0,
      total: 41.8,
      forma_pagamento: "credito",
      endereco: null,
      observacoes: "",
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  const pedido_itens = [
    {
      id: "item-1",
      pedido_id: "ped-1",
      produto_id: "prod-5",
      quantidade: 1,
      preco_unitario: 29.9,
      observacao: null,
      created_at: nowIso(),
    },
    {
      id: "item-2",
      pedido_id: "ped-1",
      produto_id: "prod-3",
      quantidade: 1,
      preco_unitario: 18.9,
      observacao: null,
      created_at: nowIso(),
    },
    {
      id: "item-3",
      pedido_id: "ped-2",
      produto_id: "prod-4",
      quantidade: 2,
      preco_unitario: 16.9,
      observacao: null,
      created_at: nowIso(),
    },
  ];

  const entregas = [
    {
      id: "ent-1",
      pedido_id: "ped-1",
      motoboy_id: null,
      status: "pendente",
      endereco: "Rua das Flores, 123",
      bairro: "Centro",
      distancia_km: 3.2,
      taxa: 5,
      saiu_em: null,
      entregue_em: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  const lancamentos_financeiros = [
    {
      id: "fin-1",
      tipo: "entrada",
      descricao: "Pedido #101",
      categoria: "Vendas Delivery",
      valor: 63.3,
      forma: "pix",
      pedido_id: "ped-1",
      data: new Date().toISOString().slice(0, 10),
      created_at: nowIso(),
    },
    {
      id: "fin-2",
      tipo: "entrada",
      descricao: "Pedido #102",
      categoria: "Vendas Mesa",
      valor: 41.8,
      forma: "credito",
      pedido_id: "ped-2",
      data: new Date().toISOString().slice(0, 10),
      created_at: nowIso(),
    },
    {
      id: "fin-3",
      tipo: "saida",
      descricao: "Compra de insumos",
      categoria: "Fornecedores",
      valor: 120,
      forma: "pix",
      pedido_id: null,
      data: new Date().toISOString().slice(0, 10),
      created_at: nowIso(),
    },
  ];

  const cupons = [
    {
      id: "cup-1",
      codigo: "MEL10",
      descricao: "10% na primeira compra",
      desconto_percentual: 10,
      desconto_valor: null,
      valido_ate: null,
      ativo: true,
      usos: 6,
      usos_maximos: null,
      created_at: nowIso(),
    },
    {
      id: "cup-2",
      codigo: "DOCE5",
      descricao: "R$ 5 em pedidos acima de R$ 40",
      desconto_percentual: null,
      desconto_valor: 5,
      valido_ate: null,
      ativo: true,
      usos: 3,
      usos_maximos: null,
      created_at: nowIso(),
    },
  ];

  return {
    categorias,
    produtos,
    mesas,
    pedidos,
    pedido_itens,
    entregas,
    lancamentos_financeiros,
    cupons,
    profiles,
  };
}

function readDb(): DemoDatabase {
  if (!canUseBrowserStorage()) return baseData();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = baseData();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    return JSON.parse(raw) as DemoDatabase;
  } catch {
    const seeded = baseData();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function writeDb(db: DemoDatabase) {
  if (!canUseBrowserStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function mutate<T>(updater: (db: DemoDatabase) => T): T {
  const db = readDb();
  const result = updater(db);
  writeDb(db);
  return result;
}

export const demoStore = {
  listCategorias: async () => readDb().categorias,
  listProdutos: async () =>
    [...readDb().produtos].sort(
      (a, b) => Number(b.destaque) - Number(a.destaque) || a.nome.localeCompare(b.nome),
    ),
  listMesas: async () => [...readDb().mesas].sort((a, b) => a.numero - b.numero),
  listPedidos: async () =>
    [...readDb().pedidos].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  listPedidoItens: async (pedidoId: string) => {
    const db = readDb();
    return db.pedido_itens
      .filter((item) => item.pedido_id === pedidoId)
      .map((item) => ({
        ...item,
        produtos: {
          nome: db.produtos.find((product) => product.id === item.produto_id)?.nome ?? "Produto",
        },
      }));
  },
  listEntregas: async () =>
    [...readDb().entregas].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  listLancamentos: async () =>
    [...readDb().lancamentos_financeiros].sort((a, b) => `${b.data}`.localeCompare(`${a.data}`)),
  listCupons: async () =>
    [...readDb().cupons].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  listClientes: async () =>
    [...readDb().profiles].sort(
      (a, b) => Number(b.pontos_fidelidade) - Number(a.pontos_fidelidade),
    ),
  createPedido: async (opts: {
    canal: string;
    mesa_id?: string | null;
    itens: Array<{ produto_id: string; quantidade: number; preco_unitario: number }>;
    forma_pagamento?: string | null;
    endereco?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    cliente_id?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    reference?: string | null;
    taxa_entrega?: number | null;
    observacoes?: string | null;
  }) =>
    mutate((db) => {
      const subtotal = opts.itens.reduce(
        (sum, item) => sum + item.preco_unitario * item.quantidade,
        0,
      );
      const taxa_entrega = opts.canal === "delivery" ? Number(opts.taxa_entrega ?? 5) : 0;
      const existingProfile = db.profiles.find((item) => item.id === opts.cliente_id);
      const customerProfile = existingProfile ?? {
        id: opts.cliente_id ?? createId("cli"),
        nome: opts.customerName ?? "Cliente delivery",
        telefone: opts.customerPhone ?? "(11) 99999-0000",
        email: opts.customerEmail ?? null,
        pontos_fidelidade: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
      };

      if (!existingProfile) {
        db.profiles.unshift(customerProfile);
      } else {
        existingProfile.nome = opts.customerName ?? existingProfile.nome;
        existingProfile.telefone = opts.customerPhone ?? existingProfile.telefone;
        existingProfile.email = opts.customerEmail ?? existingProfile.email ?? null;
        existingProfile.updated_at = nowIso();
      }

      const pedido = {
        id: createId("ped"),
        numero: Math.max(100, ...db.pedidos.map((item) => Number(item.numero))) + 1,
        cliente_id: customerProfile.id,
        cliente_nome: opts.customerName ?? customerProfile.nome,
        cliente_telefone: opts.customerPhone ?? customerProfile.telefone,
        cliente_whatsapp: opts.customerPhone ?? customerProfile.telefone,
        mesa_id: opts.mesa_id ?? null,
        canal: opts.canal,
        status: opts.canal === "delivery" ? "aberto" : "aberto",
        subtotal,
        desconto: 0,
        taxa_entrega,
        total: subtotal + taxa_entrega,
        forma_pagamento: opts.forma_pagamento ?? null,
        endereco: opts.endereco ?? null,
        observacoes: opts.observacoes ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      db.pedidos.unshift(pedido);
      opts.itens.forEach((item) => {
        db.pedido_itens.unshift({
          id: createId("item"),
          pedido_id: pedido.id,
          produto_id: item.produto_id,
          quantidade: item.quantidade,
          preco_unitario: item.preco_unitario,
          observacao: null,
          created_at: nowIso(),
        });
      });
      if (pedido.mesa_id) {
        const mesa = db.mesas.find((item) => item.id === pedido.mesa_id);
        if (mesa) mesa.status = "ocupada";
      }
      db.lancamentos_financeiros.unshift({
        id: createId("fin"),
        tipo: "entrada",
        descricao: `Pedido #${pedido.numero}`,
        categoria: `Vendas ${pedido.canal}`,
        valor: pedido.total,
        forma: pedido.forma_pagamento,
        pedido_id: pedido.id,
        data: new Date().toISOString().slice(0, 10),
        created_at: nowIso(),
      });
      if (pedido.canal === "delivery") {
        db.entregas.unshift({
          id: createId("ent"),
          pedido_id: pedido.id,
          motoboy_id: null,
          status: "pendente",
          endereco: pedido.endereco ?? "Endereço não informado",
          bairro: opts.bairro ?? "Raio local",
          cidade: opts.cidade ?? getCityLabel(),
          referencia: opts.reference ?? "Sem referencia",
          distancia_km: 3,
          taxa: taxa_entrega,
          saiu_em: null,
          entregue_em: null,
          created_at: nowIso(),
          updated_at: nowIso(),
        });
      }
      return pedido;
    }),
  updatePedidoStatus: async (id: string, status: string) =>
    mutate((db) => {
      const pedido = db.pedidos.find((item) => item.id === id);
      if (pedido) {
        pedido.status = status;
        pedido.updated_at = nowIso();
      }
    }),
  updateMesaStatus: async (id: string, status: string) =>
    mutate((db) => {
      const mesa = db.mesas.find((item) => item.id === id);
      if (mesa) mesa.status = status;
    }),
  createLancamento: async (payload: {
    tipo: string;
    descricao: string;
    valor: number;
    categoria?: string | null;
    forma?: string | null;
  }) =>
    mutate((db) => {
      db.lancamentos_financeiros.unshift({
        id: createId("fin"),
        tipo: payload.tipo,
        descricao: payload.descricao,
        categoria: payload.categoria ?? null,
        valor: payload.valor,
        forma: payload.forma ?? null,
        pedido_id: null,
        data: new Date().toISOString().slice(0, 10),
        created_at: nowIso(),
      });
    }),
  createProduto: async (payload: { nome: string; preco: number }) =>
    mutate((db) => {
      db.produtos.unshift({
        id: createId("prod"),
        categoria_id: null,
        nome: payload.nome,
        descricao: null,
        preco: payload.preco,
        imagem_url: null,
        tempo_preparo_min: 10,
        calorias: null,
        destaque: false,
        ativo: true,
        estoque: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    }),
  toggleProdutoAtivo: async (id: string, ativo: boolean) =>
    mutate((db) => {
      const produto = db.produtos.find((item) => item.id === id);
      if (produto) {
        produto.ativo = !ativo;
        produto.updated_at = nowIso();
      }
    }),
  createCupom: async (payload: {
    codigo: string;
    desconto_percentual?: number | null;
    desconto_valor?: number | null;
    descricao?: string | null;
  }) =>
    mutate((db) => {
      db.cupons.unshift({
        id: createId("cup"),
        codigo: payload.codigo,
        descricao: payload.descricao ?? payload.codigo,
        desconto_percentual: payload.desconto_percentual ?? null,
        desconto_valor: payload.desconto_valor ?? null,
        valido_ate: null,
        ativo: true,
        usos: 0,
        usos_maximos: null,
        created_at: nowIso(),
      });
    }),
  acceptEntrega: async (id: string) =>
    mutate((db) => {
      const entrega = db.entregas.find((item) => item.id === id);
      if (entrega) {
        entrega.status = "em_rota";
        entrega.motoboy_id = "demo-motoboy";
        entrega.saiu_em = nowIso();
        entrega.updated_at = nowIso();
      }
    }),
  concludeEntrega: async (id: string) =>
    mutate((db) => {
      const entrega = db.entregas.find((item) => item.id === id);
      if (entrega) {
        entrega.status = "entregue";
        entrega.entregue_em = nowIso();
        entrega.updated_at = nowIso();
      }
      const pedido = db.pedidos.find((item) => item.id === entrega?.pedido_id);
      if (pedido) {
        pedido.status = "entregue";
        pedido.updated_at = nowIso();
      }
    }),
};
