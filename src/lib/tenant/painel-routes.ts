/** Mapeia rotas legadas /painel/* para /t/:slug/* (paridade Abelha & Mel) */
const PAINEL_TO_TENANT_SEGMENTS: Record<string, string> = {
  "": "dashboard",
  "/": "dashboard",
  "/pdv": "pdv",
  "/kds": "gestao-delivery",
  "/gestao-delivery": "gestao-delivery",
  "/cozinha": "cozinha",
  "/mesas": "mesas",
  "/delivery": "delivery",
  "/entregador": "delivery",
  "/pedidos/separacao": "gestao-delivery",
  "/produtos": "produtos",
  "/produtos/categorias": "produtos/categorias",
  "/produtos/sincronizados": "produtos/sincronizados",
  "/produtos/nao-sincronizados": "produtos/nao-sincronizados",
  "/cupons": "cupons",
  "/clientes": "clientes",
  "/colaboradores": "colaboradores",
  "/financeiro": "financeiro",
  "/financeiro/extratos": "financeiro/extratos",
  "/financeiro/saques": "financeiro/saques",
  "/financeiro/mercado-pago": "financeiro/mercado-pago",
  "/fiscal": "fiscal",
  "/fiscal/configuracoes": "fiscal/configuracoes",
  "/relatorios": "relatorios/vendas",
  "/relatorios/vendas": "relatorios/vendas",
  "/relatorios/produtos": "relatorios/produtos",
  "/relatorios/delivery": "relatorios/delivery",
  "/relatorios/operacao": "relatorios/operacao",
  "/relatorios/financeiro": "relatorios/vendas",
  "/relatorios/estoque": "relatorios/estoque",
  "/relatorios/crm": "relatorios/crm",
  "/configuracoes": "configuracoes",
  "/configuracoes/loja": "configuracoes/loja",
  "/configuracoes/horarios": "configuracoes/horarios",
  "/configuracoes/mesas": "configuracoes/mesas",
  "/configuracoes/pagamentos": "configuracoes/pagamentos",
  "/configuracoes/delivery": "configuracoes/delivery",
  "/configuracoes/equipe": "configuracoes/equipe",
  "/configuracoes/plano": "configuracoes/plano",
  "/configuracoes/operacao": "configuracoes/operacao",
  "/configuracoes/integracoes": "configuracoes/integracoes",
  "/configuracoes/impressoras": "configuracoes/impressoras",
  "/estabelecimento/horarios": "configuracoes/horarios",
  "/estabelecimento/visual": "configuracoes/loja",
  "/estabelecimento/pagamentos": "configuracoes/pagamentos",
  "/estabelecimento/plano": "configuracoes/plano",
  "/atendimento": "atendimento/conversas",
  "/atendimento/conversas": "atendimento/conversas",
  "/atendimento/contatos": "atendimento/contatos",
  "/atendimento/automacoes": "atendimento/automacoes",
  "/atendimento/configuracoes": "atendimento/configuracoes",
  "/whatsapp": "atendimento/conversas",
};

export function mapLegacyPainelPath(pathname: string, tenantSlug = "norfood") {
  if (!pathname.startsWith("/painel")) return null;
  const suffix = pathname.replace(/^\/painel/, "") || "";
  const mapped = PAINEL_TO_TENANT_SEGMENTS[suffix] ?? suffix.replace(/^\//, "");
  if (!mapped) return `/t/${tenantSlug}/dashboard`;
  return `/t/${tenantSlug}/${mapped}`;
}

export function tenantPath(tenantSlug: string, segment: string) {
  const clean = segment.replace(/^\/+/, "");
  return `/t/${tenantSlug}/${clean}`;
}

export function lojaPath(tenantSlug: string, segment = "") {
  const clean = segment.replace(/^\/+/, "");
  return clean ? `/loja/${tenantSlug}/${clean}` : `/loja/${tenantSlug}`;
}
