import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Bike,
  Boxes,
  CakeSlice,
  CalendarRange,
  ClipboardList,
  Copy,
  DollarSign,
  Download,
  FileSpreadsheet,
  MessageCircle,
  Printer,
  Receipt,
  Send,
  ShoppingBag,
  Store,
  Target,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  GestaoButton,
  GestaoCard,
  GestaoField,
  GestaoInput,
  GestaoPage,
  GestaoSectionTitle,
  GestaoSelect,
  GestaoStat,
  GestaoTable,
  GestaoTableHead,
  StatusPill,
} from "@/components/painel/gestao-ui";
import { VendaDetalheModal } from "@/components/pedidos/venda-detalhe-modal";
import {
  aplicarFiltros,
  carregarRelatorioDataset,
  filtrarCaixas,
  filtrarFinanceiro,
  filtrarNotas,
  formatPercent,
  getDefaultFiltros,
  labelCanal,
  type RelatorioDataset,
  type RelatorioFinanceiro,
  type RelatorioPedido,
} from "@/lib/relatorios/relatorios-inteligencia";
import { formatBRL } from "@/lib/shared/db";
import {
  labelStatusVenda,
  relatorioPedidoToVendaDetalhe,
  statusVendaTone,
} from "@/lib/pedidos/venda-detalhe";
import { fetchRelatorioDatasetServer } from "@/lib/api/relatorios/relatorios.functions";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { fetchAtendimentoStatsServer } from "@/lib/api/atendimento/atendimento.functions";
import { hasBrowserSupabaseConfig } from "@/lib/shared/runtime";

export const Route = createFileRoute("/_authenticated/painel/relatorios")({
  component: RelatoriosInteligencia,
});

const chartColors = ["#9c7a16", "#d79f1a", "#47654b", "#9f6c53", "#d3b04f", "#6b8b71", "#b55337"];
type ReportKey = "vendas" | "produtos" | "delivery" | "operacao" | "financeiro" | "crm" | "estoque";

function RelatoriosInteligencia() {
  return <Outlet />;
}

export type { ReportKey };

export function RelatoriosInteligenciaPage({ forcedReport }: { forcedReport?: ReportKey }) {
  const tenantSlug = useTenantSlug();
  const useRealData = hasBrowserSupabaseConfig();
  const { data: realDataset } = useQuery({
    queryKey: ["relatorio-dataset-real", tenantSlug],
    queryFn: () => fetchRelatorioDatasetServer({ data: tenantSlug }),
    enabled: useRealData,
  });
  const { data: atendimentoStats } = useQuery({
    queryKey: ["atendimento-stats"],
    queryFn: () => fetchAtendimentoStatsServer(),
    enabled: useRealData,
  });
  const [dataset, setDataset] = useState<RelatorioDataset>(() => carregarRelatorioDataset());
  const [filtros, setFiltros] = useState(getDefaultFiltros);
  const [vendaSelecionada, setVendaSelecionada] = useState<RelatorioPedido | null>(null);
  const activeReport = forcedReport ?? null;

  useEffect(() => {
    if (realDataset) {
      setDataset(realDataset);
      return;
    }
    setDataset(carregarRelatorioDataset());
  }, [realDataset]);

  const pedidosFiltrados = useMemo(
    () => aplicarFiltros(dataset.pedidos, filtros),
    [dataset.pedidos, filtros],
  );
  const historicoPedidos = useMemo(
    () =>
      [...pedidosFiltrados].sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
      ),
    [pedidosFiltrados],
  );
  const financeiroFiltrado = useMemo(
    () => filtrarFinanceiro(dataset.financeiro, filtros),
    [dataset.financeiro, filtros],
  );
  const caixasFiltrados = useMemo(
    () => filtrarCaixas(dataset.caixas, filtros),
    [dataset.caixas, filtros],
  );
  const notasFiltradas = useMemo(
    () => filtrarNotas(dataset.notas, filtros),
    [dataset.notas, filtros],
  );

  const pedidosValidos = pedidosFiltrados.filter((pedido) => pedido.status !== "cancelado");
  const totalFaturado = sum(pedidosValidos, "total");
  const lucro = pedidosValidos.reduce((sum, pedido) => sum + (pedido.total - pedido.custo), 0);
  const margem = totalFaturado ? (lucro / totalFaturado) * 100 : 0;
  const pedidosHoje = pedidosValidos.filter((pedido) => isSameDay(pedido.data, new Date()));
  const faturamentoHoje = sum(pedidosHoje, "total");
  const inicioSemana = startOfDaysAgo(6);
  const faturamentoSemana = pedidosValidos
    .filter((pedido) => new Date(pedido.data) >= inicioSemana)
    .reduce((sum, pedido) => sum + pedido.total, 0);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const faturamentoMes = pedidosValidos
    .filter((pedido) => new Date(pedido.data) >= inicioMes)
    .reduce((sum, pedido) => sum + pedido.total, 0);
  const ticketMedio = pedidosValidos.length ? totalFaturado / pedidosValidos.length : 0;
  const clientesAtendidos = new Set(pedidosValidos.map((pedido) => pedido.clienteId)).size;
  const produtosVendidos = pedidosValidos.reduce(
    (sum, pedido) => sum + pedido.itens.reduce((acc, item) => acc + item.quantidade, 0),
    0,
  );
  const cancelados = pedidosFiltrados.filter((pedido) => pedido.status === "cancelado");
  const taxaCancelamento = pedidosFiltrados.length
    ? (cancelados.length / pedidosFiltrados.length) * 100
    : 0;
  const tempoMedioPreparo = average(pedidosValidos.map((pedido) => pedido.tempoPreparo));
  const tempoMedioEntrega = average(
    pedidosValidos.map((pedido) => pedido.tempoEntrega ?? 0).filter(Boolean),
  );
  const vendasPorCanal = aggregateBy(
    pedidosValidos,
    (pedido) => labelCanal(pedido.canal),
    (pedido) => pedido.total,
  );
  const canalTop = vendasPorCanal[0]?.label ?? "-";
  const produtoTop = getProdutoRanking(pedidosValidos)[0]?.nome ?? "-";
  const periodoAnterior = compararPeriodo(dataset.pedidos, filtros);
  const crescimento = periodoAnterior.total
    ? ((totalFaturado - periodoAnterior.total) / periodoAnterior.total) * 100
    : 0;
  const entregas = pedidosValidos.filter((pedido) => pedido.tempoEntrega);
  const deliveryTotal = entregas.length;
  const faturamentoDelivery = entregas.reduce((sum, pedido) => sum + pedido.total, 0);
  const taxaEntrega = entregas.reduce((sum, pedido) => sum + pedido.taxaEntrega, 0);
  const atrasados = entregas.filter((pedido) => (pedido.tempoEntrega ?? 0) > 40).length;
  const mesas = pedidosValidos.filter((pedido) => pedido.mesa);
  const comandasAbertas = pedidosFiltrados.filter(
    (pedido) => pedido.status === "em_preparo" && pedido.mesa,
  ).length;
  const comandasFechadas = pedidosValidos.filter(
    (pedido) => pedido.mesa && pedido.status !== "em_preparo",
  ).length;
  const entradas = financeiroFiltrado.filter((item) => item.tipo === "entrada");
  const saidas = financeiroFiltrado.filter((item) => item.tipo === "saida");
  const totalEntradas = sum(entradas, "valor");
  const totalSaidas = sum(saidas, "valor");
  const saldoCaixa = totalEntradas - totalSaidas;
  const produtosBaixoEstoque = dataset.produtos.filter(
    (produto) => produto.estoque > 0 && produto.estoque <= produto.estoqueMinimo,
  );
  const produtosSemEstoque = dataset.produtos.filter((produto) => produto.estoque <= 0);
  const clientesInativos = dataset.clientes.filter((cliente) => cliente.ultimoPedidoDias >= 30);
  const valorFiscal = sum(notasFiltradas, "valor");
  const xmlEnviados = notasFiltradas.filter((nota) => nota.xmlEnviado).length;

  const resumoExecutivo = [
    `Hoje a loja vendeu ${formatBRL(faturamentoHoje)}, com ${pedidosHoje.length} pedidos e ticket medio de ${formatBRL(pedidosHoje.length ? faturamentoHoje / pedidosHoje.length : 0)}.`,
    `O canal que mais vendeu foi ${canalTop}.`,
    `O produto mais vendido foi ${produtoTop}.`,
    `A margem media esta em ${formatPercent(margem)}.`,
    `Existem ${produtosBaixoEstoque.length + produtosSemEstoque.length} produtos com estoque baixo ou zerado.`,
    `${clientesInativos.length} clientes estao inativos e podem receber campanha no WhatsApp.`,
  ];

  const alertas = [
    {
      titulo: "Estoque baixo",
      detalhe: `${productsLabel(produtosBaixoEstoque.length)} precisam de reposicao.`,
      tone: "warning" as const,
    },
    {
      titulo: "Queda nas vendas",
      detalhe: `Variacao do periodo em ${formatPercent(crescimento)}.`,
      tone: crescimento < 0 ? ("warning" as const) : ("success" as const),
    },
    {
      titulo: "Produto acelerado",
      detalhe: `${produtoTop} lidera o giro da vitrine.`,
      tone: "info" as const,
    },
    {
      titulo: "Produto parado",
      detalhe: `${getProdutoRanking(pedidosValidos, "asc")[0]?.nome ?? "Sem leitura"} pede revisao de mix.`,
      tone: "warning" as const,
    },
    {
      titulo: "Caixa",
      detalhe: `Diferenca acumulada de ${formatBRL(caixasFiltrados.reduce((sum, item) => sum + item.diferenca, 0))}.`,
      tone: caixasFiltrados.some((item) => item.diferenca !== 0)
        ? ("warning" as const)
        : ("success" as const),
    },
    {
      titulo: "Cliente importante inativo",
      detalhe: `${clientesInativos[0]?.nome ?? "Sem alerta"} merece reativacao.`,
      tone: "warning" as const,
    },
    {
      titulo: "Motoboy com atraso",
      detalhe: `${getRankingMotoboys(pedidosValidos, dataset).at(-1)?.nome ?? "Sem leitura"} esta com SLA mais sensivel.`,
      tone: "info" as const,
    },
    {
      titulo: "Despesa acima do normal",
      detalhe: `${saidas[0]?.categoria ?? "Sem saidas"} e a maior pressao atual.`,
      tone: "warning" as const,
    },
    {
      titulo: "Margem baixa",
      detalhe: `${getProdutosMargem(pedidosValidos)[0]?.nome ?? "Sem leitura"} precisa de ajuste de custo ou preco.`,
      tone: "warning" as const,
    },
  ];

  const vendasDia = toSeriesByDay(pedidosValidos);
  const fluxoCaixa = toCashflowSeries(financeiroFiltrado);
  const vendasHora = aggregateBy(
    pedidosValidos,
    (pedido) => `${new Date(pedido.data).getHours()}h`,
    (pedido) => pedido.total,
  );
  const pagamentos = aggregateBy(
    pedidosValidos,
    (pedido) => pedido.pagamento.toUpperCase(),
    (pedido) => pedido.total,
  );
  const categorias = aggregateItems(
    pedidosValidos,
    (item) => item.categoria,
    (item) => item.quantidade,
  );
  const bairros = aggregateBy(
    entregas,
    (pedido) => pedido.bairro,
    () => 1,
  );
  const motoboys = getRankingMotoboys(pedidosValidos, dataset);
  const clientesRanking = getRankingClientes(pedidosValidos, dataset);
  const garcons = aggregateBy(
    mesas,
    (pedido) => pedido.atendenteNome,
    (pedido) => pedido.total,
  );
  const formasCaixa = aggregateBy(
    entradas,
    (item) => item.forma.toUpperCase(),
    (item) => item.valor,
  );
  const dre = [
    { label: "Receitas", valor: totalEntradas },
    { label: "Custos", valor: pedidosValidos.reduce((sum, pedido) => sum + pedido.custo, 0) },
    { label: "Despesas", valor: totalSaidas },
    { label: "Resultado", valor: lucro - totalSaidas },
  ];

  function setPeriodo(days: number) {
    setFiltros((current) => ({
      ...current,
      dataInicial: startOfDaysAgo(days).toISOString().slice(0, 10),
      dataFinal: new Date().toISOString().slice(0, 10),
    }));
  }

  function copiarResumo() {
    const texto = resumoExecutivo.join("\n");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(texto);
      toast.success("Resumo copiado");
      return;
    }
    toast.info("Clipboard indisponivel neste ambiente");
  }

  function acaoVisual(label: string) {
    toast.success(`${label} preparado visualmente neste painel.`);
  }

  return (
    <>
    <GestaoPage
      title="Relatorios e Inteligencia"
      subtitle="Painel estrategico com leitura comercial, operacional, financeira e CRM da Abelha & Mel."
      eyebrow="Centro analitico"
      actions={
        <>
          <GestaoButton variant="secondary" size="sm" onClick={() => acaoVisual("PDF visual")}>
            <Download className="size-4" /> PDF
          </GestaoButton>
          <GestaoButton variant="secondary" size="sm" onClick={() => acaoVisual("Excel/CSV")}>
            <FileSpreadsheet className="size-4" /> Excel
          </GestaoButton>
          <GestaoButton variant="secondary" size="sm" onClick={() => acaoVisual("Impressao")}>
            <Printer className="size-4" /> Imprimir
          </GestaoButton>
          <GestaoButton variant="secondary" size="sm" onClick={copiarResumo}>
            <Copy className="size-4" /> Copiar
          </GestaoButton>
          <GestaoButton
            variant="secondary"
            size="sm"
            onClick={() => acaoVisual("Envio por WhatsApp")}
          >
            <MessageCircle className="size-4" /> WhatsApp
          </GestaoButton>
          <GestaoButton size="sm" onClick={() => acaoVisual("Envio para contabilidade")}>
            <Send className="size-4" /> Contabilidade
          </GestaoButton>
        </>
      }
    >
      <GestaoCard>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <GestaoSectionTitle
              eyebrow="Relatorios por painel"
              title={activeReport ? getReportTitle(activeReport) : "Escolha um relatorio"}
              description={
                activeReport
                  ? "Este painel mostra apenas o relatorio selecionado, com filtros proprios para esse contexto."
                  : "Clique em um painel abaixo para entrar no relatorio desejado."
              }
            />
            {activeReport ? (
              <Link
                to="/painel/relatorios"
                className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-[color:var(--honey-line)] bg-background px-3 text-xs font-semibold transition hover:bg-muted/50"
              >
                <ArrowLeft className="size-4" /> Voltar
              </Link>
            ) : null}
          </div>

          {activeReport === null ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {getReportCards({
                totalFaturado,
                pedidosValidos: pedidosValidos.length,
                produtoTop,
                faturamentoDelivery,
                deliveryTotal,
                comandasFechadas,
                caixasCount: caixasFiltrados.length,
                saldoCaixa,
                notasCount: notasFiltradas.length,
                clientesCount: dataset.clientes.length,
                clientesInativos: clientesInativos.length,
                produtosBaixoEstoque: produtosBaixoEstoque.length,
                produtosSemEstoque: produtosSemEstoque.length,
              }).map((report) => (
                <Link key={report.key} to={getReportPath(report.key)} className="text-left">
                  <GestaoCard className="h-full transition hover:-translate-y-1 hover:shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid size-12 place-items-center rounded-2xl bg-[color:var(--gestao-blush)] text-[color:var(--gestao-green)]">
                        {report.icon}
                      </div>
                      <StatusPill tone="info">abrir</StatusPill>
                    </div>
                    <h3 className="mt-4 font-display text-2xl text-[color:var(--gestao-ink)]">
                      {report.title}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">{report.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {report.metrics.map((metric) => (
                        <span
                          key={`${report.key}-${metric}`}
                          className="rounded-full bg-[color:var(--gestao-cream)] px-3 py-1 text-xs text-[color:var(--gestao-ink)]"
                        >
                          {metric}
                        </span>
                      ))}
                    </div>
                  </GestaoCard>
                </Link>
              ))}
            </div>
          ) : (
            <ReportFilters
              report={activeReport}
              filtros={filtros}
              setFiltros={setFiltros}
              dataset={dataset}
              setPeriodo={setPeriodo}
            />
          )}
        </div>
      </GestaoCard>

      {activeReport === null ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <GestaoStat
              label="Faturamento total"
              value={formatBRL(totalFaturado)}
              icon={<DollarSign className="size-5" />}
              hint={`${formatPercent(crescimento)} vs periodo anterior`}
            />
            <GestaoStat
              label="Faturamento do dia"
              value={formatBRL(faturamentoHoje)}
              icon={<CalendarRange className="size-5" />}
              hint={`${pedidosHoje.length} pedidos hoje`}
            />
            <GestaoStat
              label="Faturamento da semana"
              value={formatBRL(faturamentoSemana)}
              icon={<TrendingUp className="size-5" />}
              hint="Ultimos 7 dias"
            />
            <GestaoStat
              label="Faturamento do mes"
              value={formatBRL(faturamentoMes)}
              icon={<BadgeDollarSign className="size-5" />}
              hint="Mes corrente"
            />
            <GestaoStat
              label="Total de pedidos"
              value={String(pedidosFiltrados.length)}
              icon={<ShoppingBag className="size-5" />}
              hint={`${cancelados.length} cancelados`}
            />
            <GestaoStat
              label="Ticket medio"
              value={formatBRL(ticketMedio)}
              icon={<Receipt className="size-5" />}
              hint="Media por pedido valido"
            />
            <GestaoStat
              label="Lucro estimado"
              value={formatBRL(lucro)}
              icon={<ArrowUpRight className="size-5" />}
              hint={`Margem ${formatPercent(margem)}`}
            />
            <GestaoStat
              label="Clientes atendidos"
              value={String(clientesAtendidos)}
              icon={<Users className="size-5" />}
              hint={`${clientesInativos.length} inativos`}
            />
            <GestaoStat
              label="Produtos vendidos"
              value={String(produtosVendidos)}
              icon={<CakeSlice className="size-5" />}
              hint={produtoTop}
            />
            <GestaoStat
              label="Pedidos cancelados"
              value={String(cancelados.length)}
              icon={<ArrowDownRight className="size-5" />}
              hint={`Taxa ${formatPercent(taxaCancelamento)}`}
            />
            <GestaoStat
              label="Tempo medio de preparo"
              value={`${tempoMedioPreparo.toFixed(0)} min`}
              icon={<Timer className="size-5" />}
              hint="SLA da cozinha"
            />
            <GestaoStat
              label="Tempo medio de entrega"
              value={`${tempoMedioEntrega.toFixed(0)} min`}
              icon={<Bike className="size-5" />}
              hint={`${atrasados} atrasos`}
            />
            <GestaoStat
              label="Canal campeao"
              value={canalTop}
              icon={<Store className="size-5" />}
              hint="Maior faturamento"
            />
            <GestaoStat
              label="Produto campeao"
              value={produtoTop}
              icon={<Target className="size-5" />}
              hint="Maior volume vendido"
            />
            <GestaoStat
              label="Saldo do caixa"
              value={formatBRL(saldoCaixa)}
              icon={<ClipboardList className="size-5" />}
              hint={`Entradas ${formatBRL(totalEntradas)}`}
            />
            <GestaoStat
              label="Valor fiscal emitido"
              value={formatBRL(valorFiscal)}
              icon={<Receipt className="size-5" />}
              hint={`${xmlEnviados} XML enviados`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <GestaoCard>
              <GestaoSectionTitle
                eyebrow="Resumo para o dono"
                title="Leitura automatica do periodo"
                description="Frases prontas para decisao e repasse rapido da operacao."
              />
              <div className="mt-4 space-y-3">
                {resumoExecutivo.map((texto) => (
                  <div
                    key={texto}
                    className="rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/50 px-4 py-3 text-sm text-[color:var(--gestao-ink)]"
                  >
                    {texto}
                  </div>
                ))}
              </div>
            </GestaoCard>
            <GestaoCard className="bg-[linear-gradient(180deg,white,var(--gestao-cream))]">
              <GestaoSectionTitle
                eyebrow="Alertas inteligentes"
                title="Onde agir agora"
                description="Sinais de margem, estoque, clientes e caixa."
              />
              <div className="mt-4 grid gap-3">
                {alertas.map((alerta) => (
                  <div
                    key={alerta.titulo}
                    className="rounded-2xl border border-[color:var(--honey-line)] bg-card px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="size-4 text-[color:var(--gestao-gold-deep)]" />
                        <p className="text-sm font-semibold text-[color:var(--gestao-ink)]">
                          {alerta.titulo}
                        </p>
                      </div>
                      <StatusPill tone={alerta.tone}>
                        {alerta.tone === "success" ? "ok" : "atencao"}
                      </StatusPill>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{alerta.detalhe}</p>
                  </div>
                ))}
              </div>
            </GestaoCard>
          </div>
        </>
      ) : null}

      {activeReport ? (
        <Tabs value={activeReport}>
          <TabsContent value="vendas" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard title="Faturamento por dia" subtitle="Linha de receita do periodo.">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={vendasDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatBRL(value)} />
                    <Line
                      dataKey="valor"
                      type="monotone"
                      stroke="#9c7a16"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Fluxo de caixa" subtitle="Entradas e saidas no periodo.">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={fluxoCaixa}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatBRL(value)} />
                    <Legend />
                    <Line dataKey="entradas" stroke="#47654b" strokeWidth={3} dot={false} />
                    <Line dataKey="saidas" stroke="#b55337" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Vendas por canal" subtitle="Comparativo entre operacoes da loja.">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={vendasPorCanal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatBRL(value)} />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                      {vendasPorCanal.map((entry, index) => (
                        <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Formas de pagamento" subtitle="Mix de recebimento.">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pagamentos}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={64}
                      outerRadius={96}
                    >
                      {pagamentos.map((entry, index) => (
                        <Cell key={entry.label} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatBRL(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <GestaoCard>
              <GestaoSectionTitle
                eyebrow="Leitura comercial"
                title="Resumo de vendas"
                description="Volume por horario, categoria, produto, cliente e atendente."
              />
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <RankingTable
                  title="Vendas por horario"
                  rows={vendasHora
                    .slice(0, 8)
                    .map((item) => ({ nome: item.label, valor: formatBRL(item.value) }))}
                />
                <RankingTable
                  title="Vendas por categoria"
                  rows={categorias
                    .slice(0, 8)
                    .map((item) => ({ nome: item.label, valor: `${item.value} itens` }))}
                />
                <RankingTable
                  title="Vendas por cliente"
                  rows={clientesRanking
                    .slice(0, 8)
                    .map((item) => ({ nome: item.nome, valor: formatBRL(item.total) }))}
                />
                <RankingTable
                  title="Vendas por atendente"
                  rows={aggregateBy(
                    pedidosValidos,
                    (pedido) => pedido.atendenteNome,
                    (pedido) => pedido.total,
                  )
                    .slice(0, 8)
                    .map((item) => ({ nome: item.label, valor: formatBRL(item.value) }))}
                />
              </div>
            </GestaoCard>

            <GestaoCard>
              <GestaoSectionTitle
                eyebrow="Historico"
                title="Historico de pedidos"
                description="Clique em uma venda para ver itens, pagamento, entrega e NFC-e."
              />
              {historicoPedidos.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  Nenhum pedido encontrado no periodo selecionado.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <GestaoTable>
                    <GestaoTableHead>
                      <tr>
                        <th className="p-3">Pedido</th>
                        <th className="p-3">Data</th>
                        <th className="p-3">Canal</th>
                        <th className="hidden p-3 md:table-cell">Cliente</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Total</th>
                      </tr>
                    </GestaoTableHead>
                    <tbody>
                      {historicoPedidos.map((pedido) => (
                        <tr
                          key={pedido.id}
                          className="cursor-pointer border-t border-[color:var(--honey-line)] transition hover:bg-[color:var(--gestao-cream)]/60"
                          onClick={() => setVendaSelecionada(pedido)}
                        >
                          <td className="p-3 text-sm font-semibold">#{pedido.numero}</td>
                          <td className="p-3 whitespace-nowrap text-sm text-muted-foreground">
                            {new Date(pedido.data).toLocaleString("pt-BR")}
                          </td>
                          <td className="p-3 text-sm">{labelCanal(pedido.canal)}</td>
                          <td className="hidden p-3 text-sm md:table-cell">{pedido.clienteNome}</td>
                          <td className="p-3">
                            <StatusPill tone={statusVendaTone(pedido.status)}>
                              {labelStatusVenda(pedido.status)}
                            </StatusPill>
                          </td>
                          <td className="p-3 text-right text-sm font-semibold">
                            {formatBRL(pedido.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </GestaoTable>
                </div>
              )}
            </GestaoCard>
          </TabsContent>

          <TabsContent value="produtos" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title="Produtos mais vendidos"
                subtitle="Barra horizontal com volume por item."
              >
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getProdutoRanking(pedidosValidos).slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="nome" width={140} />
                    <Tooltip />
                    <Bar dataKey="quantidade" fill="#9c7a16" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="Mix e margem"
                  title="Produtos em foco"
                  description="Itens campeoes, baixa performance e margem."
                />
                <div className="mt-4 grid gap-3">
                  <MiniStat
                    label="Mais vendidos"
                    value={getProdutoRanking(pedidosValidos)[0]?.nome ?? "-"}
                    hint={`${getProdutoRanking(pedidosValidos)[0]?.quantidade ?? 0} unidades`}
                  />
                  <MiniStat
                    label="Menos vendidos"
                    value={getProdutoRanking(pedidosValidos, "asc")[0]?.nome ?? "-"}
                    hint="Revisar exposicao e combo"
                  />
                  <MiniStat
                    label="Maior faturamento"
                    value={getProdutosFaturamento(pedidosValidos)[0]?.nome ?? "-"}
                    hint={formatBRL(getProdutosFaturamento(pedidosValidos)[0]?.valor ?? 0)}
                  />
                  <MiniStat
                    label="Maior margem"
                    value={getProdutosMaiorMargem(pedidosValidos)[0]?.nome ?? "-"}
                    hint={formatPercent(getProdutosMaiorMargem(pedidosValidos)[0]?.margem ?? 0)}
                  />
                </div>
              </GestaoCard>
            </div>
            <GestaoCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Faturamento</TableHead>
                    <TableHead>Margem</TableHead>
                    <TableHead>Estoque</TableHead>
                    <TableHead>Cancelamentos</TableHead>
                    <TableHead>Preparo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getProdutosDetalhados(pedidosFiltrados, dataset)
                    .slice(0, 10)
                    .map((item) => (
                      <TableRow key={item.nome}>
                        <TableCell className="font-medium">{item.nome}</TableCell>
                        <TableCell>{formatBRL(item.faturamento)}</TableCell>
                        <TableCell>{formatPercent(item.margem)}</TableCell>
                        <TableCell>{item.estoque}</TableCell>
                        <TableCell>{formatPercent(item.cancelamento)}</TableCell>
                        <TableCell>{item.preparo} min</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </GestaoCard>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MiniKpi
                label="Pedidos delivery"
                value={String(deliveryTotal)}
                icon={<Bike className="size-4" />}
              />
              <MiniKpi
                label="Faturamento delivery"
                value={formatBRL(faturamentoDelivery)}
                icon={<DollarSign className="size-4" />}
              />
              <MiniKpi
                label="Taxa arrecadada"
                value={formatBRL(taxaEntrega)}
                icon={<BadgeDollarSign className="size-4" />}
              />
              <MiniKpi
                label="Atrasados"
                value={String(atrasados)}
                icon={<Timer className="size-4" />}
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title="Pedidos por bairro"
                subtitle="Distribuicao real dos pedidos por concentracao."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  {bairros.slice(0, 6).map((bairro, index) => (
                    <div
                      key={bairro.label}
                      className="rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/45 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-[color:var(--gestao-ink)]">{bairro.label}</p>
                        <span className="text-xs text-muted-foreground">
                          {bairro.value} pedidos
                        </span>
                      </div>
                      <div className="mt-3 h-3 rounded-full bg-muted">
                        <div
                          className="h-3 rounded-full"
                          style={{
                            width: `${Math.min(100, bairro.value * 14)}%`,
                            backgroundColor: chartColors[index % chartColors.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </ChartCard>
              <ChartCard title="Entregas por motoboy" subtitle="Volume e valor repassado.">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={motoboys}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c3" />
                    <XAxis dataKey="nome" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="entregas" fill="#47654b" radius={[10, 10, 0, 0]} />
                    <Bar dataKey="repasse" fill="#d79f1a" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <GestaoCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead>Pedidos</TableHead>
                    <TableHead>Faturamento</TableHead>
                    <TableHead>Tempo medio</TableHead>
                    <TableHead>Cancelados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {["delivery", "whatsapp", "quero_delivery", "ifood"].map((canal) => {
                    const subset = entregas.filter((pedido) => pedido.canal === canal);
                    const canceladosCanal = pedidosFiltrados.filter(
                      (pedido) => pedido.canal === canal && pedido.status === "cancelado",
                    ).length;
                    return (
                      <TableRow key={canal}>
                        <TableCell className="font-medium">{labelCanal(canal)}</TableCell>
                        <TableCell>{subset.length}</TableCell>
                        <TableCell>{formatBRL(sum(subset, "total"))}</TableCell>
                        <TableCell>
                          {average(subset.map((pedido) => pedido.tempoEntrega ?? 0)).toFixed(0)} min
                        </TableCell>
                        <TableCell>{canceladosCanal}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </GestaoCard>
          </TabsContent>

          <TabsContent value="operacao" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="Mesas e balcao"
                  title="Operacao interna"
                  description="Mesas mais movimentadas, comandas e pico."
                />
                <div className="mt-4 grid gap-3">
                  <MiniStat
                    label="Mesa mais movimentada"
                    value={
                      aggregateBy(
                        mesas,
                        (pedido) => pedido.mesa ?? "-",
                        () => 1,
                      )[0]?.label ?? "-"
                    }
                    hint="Maior giro de comandas"
                  />
                  <MiniStat
                    label="Tempo medio de permanencia"
                    value={`${(tempoMedioPreparo + 22).toFixed(0)} min`}
                    hint="Estimativa operacional"
                  />
                  <MiniStat
                    label="Comandas abertas"
                    value={String(comandasAbertas)}
                    hint="Em preparo no salao"
                  />
                  <MiniStat
                    label="Comandas fechadas"
                    value={String(comandasFechadas)}
                    hint="Pedidos concluidos nas mesas"
                  />
                  <MiniStat
                    label="Vendas no balcao"
                    value={formatBRL(
                      sum(
                        pedidosValidos.filter((pedido) => pedido.canal === "pdv"),
                        "total",
                      ),
                    )}
                    hint="PDV do periodo"
                  />
                </div>
              </GestaoCard>
              <ChartCard title="Vendas por garcom" subtitle="Atendimento de mesas.">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={garcons}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatBRL(value)} />
                    <Bar dataKey="value" fill="#6b8b71" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="Caixa"
                  title="Resumo por operador e forma"
                  description="Abertura, fechamento, sangrias e historico."
                />
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {caixasFiltrados.slice(0, 4).map((caixa) => (
                    <div
                      key={caixa.id}
                      className="rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 p-4"
                    >
                      <p className="text-xs text-muted-foreground">
                        {new Date(caixa.data).toLocaleDateString("pt-BR")}
                      </p>
                      <p className="mt-1 font-medium text-[color:var(--gestao-ink)]">
                        {caixa.operador}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Abertura {formatBRL(caixa.abertura)} · Fechamento{" "}
                        {formatBRL(caixa.fechamento)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Sangrias {formatBRL(caixa.sangrias)} · Suprimentos{" "}
                        {formatBRL(caixa.suprimentos)}
                      </p>
                    </div>
                  ))}
                </div>
              </GestaoCard>
              <GestaoCard>
                <RankingTable
                  title="Resumo por forma de pagamento"
                  rows={formasCaixa.map((item) => ({
                    nome: item.label,
                    valor: formatBRL(item.value),
                  }))}
                />
              </GestaoCard>
            </div>
          </TabsContent>

          <TabsContent value="financeiro" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="Financeiro"
                  title="DRE simples"
                  description="Receitas, custos, despesas e resultado operacional."
                />
                <div className="mt-4 space-y-3">
                  {dre.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/45 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-[color:var(--gestao-ink)]">
                        {item.label}
                      </p>
                      <p className="font-display text-xl text-[color:var(--gestao-ink)]">
                        {formatBRL(item.valor)}
                      </p>
                    </div>
                  ))}
                </div>
              </GestaoCard>
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="Fiscal"
                  title="Notas e XML"
                  description="Area fiscal visual para acompanhamento."
                />
                <div className="mt-4 grid gap-3">
                  <MiniStat
                    label="NFC-e emitidas"
                    value={String(
                      notasFiltradas.filter(
                        (nota) => nota.tipo === "NFC-e" && nota.status === "emitida",
                      ).length,
                    )}
                    hint="No periodo filtrado"
                  />
                  <MiniStat
                    label="NF-e emitidas"
                    value={String(
                      notasFiltradas.filter(
                        (nota) => nota.tipo === "NF-e" && nota.status === "emitida",
                      ).length,
                    )}
                    hint="Notas de fornecedores e vendas"
                  />
                  <MiniStat
                    label="Notas canceladas"
                    value={String(
                      notasFiltradas.filter((nota) => nota.status === "cancelada").length,
                    )}
                    hint="Acompanhar motivo"
                  />
                  <MiniStat
                    label="XML enviados"
                    value={String(xmlEnviados)}
                    hint="Prontos para contabilidade"
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <GestaoButton
                    variant="secondary"
                    size="sm"
                    onClick={() => acaoVisual("Exportacao XML")}
                  >
                    <Download className="size-4" /> Exportar XML
                  </GestaoButton>
                  <GestaoButton
                    variant="secondary"
                    size="sm"
                    onClick={() => acaoVisual("Envio contabil")}
                  >
                    <Send className="size-4" /> Enviar para contabilidade
                  </GestaoButton>
                </div>
              </GestaoCard>
            </div>
            <GestaoCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descricao</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financeiroFiltrado.slice(0, 12).map((item: RelatorioFinanceiro) => (
                    <TableRow key={item.id}>
                      <TableCell>{new Date(item.data).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="font-medium">{item.descricao}</TableCell>
                      <TableCell>{item.categoria}</TableCell>
                      <TableCell>{item.tipo}</TableCell>
                      <TableCell className="text-right">{formatBRL(item.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </GestaoCard>
          </TabsContent>

          <TabsContent value="crm" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard title="Ranking visual de clientes" subtitle="Top clientes por receita.">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={clientesRanking.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d9d2c3" />
                    <XAxis dataKey="nome" hide />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatBRL(value)} />
                    <Bar dataKey="total" fill="#9f6c53" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="CRM e fidelidade"
                  title="Clientes para acao"
                  description="Recorrencia, pontos e reativacao."
                />
                <div className="mt-4 grid gap-3">
                  <MiniStat
                    label="Clientes cadastrados"
                    value={String(dataset.clientes.length)}
                    hint={`${clientesRanking.filter((item) => item.pedidos > 1).length} recorrentes`}
                  />
                  <MiniStat
                    label="Novos clientes"
                    value={String(clientesRanking.filter((item) => item.pedidos === 1).length)}
                    hint="Primeira compra no periodo"
                  />
                  <MiniStat
                    label="Clientes inativos"
                    value={String(clientesInativos.length)}
                    hint="30 dias ou mais sem compra"
                  />
                  <MiniStat
                    label="Aniversariantes do mes"
                    value={String(
                      dataset.clientes.filter((cliente) => cliente.aniversarioMes).length,
                    )}
                    hint="Oportunidade de campanha"
                  />
                  <MiniStat
                    label="Proximos de beneficio"
                    value={String(
                      dataset.clientes.filter(
                        (cliente) => cliente.pontos >= 150 && cliente.pontos < 220,
                      ).length,
                    )}
                    hint="Fidelidade aquecida"
                  />
                </div>
              </GestaoCard>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <GestaoCard>
                <RankingTable
                  title="Clientes para reativacao"
                  rows={clientesInativos.slice(0, 8).map((cliente) => ({
                    nome: cliente.nome,
                    valor: `${cliente.ultimoPedidoDias} dias sem compra`,
                  }))}
                />
              </GestaoCard>
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="WhatsApp e campanhas"
                  title="Painel de campanhas"
                  description="Mensagens, conversao e receita."
                />
                <div className="mt-4 space-y-3">
                  {dataset.campanhas.map((campanha) => (
                    <div
                      key={campanha.id}
                      className="rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-[color:var(--gestao-ink)]">
                          {campanha.nome}
                        </p>
                        <StatusPill tone="info">
                          {formatPercent(
                            campanha.entregues
                              ? (campanha.conversoes / campanha.entregues) * 100
                              : 0,
                          )}
                        </StatusPill>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {campanha.enviadas} enviadas · {campanha.entregues} entregues ·{" "}
                        {campanha.respondidas} respondidas · receita {formatBRL(campanha.receita)}
                      </p>
                    </div>
                  ))}
                </div>
              </GestaoCard>
            </div>
            {atendimentoStats ? (
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="Atendimento"
                  title="WhatsApp em tempo real"
                  description="Conversas abertas e volume dos ultimos 7 dias."
                />
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <MiniStat
                    label="Conversas abertas"
                    value={String(atendimentoStats.openConversations)}
                    hint="Evolution + Meta"
                  />
                  <MiniStat
                    label="Mensagens recebidas (7d)"
                    value={String(atendimentoStats.inboundMessages7d)}
                    hint="Entrada de clientes"
                  />
                  <MiniStat
                    label="Automacoes enviadas (7d)"
                    value={String(atendimentoStats.automationsSent7d)}
                    hint="Respostas automaticas"
                  />
                </div>
                <Link
                  to="/painel/atendimento/conversas"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-sage underline"
                >
                  <MessageCircle className="size-4" />
                  Abrir painel de conversas
                </Link>
              </GestaoCard>
            ) : null}
          </TabsContent>

          <TabsContent value="estoque" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MiniKpi
                label="Estoque atual"
                value={String(dataset.produtos.reduce((sum, produto) => sum + produto.estoque, 0))}
                icon={<Boxes className="size-4" />}
              />
              <MiniKpi
                label="Produtos em alerta"
                value={String(produtosBaixoEstoque.length)}
                icon={<AlertTriangle className="size-4" />}
              />
              <MiniKpi
                label="Sem estoque"
                value={String(produtosSemEstoque.length)}
                icon={<ArrowDownRight className="size-4" />}
              />
              <MiniKpi
                label="Custo de estoque"
                value={formatBRL(
                  dataset.produtos.reduce(
                    (sum, produto) => sum + produto.estoque * produto.custo,
                    0,
                  ),
                )}
                icon={<DollarSign className="size-4" />}
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="Abastecimento"
                  title="Sugestao de compra"
                  description="Itens para fornecedor e reposicao por ficha tecnica."
                />
                <div className="mt-4 space-y-3">
                  {[...produtosBaixoEstoque, ...produtosSemEstoque].slice(0, 8).map((produto) => (
                    <div
                      key={produto.id}
                      className="flex items-center justify-between rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-[color:var(--gestao-ink)]">
                          {produto.nome}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {produto.categoria} · minimo {produto.estoqueMinimo}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        comprar {Math.max(produto.estoqueMinimo * 2 - produto.estoque, 0)} un.
                      </p>
                    </div>
                  ))}
                </div>
              </GestaoCard>
              <GestaoCard>
                <GestaoSectionTitle
                  eyebrow="Estoque e perdas"
                  title="Leitura resumida"
                  description="Entradas, saidas, perdas e validade proxima do estoque."
                />
                <div className="mt-4 grid gap-3">
                  <MiniStat label="Entradas" value="126 un." hint="Reposicoes recentes" />
                  <MiniStat
                    label="Saidas"
                    value={`${produtosVendidos} un.`}
                    hint="Baixa automatica por venda"
                  />
                  <MiniStat label="Perdas" value="11 un." hint="Ajustar manipulacao e validade" />
                  <MiniStat
                    label="Validade proxima"
                    value="4 itens"
                    hint="Priorizar giro em combos"
                  />
                  <MiniStat
                    label="Ingredientes mais consumidos"
                    value="Chocolate e leite condensado"
                    hint="Base do mix atual"
                  />
                </div>
              </GestaoCard>
            </div>
          </TabsContent>
        </Tabs>
      ) : null}
    </GestaoPage>
      <VendaDetalheModal
        open={Boolean(vendaSelecionada)}
        onClose={() => setVendaSelecionada(null)}
        pedidoId={useRealData ? (vendaSelecionada?.id ?? null) : null}
        venda={
          vendaSelecionada && !useRealData
            ? relatorioPedidoToVendaDetalhe(vendaSelecionada)
            : null
        }
      />
    </>
  );
}

function ReportFilters({
  report,
  filtros,
  setFiltros,
  dataset,
  setPeriodo,
}: {
  report: ReportKey;
  filtros: ReturnType<typeof getDefaultFiltros>;
  setFiltros: React.Dispatch<React.SetStateAction<ReturnType<typeof getDefaultFiltros>>>;
  dataset: RelatorioDataset;
  setPeriodo: (days: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <QuickButton label="Hoje" onClick={() => setPeriodo(0)} />
        <QuickButton
          label="Ontem"
          onClick={() =>
            setFiltros((f) => ({ ...f, dataInicial: isoDaysAgo(1), dataFinal: isoDaysAgo(1) }))
          }
        />
        <QuickButton label="Ultimos 7 dias" onClick={() => setPeriodo(6)} />
        <QuickButton label="Ultimos 30 dias" onClick={() => setPeriodo(29)} />
        <QuickButton
          label="Este mes"
          onClick={() =>
            setFiltros((f) => ({
              ...f,
              dataInicial: monthStartIso(0),
              dataFinal: isoDaysAgo(0),
            }))
          }
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <GestaoField label="Data inicial">
          <GestaoInput
            type="date"
            value={filtros.dataInicial}
            onChange={(e) => setFiltros((f) => ({ ...f, dataInicial: e.target.value }))}
          />
        </GestaoField>
        <GestaoField label="Data final">
          <GestaoInput
            type="date"
            value={filtros.dataFinal}
            onChange={(e) => setFiltros((f) => ({ ...f, dataFinal: e.target.value }))}
          />
        </GestaoField>

        {["vendas", "delivery", "operacao"].includes(report) ? (
          <GestaoField label="Canal">
            <GestaoSelect
              value={filtros.canal}
              onChange={(e) => setFiltros((f) => ({ ...f, canal: e.target.value }))}
            >
              <option value="todos">Todos</option>
              {["pdv", "mesas", "delivery", "qrcode", "whatsapp", "quero_delivery", "ifood"].map(
                (canal) => (
                  <option key={canal} value={canal}>
                    {labelCanal(canal)}
                  </option>
                ),
              )}
            </GestaoSelect>
          </GestaoField>
        ) : null}

        {["vendas", "financeiro", "operacao"].includes(report) ? (
          <GestaoField label="Pagamento">
            <GestaoSelect
              value={filtros.pagamento}
              onChange={(e) => setFiltros((f) => ({ ...f, pagamento: e.target.value }))}
            >
              <option value="todos">Todos</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="cartao">Cartao</option>
              <option value="online">Online</option>
            </GestaoSelect>
          </GestaoField>
        ) : null}

        {["vendas", "delivery", "produtos", "operacao"].includes(report) ? (
          <GestaoField label="Status">
            <GestaoSelect
              value={filtros.status}
              onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="todos">Todos</option>
              <option value="concluido">Concluido</option>
              <option value="cancelado">Cancelado</option>
              <option value="em_preparo">Em preparo</option>
              <option value="entregue">Entregue</option>
            </GestaoSelect>
          </GestaoField>
        ) : null}

        {["produtos", "estoque", "vendas"].includes(report) ? (
          <GestaoField label="Categoria">
            <GestaoSelect
              value={filtros.categoria}
              onChange={(e) => setFiltros((f) => ({ ...f, categoria: e.target.value }))}
            >
              <option value="todos">Todas</option>
              {[...new Set(dataset.produtos.map((produto) => produto.categoria))].map(
                (categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ),
              )}
            </GestaoSelect>
          </GestaoField>
        ) : null}

        {["produtos", "estoque", "vendas"].includes(report) ? (
          <GestaoField label="Produto">
            <GestaoInput
              value={filtros.produto}
              onChange={(e) => setFiltros((f) => ({ ...f, produto: e.target.value }))}
              placeholder="Buscar produto"
            />
          </GestaoField>
        ) : null}

        {["crm", "vendas"].includes(report) ? (
          <GestaoField label="Cliente">
            <GestaoInput
              value={filtros.cliente}
              onChange={(e) => setFiltros((f) => ({ ...f, cliente: e.target.value }))}
              placeholder="Buscar cliente"
            />
          </GestaoField>
        ) : null}

        {report === "delivery" ? (
          <GestaoField label="Motoboy">
            <GestaoSelect
              value={filtros.motoboy}
              onChange={(e) => setFiltros((f) => ({ ...f, motoboy: e.target.value }))}
            >
              <option value="todos">Todos</option>
              {dataset.motoboys.map((motoboy) => (
                <option key={motoboy.id} value={motoboy.id}>
                  {motoboy.nome}
                </option>
              ))}
            </GestaoSelect>
          </GestaoField>
        ) : null}

        {["operacao", "vendas"].includes(report) ? (
          <GestaoField label="Garcom / atendente">
            <GestaoSelect
              value={filtros.atendente}
              onChange={(e) => setFiltros((f) => ({ ...f, atendente: e.target.value }))}
            >
              <option value="todos">Todos</option>
              {dataset.atendentes.map((atendente) => (
                <option key={atendente.id} value={atendente.id}>
                  {atendente.nome}
                </option>
              ))}
            </GestaoSelect>
          </GestaoField>
        ) : null}
      </div>
    </div>
  );
}

function getReportPath(report: ReportKey) {
  const paths: Record<
    ReportKey,
    | "/painel/relatorios/vendas"
    | "/painel/relatorios/produtos"
    | "/painel/relatorios/delivery"
    | "/painel/relatorios/operacao"
    | "/painel/relatorios/financeiro"
    | "/painel/relatorios/crm"
    | "/painel/relatorios/estoque"
  > = {
    vendas: "/painel/relatorios/vendas",
    produtos: "/painel/relatorios/produtos",
    delivery: "/painel/relatorios/delivery",
    operacao: "/painel/relatorios/operacao",
    financeiro: "/painel/relatorios/financeiro",
    crm: "/painel/relatorios/crm",
    estoque: "/painel/relatorios/estoque",
  };

  return paths[report];
}

function getReportTitle(report: ReportKey) {
  const titles: Record<ReportKey, string> = {
    vendas: "Relatorio de vendas",
    produtos: "Relatorio de produtos",
    delivery: "Relatorio de delivery",
    operacao: "Relatorio de mesas e caixa",
    financeiro: "Relatorio financeiro e fiscal",
    crm: "Relatorio de clientes e campanhas",
    estoque: "Relatorio de estoque",
  };

  return titles[report];
}

function getReportCards(data: {
  totalFaturado: number;
  pedidosValidos: number;
  produtoTop: string;
  faturamentoDelivery: number;
  deliveryTotal: number;
  comandasFechadas: number;
  caixasCount: number;
  saldoCaixa: number;
  notasCount: number;
  clientesCount: number;
  clientesInativos: number;
  produtosBaixoEstoque: number;
  produtosSemEstoque: number;
}) {
  return [
    {
      key: "vendas" as const,
      title: "Relatorio de vendas",
      description: "Canal, horario, pagamento, crescimento e comparativos.",
      icon: <TrendingUp className="size-5" />,
      metrics: [formatBRL(data.totalFaturado), `${data.pedidosValidos} pedidos`],
    },
    {
      key: "produtos" as const,
      title: "Relatorio de produtos",
      description: "Mais vendidos, margem, cancelamento, preparo e giro.",
      icon: <CakeSlice className="size-5" />,
      metrics: [data.produtoTop, "mix e margem"],
    },
    {
      key: "delivery" as const,
      title: "Relatorio de delivery",
      description: "Bairros, motoboys, atrasos e canais de entrega.",
      icon: <Bike className="size-5" />,
      metrics: [formatBRL(data.faturamentoDelivery), `${data.deliveryTotal} entregas`],
    },
    {
      key: "operacao" as const,
      title: "Relatorio de mesas e caixa",
      description: "Mesas, comandas, garcons, operadores e picos.",
      icon: <ClipboardList className="size-5" />,
      metrics: [`${data.comandasFechadas} comandas`, `${data.caixasCount} caixas`],
    },
    {
      key: "financeiro" as const,
      title: "Relatorio financeiro e fiscal",
      description: "Fluxo, DRE, notas fiscais e XML.",
      icon: <Receipt className="size-5" />,
      metrics: [formatBRL(data.saldoCaixa), `${data.notasCount} notas`],
    },
    {
      key: "crm" as const,
      title: "Relatorio de clientes e campanhas",
      description: "Recorrencia, fidelidade, inativos e WhatsApp.",
      icon: <Users className="size-5" />,
      metrics: [`${data.clientesCount} clientes`, `${data.clientesInativos} inativos`],
    },
    {
      key: "estoque" as const,
      title: "Relatorio de estoque",
      description: "Alertas, perdas, sugestao de compra e custo.",
      icon: <Boxes className="size-5" />,
      metrics: [`${data.produtosBaixoEstoque} em alerta`, `${data.produtosSemEstoque} sem estoque`],
    },
  ];
}

function QuickButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <GestaoButton variant="secondary" size="sm" onClick={onClick}>
      {label}
    </GestaoButton>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <GestaoCard>
      <GestaoSectionTitle eyebrow="Graficos" title={title} description={subtitle} />
      <div className="mt-4">{children}</div>
    </GestaoCard>
  );
}

function RankingTable({ title, rows }: { title: string; rows: { nome: string; valor: string }[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-[color:var(--gestao-ink)]">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div
            key={`${title}-${row.nome}`}
            className="flex items-center justify-between rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 px-4 py-3"
          >
            <span className="text-sm text-[color:var(--gestao-ink)]">{row.nome}</span>
            <span className="text-sm text-muted-foreground">{row.valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--gestao-gold-deep)]">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl text-[color:var(--gestao-ink)]">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function MiniKpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <GestaoCard className="bg-[linear-gradient(180deg,white,var(--gestao-cream))]">
      <div className="mb-2 text-[color:var(--gestao-green)]">{icon}</div>
      <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--gestao-gold-deep)]">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl text-[color:var(--gestao-ink)]">{value}</p>
    </GestaoCard>
  );
}

function sum<T>(items: T[], field: keyof T) {
  return items.reduce((acc, item) => acc + Number(item[field] ?? 0), 0);
}

function average(values: number[]) {
  return values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
}

function aggregateBy<T>(items: T[], getLabel: (item: T) => string, getValue: (item: T) => number) {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const label = getLabel(item);
    map.set(label, (map.get(label) ?? 0) + getValue(item));
  });
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function aggregateItems(
  pedidos: RelatorioPedido[],
  getLabel: (item: RelatorioPedido["itens"][number]) => string,
  getValue: (item: RelatorioPedido["itens"][number]) => number,
) {
  const map = new Map<string, number>();
  pedidos.forEach((pedido) => {
    pedido.itens.forEach((item) => {
      const label = getLabel(item);
      map.set(label, (map.get(label) ?? 0) + getValue(item));
    });
  });
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function getProdutoRanking(pedidos: RelatorioPedido[], order: "desc" | "asc" = "desc") {
  const ranking = aggregateItems(
    pedidos.filter((pedido) => pedido.status !== "cancelado"),
    (item) => item.nome,
    (item) => item.quantidade,
  ).map((item) => ({ nome: item.label, quantidade: item.value }));
  return ranking.sort((a, b) =>
    order === "desc" ? b.quantidade - a.quantidade : a.quantidade - b.quantidade,
  );
}

function getProdutosFaturamento(pedidos: RelatorioPedido[]) {
  return aggregateItems(
    pedidos.filter((pedido) => pedido.status !== "cancelado"),
    (item) => item.nome,
    (item) => item.quantidade * item.precoUnitario,
  ).map((item) => ({ nome: item.label, valor: item.value }));
}

function getProdutosMaiorMargem(pedidos: RelatorioPedido[]) {
  const map = new Map<string, { receita: number; custo: number }>();
  pedidos
    .filter((pedido) => pedido.status !== "cancelado")
    .forEach((pedido) => {
      pedido.itens.forEach((item) => {
        const current = map.get(item.nome) ?? { receita: 0, custo: 0 };
        current.receita += item.quantidade * item.precoUnitario;
        current.custo += item.quantidade * item.custoUnitario;
        map.set(item.nome, current);
      });
    });
  return [...map.entries()]
    .map(([nome, dados]) => ({
      nome,
      margem: dados.receita ? ((dados.receita - dados.custo) / dados.receita) * 100 : 0,
    }))
    .sort((a, b) => b.margem - a.margem);
}

function getProdutosMargem(pedidos: RelatorioPedido[]) {
  return [...getProdutosMaiorMargem(pedidos)].sort((a, b) => a.margem - b.margem);
}

function getProdutosDetalhados(pedidos: RelatorioPedido[], dataset: RelatorioDataset) {
  return dataset.produtos
    .map((produto) => {
      const subset = pedidos.filter((pedido) =>
        pedido.itens.some((item) => item.produtoId === produto.id),
      );
      const vendidos = subset.filter((pedido) => pedido.status !== "cancelado");
      const cancelados = subset.filter((pedido) => pedido.status === "cancelado");
      const faturamento = vendidos.reduce(
        (sum, pedido) =>
          sum +
          pedido.itens
            .filter((item) => item.produtoId === produto.id)
            .reduce((acc, item) => acc + item.quantidade * item.precoUnitario, 0),
        0,
      );
      const custo = vendidos.reduce(
        (sum, pedido) =>
          sum +
          pedido.itens
            .filter((item) => item.produtoId === produto.id)
            .reduce((acc, item) => acc + item.quantidade * item.custoUnitario, 0),
        0,
      );
      return {
        nome: produto.nome,
        faturamento,
        margem: faturamento ? ((faturamento - custo) / faturamento) * 100 : 0,
        estoque: produto.estoque,
        cancelamento: subset.length ? (cancelados.length / subset.length) * 100 : 0,
        preparo: produto.tempoPreparo,
      };
    })
    .sort((a, b) => b.faturamento - a.faturamento);
}

function getRankingMotoboys(pedidos: RelatorioPedido[], dataset: RelatorioDataset) {
  return dataset.motoboys
    .map((motoboy) => {
      const subset = pedidos.filter(
        (pedido) => pedido.motoboyId === motoboy.id && pedido.status !== "cancelado",
      );
      const tempoMedio = average(subset.map((pedido) => pedido.tempoEntrega ?? 0).filter(Boolean));
      return {
        nome: motoboy.nome,
        entregas: subset.length,
        repasse: subset.length * motoboy.taxaBase,
        tempoMedio: Number(tempoMedio.toFixed(1)),
      };
    })
    .sort((a, b) => b.entregas - a.entregas);
}

function getRankingClientes(pedidos: RelatorioPedido[], dataset: RelatorioDataset) {
  return dataset.clientes
    .map((cliente) => {
      const subset = pedidos.filter(
        (pedido) => pedido.clienteId === cliente.id && pedido.status !== "cancelado",
      );
      const total = sum(subset, "total");
      return {
        nome: cliente.nome,
        total,
        pedidos: subset.length,
        pontos: cliente.pontos,
        ultimaCompra: cliente.ultimoPedidoDias,
        favorito: getProdutoFavorito(subset),
        bairro: cliente.bairro,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function getProdutoFavorito(pedidos: RelatorioPedido[]) {
  return getProdutoRanking(pedidos)[0]?.nome ?? "-";
}

function toSeriesByDay(pedidos: RelatorioPedido[]) {
  const map = new Map<string, number>();
  pedidos.forEach((pedido) => {
    const label = new Date(pedido.data).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    map.set(label, (map.get(label) ?? 0) + pedido.total);
  });
  return [...map.entries()].map(([label, valor]) => ({ label, valor }));
}

function toCashflowSeries(financeiro: RelatorioFinanceiro[]) {
  const map = new Map<string, { entradas: number; saidas: number }>();
  financeiro.forEach((item) => {
    const label = new Date(item.data).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    const current = map.get(label) ?? { entradas: 0, saidas: 0 };
    if (item.tipo === "entrada") current.entradas += item.valor;
    else current.saidas += item.valor;
    map.set(label, current);
  });
  return [...map.entries()].map(([label, value]) => ({ label, ...value }));
}

function compararPeriodo(
  pedidos: RelatorioPedido[],
  filtros: { dataInicial: string; dataFinal: string },
) {
  const inicio = new Date(`${filtros.dataInicial}T00:00:00`);
  const fim = new Date(`${filtros.dataFinal}T23:59:59`);
  const dias = Math.max(1, Math.round((+fim - +inicio) / 86400000) + 1);
  const anteriorFim = new Date(inicio);
  anteriorFim.setDate(anteriorFim.getDate() - 1);
  const anteriorInicio = new Date(anteriorFim);
  anteriorInicio.setDate(anteriorInicio.getDate() - (dias - 1));

  const subset = pedidos.filter((pedido) => {
    const data = new Date(pedido.data);
    return data >= anteriorInicio && data <= anteriorFim && pedido.status !== "cancelado";
  });

  return { total: sum(subset, "total"), pedidos: subset.length };
}

function productsLabel(value: number) {
  return value === 1 ? "1 produto" : `${value} produtos`;
}

function isSameDay(value: string, compare: Date) {
  const date = new Date(value);
  return date.toDateString() === compare.toDateString();
}

function startOfDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isoDaysAgo(days: number) {
  return startOfDaysAgo(days).toISOString().slice(0, 10);
}

function monthStartIso(monthsAgo: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo, 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function monthEndIso(monthsAgo: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo + 1, 0);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}
