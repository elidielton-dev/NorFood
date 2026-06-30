import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listarLancamentosFinanceiros, formatBRL, type LancamentoFinanceiro } from "@/lib/db";
import { fetchMercadoPagoPanelServer } from "@/lib/api/mercado-pago-panel.functions";
import { GestaoCard, GestaoPage, GestaoTable, GestaoTableHead } from "@/components/gestao-ui";
import { VendaDetalheModal } from "@/components/venda-detalhe-modal";
import { useTenantSlug } from "@/lib/tenant/tenant-context";
import { tenantQueryKey } from "@/lib/tenant/query-keys";

function isVendaLancamento(lancamento: LancamentoFinanceiro) {
  return Boolean(lancamento.pedido_id) || /pedido\s*#/i.test(lancamento.descricao);
}

export const Route = createFileRoute("/_authenticated/painel/financeiro/extratos")({
  component: FinanceiroExtratosPage,
});

function FinanceiroExtratosPage() {
  const tenantSlug = useTenantSlug();
  const [pedidoDetalheId, setPedidoDetalheId] = useState<string | null>(null);
  const { data: lancamentos = [] } = useQuery({
    queryKey: tenantQueryKey("financeiro", tenantSlug),
    queryFn: listarLancamentosFinanceiros,
  });
  const { data: mp } = useQuery({
    queryKey: tenantQueryKey("mp-panel", tenantSlug),
    queryFn: () => fetchMercadoPagoPanelServer(),
  });

  return (
    <>
    <GestaoPage
      title="Extratos"
      subtitle="Movimentacoes internas e transacoes Mercado Pago consolidadas"
    >
      <GestaoCard>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[color:var(--gestao-green)]">
          Lancamentos internos
        </h3>
        <GestaoTable>
          <GestaoTableHead>
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Descricao</th>
              <th className="p-3 text-right">Valor</th>
            </tr>
          </GestaoTableHead>
          <tbody>
            {lancamentos.map((l: LancamentoFinanceiro) => (
                <tr
                  key={l.id}
                  className={`border-t border-[color:var(--honey-line)] ${isVendaLancamento(l) && l.pedido_id ? "cursor-pointer transition hover:bg-[color:var(--gestao-cream)]/60" : ""}`}
                  onClick={() => {
                    if (isVendaLancamento(l) && l.pedido_id) setPedidoDetalheId(l.pedido_id);
                  }}
                >
                  <td className="p-3">{new Date(l.data).toLocaleDateString("pt-BR")}</td>
                  <td className="p-3">{l.descricao}</td>
                  <td className="p-3 text-right">{formatBRL(Number(l.valor))}</td>
                </tr>
              ))}
          </tbody>
        </GestaoTable>
      </GestaoCard>

      <GestaoCard>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[color:var(--gestao-green)]">
          Mercado Pago (30 dias)
        </h3>
        <GestaoTable>
          <GestaoTableHead>
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Referencia</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Valor</th>
            </tr>
          </GestaoTableHead>
          <tbody>
            {(mp?.recentPayments ?? []).map((payment) => (
              <tr key={payment.id} className="border-t border-[color:var(--honey-line)]">
                <td className="p-3">
                  {payment.createdAt ? new Date(payment.createdAt).toLocaleString("pt-BR") : "—"}
                </td>
                <td className="p-3">{payment.externalReference ?? payment.id}</td>
                <td className="p-3 capitalize">{payment.status}</td>
                <td className="p-3 text-right">{formatBRL(payment.amount)}</td>
              </tr>
            ))}
          </tbody>
        </GestaoTable>
      </GestaoCard>
    </GestaoPage>
    <VendaDetalheModal
      open={Boolean(pedidoDetalheId)}
      onClose={() => setPedidoDetalheId(null)}
      pedidoId={pedidoDetalheId}
    />
    </>
  );
}
